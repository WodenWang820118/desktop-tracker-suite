#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
  fs,
  io::Write,
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::{Arc, Mutex},
  thread,
  time::Duration,
};

use anyhow::{anyhow, Context, Result};
use tauri::{
  path::BaseDirectory, AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use url::Url;

const MAIN_WINDOW_LABEL: &str = "main";
const DEV_FRONTEND_URL: &str = "http://localhost:4200/";
const DEV_BACKEND_PORT: u16 = 3000;
const PACKAGED_BACKEND_PORT: u16 = 5000;
const DATABASE_FILE_NAME: &str = "tasks.sqlite";
const BUNDLED_NODE_RELATIVE_PATH: &str = "../../../dist/tauri-shell/resources/nodejs/node.exe";
const BUNDLED_BACKEND_ENTRY_RELATIVE_PATH: &str =
  "../../../dist/tauri-shell/resources/backend-runtime/main.js";
const BUNDLED_BACKEND_ROOT_RELATIVE_PATH: &str =
  "../../../dist/tauri-shell/resources/backend-runtime";
const STARTUP_ATTEMPTS: usize = 60;
const STARTUP_DELAY_MS: u64 = 1000;
const SHUTDOWN_POLL_MS: u64 = 250;
const SHUTDOWN_TIMEOUT_MS: u64 = 5000;
const TRACE_ENV_VAR: &str = "TAURI_SHELL_TRACE";
const TRACE_FILE_NAME: &str = "tauri-shell-startup.log";

#[derive(Clone, Default)]
struct BackendProcessState {
  child: Arc<Mutex<Option<Child>>>,
}

impl BackendProcessState {
  fn replace(&self, child: Child) {
    let mut guard = self.child.lock().expect("backend state mutex poisoned");
    *guard = Some(child);
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

fn main() {
  let backend_state = BackendProcessState::default();

  tauri::Builder::default()
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
        app.state::<BackendProcessState>().shutdown_blocking();
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
    backend_state.replace(child);

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

  Ok(app_data_dir.join(DATABASE_FILE_NAME))
}

fn spawn_packaged_backend(app: &AppHandle, port: u16, database_path: &Path) -> Result<Child> {
  let node_executable = normalize_spawn_path(
    app
      .path()
      .resolve(BUNDLED_NODE_RELATIVE_PATH, BaseDirectory::Resource)
      .context("failed to resolve the bundled Node runtime path")?,
  );
  let backend_root = normalize_spawn_path(
    app
      .path()
      .resolve(BUNDLED_BACKEND_ROOT_RELATIVE_PATH, BaseDirectory::Resource)
      .context("failed to resolve the bundled Nest backend root")?,
  );
  let backend_entry = normalize_spawn_path(
    app
      .path()
      .resolve(BUNDLED_BACKEND_ENTRY_RELATIVE_PATH, BaseDirectory::Resource)
      .context("failed to resolve the bundled Nest backend entrypoint")?,
  );
  trace_step(format!(
    "resolved packaged backend paths: node={}, backend_root={}, entry={}",
    node_executable.display(),
    backend_root.display(),
    backend_entry.display()
  ));

  if !node_executable.exists() {
    return Err(anyhow!(
      "embedded Node runtime was not found at {}",
      node_executable.display()
    ));
  }

  if !backend_entry.exists() {
    return Err(anyhow!(
      "packaged Nest backend entrypoint was not found at {}",
      backend_entry.display()
    ));
  }

  Command::new(&node_executable)
    .arg(&backend_entry)
    .current_dir(&backend_root)
    .env("PORT", port.to_string())
    .env("DATABASE_PATH", database_path)
    .env("NODE_ENV", "prod")
    .stdin(Stdio::null())
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit())
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
    .title("Tracker Suite Tauri")
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
