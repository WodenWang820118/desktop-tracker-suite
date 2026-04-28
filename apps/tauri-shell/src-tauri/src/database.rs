use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use serde::Serialize;
use tauri::{AppHandle, Manager};

const DATABASE_FILE_NAME: &str = "database.sqlite3";
const LEGACY_TAURI_DATABASE_FILE_NAME: &str = "tasks.sqlite";
const MIGRATION_STATE_FILE_NAME: &str = "migration-state.json";

#[derive(Serialize)]
struct MigrationState {
    status: String,
    source: Option<String>,
    database_path: String,
    details: Option<String>,
}

pub(crate) fn ensure_database_path(app: &AppHandle) -> Result<PathBuf> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve Tauri app data directory")?;
    prepare_database_path(&app_data_dir)
}

fn prepare_database_path(app_data_dir: &Path) -> Result<PathBuf> {
    fs::create_dir_all(app_data_dir).context("failed to create Tauri app data directory")?;
    let database_path = app_data_dir.join(DATABASE_FILE_NAME);
    if database_path.exists() {
        return Ok(database_path);
    }

    let migration_state_path = app_data_dir.join(MIGRATION_STATE_FILE_NAME);
    if migration_state_path.exists() {
        return Ok(database_path);
    }

    let legacy_tauri_database_path = app_data_dir.join(LEGACY_TAURI_DATABASE_FILE_NAME);
    if legacy_tauri_database_path.exists() {
        import_legacy_database(
            &legacy_tauri_database_path,
            &database_path,
            &migration_state_path,
            "legacy-tauri-preview",
            "Imported the preview Tauri database into the GA database location.",
        )?;
        return Ok(database_path);
    }

    write_migration_state(
    &migration_state_path,
    &MigrationState {
      status: "no-legacy-database-found".into(),
      source: None,
      database_path: database_path.display().to_string(),
      details: Some(
        "No legacy Tauri preview database was found; Desktop Tracker Suite will create a fresh database."
          .into(),
      ),
    },
  )?;

    Ok(database_path)
}

fn import_legacy_database(
    source_path: &Path,
    database_path: &Path,
    migration_state_path: &Path,
    status: &str,
    details: &str,
) -> Result<()> {
    fs::copy(source_path, database_path).with_context(|| {
        format!(
            "failed to import the legacy database from {} to {}",
            source_path.display(),
            database_path.display()
        )
    })?;

    write_migration_state(
        migration_state_path,
        &MigrationState {
            status: status.into(),
            source: Some(source_path.display().to_string()),
            database_path: database_path.display().to_string(),
            details: Some(details.into()),
        },
    )
}

fn write_migration_state(path: &Path, state: &MigrationState) -> Result<()> {
    let payload = format!(
        "{}\n",
        serde_json::to_string_pretty(state).context("failed to serialize migration state")?
    );
    fs::write(path, payload).with_context(|| {
        format!(
            "failed to write the desktop migration marker at {}",
            path.display()
        )
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::{Path, PathBuf},
        process,
        sync::atomic::{AtomicUsize, Ordering},
    };

    use serde_json::Value;

    use super::{
        prepare_database_path, DATABASE_FILE_NAME, LEGACY_TAURI_DATABASE_FILE_NAME,
        MIGRATION_STATE_FILE_NAME,
    };

    static TEST_DIR_COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            let unique_name = format!(
                "tauri-shell-database-tests-{}-{}",
                process::id(),
                TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed)
            );
            let path = env::temp_dir().join(unique_name);
            fs::create_dir_all(&path).expect("failed to create test directory");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn prepare_database_path_returns_existing_database() {
        let temp_dir = TestDir::new();
        let database_path = temp_dir.path().join(DATABASE_FILE_NAME);
        fs::write(&database_path, "existing-db").expect("failed to seed database file");

        let resolved_path =
            prepare_database_path(temp_dir.path()).expect("expected database path to resolve");

        assert_eq!(resolved_path, database_path);
        assert_eq!(
            fs::read_to_string(&database_path).expect("failed to read database file"),
            "existing-db"
        );
        assert!(!temp_dir.path().join(MIGRATION_STATE_FILE_NAME).exists());
    }

    #[test]
    fn prepare_database_path_imports_legacy_database() {
        let temp_dir = TestDir::new();
        let legacy_path = temp_dir.path().join(LEGACY_TAURI_DATABASE_FILE_NAME);
        fs::write(&legacy_path, "legacy-db").expect("failed to seed legacy database");

        let resolved_path =
            prepare_database_path(temp_dir.path()).expect("expected legacy import to succeed");
        let migration_state_path = temp_dir.path().join(MIGRATION_STATE_FILE_NAME);
        let migration_state: Value = serde_json::from_str(
            &fs::read_to_string(&migration_state_path).expect("failed to read migration marker"),
        )
        .expect("failed to parse migration marker");
        let resolved_path_display = resolved_path.to_string_lossy().to_string();

        assert_eq!(resolved_path, temp_dir.path().join(DATABASE_FILE_NAME));
        assert!(resolved_path.exists());
        assert_eq!(
            fs::read_to_string(&resolved_path).expect("failed to read imported database"),
            "legacy-db"
        );
        assert_eq!(
            migration_state["status"].as_str(),
            Some("legacy-tauri-preview")
        );
        assert_eq!(
            migration_state["source"].as_str(),
            Some(legacy_path.to_string_lossy().as_ref())
        );
        assert_eq!(
            migration_state["database_path"].as_str(),
            Some(resolved_path_display.as_str())
        );
        assert_eq!(
            migration_state["details"].as_str(),
            Some("Imported the preview Tauri database into the GA database location.")
        );
        assert!(legacy_path.exists());
    }

    #[test]
    fn prepare_database_path_respects_existing_migration_marker() {
        let temp_dir = TestDir::new();
        let migration_state_path = temp_dir.path().join(MIGRATION_STATE_FILE_NAME);
        let original_marker = "{\n  \"status\": \"already-migrated\"\n}\n";
        fs::write(&migration_state_path, original_marker).expect("failed to seed migration marker");

        let resolved_path =
            prepare_database_path(temp_dir.path()).expect("expected path to resolve successfully");

        assert_eq!(resolved_path, temp_dir.path().join(DATABASE_FILE_NAME));
        assert!(!resolved_path.exists());
        assert_eq!(
            fs::read_to_string(migration_state_path).expect("failed to reread migration marker"),
            original_marker
        );
    }

    #[test]
    fn prepare_database_path_prioritizes_existing_migration_marker_over_legacy_db() {
        let temp_dir = TestDir::new();
        let migration_state_path = temp_dir.path().join(MIGRATION_STATE_FILE_NAME);
        let legacy_path = temp_dir.path().join(LEGACY_TAURI_DATABASE_FILE_NAME);
        let original_marker = "{\n  \"status\": \"already-migrated\"\n}\n";
        fs::write(&migration_state_path, original_marker).expect("failed to seed migration marker");
        fs::write(&legacy_path, "legacy-db").expect("failed to seed legacy database");

        let resolved_path =
            prepare_database_path(temp_dir.path()).expect("expected path to resolve successfully");

        assert_eq!(resolved_path, temp_dir.path().join(DATABASE_FILE_NAME));
        assert!(!resolved_path.exists());
        assert_eq!(
            fs::read_to_string(migration_state_path).expect("failed to reread migration marker"),
            original_marker
        );
        assert_eq!(
            fs::read_to_string(legacy_path).expect("failed to reread legacy database"),
            "legacy-db"
        );
    }

    #[test]
    fn prepare_database_path_writes_no_legacy_marker_when_needed() {
        let temp_dir = TestDir::new();

        let resolved_path =
            prepare_database_path(temp_dir.path()).expect("expected path preparation to succeed");
        let migration_state_path = temp_dir.path().join(MIGRATION_STATE_FILE_NAME);
        let migration_state: Value = serde_json::from_str(
            &fs::read_to_string(&migration_state_path).expect("failed to read migration marker"),
        )
        .expect("failed to parse migration marker");
        let resolved_path_display = resolved_path.to_string_lossy().to_string();

        assert_eq!(resolved_path, temp_dir.path().join(DATABASE_FILE_NAME));
        assert!(!resolved_path.exists());
        assert_eq!(
            migration_state["status"].as_str(),
            Some("no-legacy-database-found")
        );
        assert!(migration_state["source"].is_null());
        assert_eq!(
            migration_state["database_path"].as_str(),
            Some(resolved_path_display.as_str())
        );
        assert_eq!(
            migration_state["details"].as_str(),
            Some(
                "No legacy Tauri preview database was found; Desktop Tracker Suite will create a fresh database."
            )
        );
    }
}
