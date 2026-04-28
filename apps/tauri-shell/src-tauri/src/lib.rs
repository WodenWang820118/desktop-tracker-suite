mod app;
mod backend;
mod database;
mod diagnostics;
mod window;

use tauri::{Manager, RunEvent};

pub fn run() {
    let app = app::build_tauri_app().expect("error while building Tauri application");
    app.run(|app, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            app.state::<backend::BackendProcessState>()
                .inner()
                .shutdown_blocking();
        }
    });
}
