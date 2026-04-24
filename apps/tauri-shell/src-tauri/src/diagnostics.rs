use std::{fs, io::Write};

const TRACE_ENV_VAR: &str = "TAURI_SHELL_TRACE";
const TRACE_FILE_NAME: &str = "tauri-shell-startup.log";

pub(crate) fn trace_step(message: impl AsRef<str>) {
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
