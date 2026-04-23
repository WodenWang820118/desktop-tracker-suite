use std::{fs, path::PathBuf};

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager};

const BUNDLED_NODE_DIRECTORY: &str = "nodejs";
const BUNDLED_BACKEND_DIRECTORY: &str = "backend-runtime";
const BACKEND_ENTRY_FILE_NAME: &str = "main.js";
const BACKEND_LOG_FILE_NAME: &str = "backend-runtime.log";

pub(crate) struct PackagedRuntimePaths {
    pub(crate) node_executable: PathBuf,
    pub(crate) backend_root: PathBuf,
    pub(crate) backend_entry: PathBuf,
    pub(crate) backend_log_path: PathBuf,
}

pub(crate) fn resolve_packaged_runtime_paths(app: &AppHandle) -> Result<PackagedRuntimePaths> {
    let resource_dir = normalize_spawn_path(
        app.path()
            .resource_dir()
            .context("failed to resolve the bundled Tauri resource directory")?,
    );
    let backend_root = normalize_spawn_path(resource_dir.join(BUNDLED_BACKEND_DIRECTORY));
    let backend_entry = normalize_spawn_path(backend_root.join(BACKEND_ENTRY_FILE_NAME));
    let node_executable = normalize_spawn_path(
        resource_dir
            .join(BUNDLED_NODE_DIRECTORY)
            .join(if cfg!(windows) { "node.exe" } else { "node" }),
    );
    let app_log_dir = app
        .path()
        .app_log_dir()
        .context("failed to resolve Tracker Suite log directory")?;
    fs::create_dir_all(&app_log_dir).context("failed to create Tracker Suite log directory")?;

    Ok(PackagedRuntimePaths {
        node_executable,
        backend_root,
        backend_entry,
        backend_log_path: app_log_dir.join(BACKEND_LOG_FILE_NAME),
    })
}

fn normalize_spawn_path(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let value = path.to_string_lossy();
        if let Some(stripped) = value.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }

    path
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::normalize_spawn_path;

    #[test]
    fn normalize_spawn_path_preserves_regular_paths() {
        let path = PathBuf::from(Path::new("backend-runtime").join("main.js"));
        assert_eq!(normalize_spawn_path(path.clone()), path);
    }

    #[cfg(not(windows))]
    #[test]
    fn normalize_spawn_path_preserves_unix_absolute_paths() {
        let path = PathBuf::from("/usr/local/bin/node");
        assert_eq!(normalize_spawn_path(path.clone()), path);
    }

    #[cfg(windows)]
    #[test]
    fn normalize_spawn_path_strips_windows_unc_prefix() {
        assert_eq!(
            normalize_spawn_path(PathBuf::from(
                r"\\?\C:\tracker-suite\backend-runtime\main.js"
            )),
            PathBuf::from(r"C:\tracker-suite\backend-runtime\main.js")
        );
    }

    #[cfg(windows)]
    #[test]
    fn normalize_spawn_path_preserves_windows_absolute_paths() {
        let path = PathBuf::from(r"C:\tracker-suite\backend-runtime\main.js");
        assert_eq!(normalize_spawn_path(path.clone()), path);
    }
}
