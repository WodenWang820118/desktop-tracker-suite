#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
  env,
  fs,
  io::Write,
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::{Arc, Mutex},
  thread,
  time::Duration,
};

use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use url::Url;

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;
#[cfg(windows)]
use windows_sys::Win32::{
  Foundation::{CloseHandle, HANDLE},
  System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
  },
};

const MAIN_WINDOW_LABEL: &str = "main";
const DEV_FRONTEND_URL: &str = "http://localhost:4200/";
const DEV_BACKEND_PORT: u16 = 3000;
const PACKAGED_BACKEND_PORT: u16 = 5000;
const PRODUCT_NAME: &str = "Tracker Suite";
const DATABASE_FILE_NAME: &str = "database.sqlite3";
const LEGACY_TAURI_DATABASE_FILE_NAME: &str = "tasks.sqlite";
const MIGRATION_STATE_FILE_NAME: &str = "migration-state.json";
const BUNDLED_NODE_DIRECTORY: &str = "nodejs";
const BUNDLED_BACKEND_DIRECTORY: &str = "backend-runtime";
const BACKEND_ENTRY_FILE_NAME: &str = "main.js";
const BACKEND_LOG_FILE_NAME: &str = "backend-runtime.log";
const STARTUP_ATTEMPTS: usize = 60;
const STARTUP_DELAY_MS: u64 = 1000;
const SHUTDOWN_POLL_MS: u64 = 250;
const SHUTDOWN_TIMEOUT_MS: u64 = 5000;
const TRACE_ENV_VAR: &str = "TAURI_SHELL_TRACE";
const TRACE_FILE_NAME: &str = "tauri-shell-startup.log";
const LEGACY_INSTALL_NAME_MARKERS: &[&str] = &["electron-tracker-suite", "tracker-suite"];

#[derive(Clone)]
struct BackendProcessState {
  child: Arc<Mutex<Option<Child>>>,
  #[cfg(windows)]
  job: Arc<WindowsKillOnCloseJob>,
}

impl BackendProcessState {
  fn new() -> Result<Self> {
    Ok(Self {
      child: Arc::new(Mutex::new(None)),
      #[cfg(windows)]
      job: Arc::new(WindowsKillOnCloseJob::new()?),
    })
  }

  fn replace(&self, child: Child) -> Result<()> {
    #[cfg(windows)]
    self.job.attach(&child)?;

    let mut guard = self.child.lock().expect("backend state mutex poisoned");
    *guard = Some(child);
    Ok(())
  }

  fn take(&self) -> Option<Child> {
    let mut guard = self.child.lock().expect("backend state mutex poisoned");
    guard.take()
  }

  fn shutdown_blocking(&self) {
    if let Some(mut child) = self.take() {
      let _ = terminate_child(&mut child);
    }
  }
}

#[cfg(windows)]
struct WindowsKillOnCloseJob {
  handle: isize,
}

#[cfg(windows)]
impl WindowsKillOnCloseJob {
  fn new() -> Result<Self> {
    let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) } as isize;
    if handle == 0 {
      return Err(std::io::Error::last_os_error())
        .context("failed to create the Windows backend job object");
    }

    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let limits_size = u32::try_from(std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>())
      .context("failed to convert Windows job object limit size")?;
    let configured = unsafe {
      SetInformationJobObject(
        handle as HANDLE,
        JobObjectExtendedLimitInformation,
        &mut limits as *mut _ as *mut _,
        limits_size,
      )
    };

    if configured == 0 {
      unsafe {
        CloseHandle(handle as HANDLE);
      }

      return Err(std::io::Error::last_os_error()).context(
        "failed to configure the Windows backend job object for kill-on-close",
      );
    }

    Ok(Self { handle })
  }

  fn attach(&self, child: &Child) -> Result<()> {
    let attached =
      unsafe { AssignProcessToJobObject(self.handle as HANDLE, child.as_raw_handle() as HANDLE) };
    if attached == 0 {
      return Err(std::io::Error::last_os_error()).context(
        "failed to attach the packaged backend process to the Windows kill-on-close job object",
      );
    }

    Ok(())
  }
}

#[cfg(windows)]
impl Drop for WindowsKillOnCloseJob {
  fn drop(&mut self) {
    if self.handle != 0 {
      unsafe {
        CloseHandle(self.handle as HANDLE);
      }
    }
  }
}

struct PackagedRuntimePaths {
  node_executable: PathBuf,
  backend_root: PathBuf,
  backend_entry: PathBuf,
  backend_log_path: PathBuf,
}

#[derive(Serialize)]
struct MigrationState {
  status: String,
  source: Option<String>,
  database_path: String,
  details: Option<String>,
}

fn main() {
  let backend_state =
    BackendProcessState::new().expect("failed to initialize backend process state");
  let mut updater_builder = tauri_plugin_updater::Builder::new();
  if let Some(pubkey) = option_env!("TAURI_UPDATER_PUBKEY").filter(|value| !value.trim().is_empty())
  {
    updater_builder = updater_builder.pubkey(pubkey);
  }

  tauri::Builder::default()
    .plugin(updater_builder.build())
    .manage(backend_state.clone())
    .setup(move |app| {
      let app_handle = app.handle().clone();
      let startup_state = backend_state.clone();

      tauri::async_runtime::spawn(async move {
        trace_step("setup task spawned");
        if let Err(error) = launch_application(app_handle.clone(), startup_state).await {
          trace_step(format!("launch_application failed: {error:#}"));
          eprintln!("Failed to launch Tauri shell: {error:#}");
          app_handle.exit(1);
        }
      });

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building Tauri application")
    .run(|app, event| {
      if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
        app.state::<BackendProcessState>().inner().shutdown_blocking();
      }
    });
}

async fn launch_application(app: AppHandle, backend_state: BackendProcessState) -> Result<()> {
  let backend_port = if tauri::is_dev() {
    DEV_BACKEND_PORT
  } else {
    PACKAGED_BACKEND_PORT
  };
  let task_api_url = format!("http://localhost:{backend_port}/tasks");
  trace_step(format!(
    "launch_application entered (is_dev={}, backend_port={backend_port})",
    tauri::is_dev()
  ));

  if tauri::is_dev() {
    trace_step("waiting for dev backend");
    wait_for_backend_ready(backend_port).await?;
  } else {
    trace_step("resolving packaged database path");
    let database_path = ensure_database_path(&app)?;
    trace_step(format!("database path resolved: {}", database_path.display()));
    let child = spawn_packaged_backend(&app, backend_port, &database_path)?;
    trace_step("packaged backend spawned");
    backend_state.replace(child)?;

    if let Err(error) = wait_for_backend_ready(backend_port).await {
      trace_step(format!("packaged backend health-check failed: {error:#}"));
      backend_state.shutdown_blocking();
      return Err(error);
    }
  }

  trace_step("backend is healthy; creating main window");
  create_main_window(&app, &task_api_url)?;
  trace_step("main window created");
  Ok(())
}

fn ensure_database_path(app: &AppHandle) -> Result<PathBuf> {
  let app_data_dir = app
    .path()
    .app_data_dir()
    .context("failed to resolve Tauri app data directory")?;
  fs::create_dir_all(&app_data_dir).context("failed to create Tauri app data directory")?;
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

  for candidate in resolve_legacy_database_candidates(&app_data_dir) {
    if !candidate.exists() {
      continue;
    }

    import_legacy_database(
      &candidate,
      &database_path,
      &migration_state_path,
      "legacy-electron",
      "Imported a legacy Electron database snapshot into the GA database location.",
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
        "No legacy Tauri preview or Electron bridge database was found; Tracker Suite will create a fresh database.".into(),
      ),
    },
  )?;

  Ok(database_path)
}

fn spawn_packaged_backend(app: &AppHandle, port: u16, database_path: &Path) -> Result<Child> {
  let runtime_paths = resolve_packaged_runtime_paths(app)?;
  trace_step(format!(
    "resolved packaged backend paths: node={}, backend_root={}, entry={}, log={}",
    runtime_paths.node_executable.display(),
    runtime_paths.backend_root.display(),
    runtime_paths.backend_entry.display(),
    runtime_paths.backend_log_path.display(),
  ));

  if !runtime_paths.node_executable.exists() {
    return Err(anyhow!(
      "embedded Node runtime was not found at {}",
      runtime_paths.node_executable.display()
    ));
  }

  if !runtime_paths.backend_entry.exists() {
    return Err(anyhow!(
      "packaged Nest backend entrypoint was not found at {}",
      runtime_paths.backend_entry.display()
    ));
  }

  let stdout_log = fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&runtime_paths.backend_log_path)
    .with_context(|| {
      format!(
        "failed to open the backend runtime log file at {}",
        runtime_paths.backend_log_path.display()
      )
    })?;
  let stderr_log = stdout_log
    .try_clone()
    .context("failed to duplicate the backend runtime log file handle")?;

  Command::new(&runtime_paths.node_executable)
    .arg(&runtime_paths.backend_entry)
    .current_dir(&runtime_paths.backend_root)
    .env("PORT", port.to_string())
    .env("DATABASE_PATH", database_path)
    .env("NODE_ENV", "prod")
    .stdin(Stdio::null())
    .stdout(Stdio::from(stdout_log))
    .stderr(Stdio::from(stderr_log))
    .spawn()
    .context("failed to spawn the packaged Nest backend")
}

async fn wait_for_backend_ready(port: u16) -> Result<()> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_millis(1500))
    .build()
    .context("failed to create backend health-check client")?;
  let health_url = format!("http://127.0.0.1:{port}/health");
  trace_step(format!("waiting for backend health at {health_url}"));

  for attempt in 1..=STARTUP_ATTEMPTS {
    match client.get(&health_url).send().await {
      Ok(response) if response.status().is_success() => {
        trace_step(format!("backend health-check passed on attempt {attempt}"));
        return Ok(());
      }
      Ok(response) => {
        eprintln!(
          "Backend health-check attempt {attempt} returned status {}",
          response.status()
        );
      }
      Err(error) => {
        eprintln!("Backend health-check attempt {attempt} failed: {error}");
      }
    }

    tokio::time::sleep(Duration::from_millis(STARTUP_DELAY_MS)).await;
  }

  Err(anyhow!("backend did not become ready at {health_url}"))
}

fn create_main_window(app: &AppHandle, task_api_url: &str) -> Result<()> {
  if app.get_webview_window(MAIN_WINDOW_LABEL).is_some() {
    return Ok(());
  }

  let encoded_task_api_url =
    url::form_urlencoded::byte_serialize(task_api_url.as_bytes()).collect::<String>();
  let webview_url = if tauri::is_dev() {
    let dev_url = format!("{DEV_FRONTEND_URL}?taskApiUrl={encoded_task_api_url}");
    WebviewUrl::External(Url::parse(&dev_url).context("failed to parse Tauri dev URL")?)
  } else {
    let packaged_url = format!("tauri://localhost/index.html?taskApiUrl={encoded_task_api_url}");
    trace_step(format!("packaged window URL: {packaged_url}"));
    WebviewUrl::CustomProtocol(
      Url::parse(&packaged_url).context("failed to parse the packaged Tauri app URL")?,
    )
  };

  let builder = WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, webview_url)
    .title(PRODUCT_NAME)
    .inner_size(1280.0, 800.0)
    .min_inner_size(1024.0, 720.0)
    .resizable(true);

  builder
    .build()
    .context("failed to create Tauri main window")?;

  Ok(())
}

fn terminate_child(child: &mut Child) -> Result<()> {
  if child.try_wait()?.is_some() {
    return Ok(());
  }
  trace_step(format!("terminating backend child pid={}", child.id()));

  #[cfg(windows)]
  {
    let _ = Command::new("taskkill")
      .args(["/PID", &child.id().to_string(), "/T"])
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();

    for _ in 0..(SHUTDOWN_TIMEOUT_MS / SHUTDOWN_POLL_MS) {
      if child.try_wait()?.is_some() {
        return Ok(());
      }

      thread::sleep(Duration::from_millis(SHUTDOWN_POLL_MS));
    }

    let _ = Command::new("taskkill")
      .args(["/PID", &child.id().to_string(), "/T", "/F"])
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();

    let _ = child.try_wait()?;
    return Ok(());
  }

  #[cfg(not(windows))]
  {
    child.kill().context("failed to terminate the Nest backend")?;

    for _ in 0..(SHUTDOWN_TIMEOUT_MS / SHUTDOWN_POLL_MS) {
      if child.try_wait()?.is_some() {
        return Ok(());
      }

      thread::sleep(Duration::from_millis(SHUTDOWN_POLL_MS));
    }

    let _ = child.kill();
    Ok(())
  }
}

fn resolve_packaged_runtime_paths(app: &AppHandle) -> Result<PackagedRuntimePaths> {
  let resource_dir = normalize_spawn_path(
    app
      .path()
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

fn resolve_legacy_database_candidates(app_data_dir: &Path) -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  push_unique_path(
    &mut candidates,
    app_data_dir.join("migrations").join("electron").join(DATABASE_FILE_NAME),
  );
  push_unique_path(
    &mut candidates,
    app_data_dir
      .join("migrations")
      .join("electron")
      .join(LEGACY_TAURI_DATABASE_FILE_NAME),
  );

  if let Some(system_root) = system_app_data_root() {
    for app_name in ["Tracker Suite", "tracker-suite", "electron-tracker-suite"] {
      push_unique_path(
        &mut candidates,
        system_root
          .join(app_name)
          .join("migrations")
          .join("electron")
          .join(DATABASE_FILE_NAME),
      );
      push_unique_path(
        &mut candidates,
        system_root
          .join(app_name)
          .join("migrations")
          .join("electron")
          .join(LEGACY_TAURI_DATABASE_FILE_NAME),
      );
    }
  }

  candidates.extend(resolve_legacy_install_database_candidates());
  candidates
}

fn resolve_legacy_install_database_candidates() -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  #[cfg(target_os = "windows")]
  {
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
      collect_legacy_install_candidates(
        &PathBuf::from(local_app_data).join("Programs"),
        &[
          "resources/nest-backend/database.sqlite3",
          "resources/backend-runtime/database.sqlite3",
        ],
        &mut candidates,
      );
    }

    if let Some(program_files) = env::var_os("ProgramFiles") {
      collect_legacy_install_candidates(
        &PathBuf::from(program_files),
        &[
          "resources/nest-backend/database.sqlite3",
          "resources/backend-runtime/database.sqlite3",
        ],
        &mut candidates,
      );
    }
  }

  #[cfg(target_os = "macos")]
  {
    collect_legacy_install_candidates(
      Path::new("/Applications"),
      &[
        "Contents/Resources/nest-backend/database.sqlite3",
        "Contents/Resources/backend-runtime/database.sqlite3",
      ],
      &mut candidates,
    );

    if let Some(home) = env::var_os("HOME") {
      collect_legacy_install_candidates(
        &PathBuf::from(home).join("Applications"),
        &[
          "Contents/Resources/nest-backend/database.sqlite3",
          "Contents/Resources/backend-runtime/database.sqlite3",
        ],
        &mut candidates,
      );
    }
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    collect_legacy_install_candidates(
      Path::new("/opt"),
      &[
        "resources/nest-backend/database.sqlite3",
        "resources/backend-runtime/database.sqlite3",
      ],
      &mut candidates,
    );

    if let Some(home) = env::var_os("HOME") {
      collect_legacy_install_candidates(
        &PathBuf::from(home).join(".local").join("share"),
        &[
          "resources/nest-backend/database.sqlite3",
          "resources/backend-runtime/database.sqlite3",
        ],
        &mut candidates,
      );
    }
  }

  candidates
}

fn collect_legacy_install_candidates(
  base_dir: &Path,
  relative_paths: &[&str],
  candidates: &mut Vec<PathBuf>,
) {
  let entries = match fs::read_dir(base_dir) {
    Ok(entries) => entries,
    Err(_) => return,
  };

  for entry in entries.flatten() {
    let file_name = entry.file_name();
    let file_name = file_name.to_string_lossy().to_lowercase();
    if !LEGACY_INSTALL_NAME_MARKERS
      .iter()
      .any(|marker| file_name.contains(marker))
    {
      continue;
    }

    for relative_path in relative_paths {
      push_unique_path(candidates, entry.path().join(relative_path));
    }
  }
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
  if !paths.iter().any(|existing| existing == &path) {
    paths.push(path);
  }
}

fn system_app_data_root() -> Option<PathBuf> {
  #[cfg(target_os = "windows")]
  {
    return env::var_os("APPDATA").map(PathBuf::from);
  }

  #[cfg(target_os = "macos")]
  {
    return env::var_os("HOME")
      .map(PathBuf::from)
      .map(|home| home.join("Library").join("Application Support"));
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    return env::var_os("XDG_DATA_HOME")
      .map(PathBuf::from)
      .or_else(|| env::var_os("HOME").map(PathBuf::from).map(|home| home.join(".local").join("share")));
  }

  #[allow(unreachable_code)]
  None
}

fn trace_step(message: impl AsRef<str>) {
  if std::env::var_os(TRACE_ENV_VAR).is_none() {
    return;
  }

  let trace_path = std::env::temp_dir().join(TRACE_FILE_NAME);
  let line = format!("{}\n", message.as_ref());

  if let Ok(mut file) = fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(trace_path)
  {
    let _ = file.write_all(line.as_bytes());
  }
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
