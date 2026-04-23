use anyhow::{Context, Result};
use tauri::{App, AppHandle, Manager};

use crate::{
    backend::{spawn_packaged_backend, wait_for_backend_ready, BackendProcessState},
    database::ensure_database_path,
    diagnostics::trace_step,
    window::create_main_window,
};

const DEV_BACKEND_PORT: u16 = 3000;
const PACKAGED_BACKEND_PORT: u16 = 5000;

pub(crate) fn build_tauri_app() -> Result<App> {
    let backend_state =
        BackendProcessState::new().context("failed to initialize backend process state")?;
    let mut updater_builder = tauri_plugin_updater::Builder::new();
    if let Some(pubkey) =
        option_env!("TAURI_UPDATER_PUBKEY").filter(|value| !value.trim().is_empty())
    {
        updater_builder = updater_builder.pubkey(pubkey);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(updater_builder.build())
        .manage(backend_state)
        .setup(|app| {
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                trace_step("setup task spawned");
                if let Err(error) = launch_application(app_handle.clone()).await {
                    trace_step(format!("launch_application failed: {error:#}"));
                    eprintln!("Failed to launch Tauri shell: {error:#}");
                    app_handle.exit(1);
                }
            });

            Ok(())
        })
        // `generate_context!` resolves the same `tauri.conf.json` for both lib and bin targets.
        .build(tauri::generate_context!())
        .context("error while building Tauri application")
}

async fn launch_application(app: AppHandle) -> Result<()> {
    let is_dev = tauri::is_dev();
    let backend_port = if is_dev {
        DEV_BACKEND_PORT
    } else {
        PACKAGED_BACKEND_PORT
    };
    let task_api_url = format!("http://localhost:{backend_port}/tasks");
    trace_step(format!(
        "launch_application entered (is_dev={is_dev}, backend_port={backend_port})"
    ));

    if is_dev {
        trace_step("waiting for dev backend");
        wait_for_backend_ready(backend_port).await?;
    } else {
        trace_step("resolving packaged database path");
        let database_path = ensure_database_path(&app)?;
        trace_step(format!(
            "database path resolved: {}",
            database_path.display()
        ));
        let child = spawn_packaged_backend(&app, backend_port, &database_path)?;
        trace_step("packaged backend spawned");
        app.state::<BackendProcessState>().replace(child)?;

        if let Err(error) = wait_for_backend_ready(backend_port).await {
            trace_step(format!("packaged backend health-check failed: {error:#}"));
            app.state::<BackendProcessState>()
                .inner()
                .shutdown_blocking();
            return Err(error);
        }
    }

    trace_step("backend is healthy; creating main window");
    create_main_window(&app, &task_api_url)?;
    trace_step("main window created");
    Ok(())
}
