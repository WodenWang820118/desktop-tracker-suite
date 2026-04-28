use std::{
    fs,
    io::Write,
    path::Path,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use tauri::AppHandle;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

use crate::diagnostics::trace_step;

use super::paths::{resolve_packaged_runtime_paths, PackagedRuntimeKind, PackagedRuntimePaths};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, WAIT_TIMEOUT},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        Threading::{
            OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA,
            PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
        },
    },
};

const SHUTDOWN_POLL_MS: u64 = 250;
const SHUTDOWN_TIMEOUT_MS: u64 = 5000;

pub(crate) struct BackendProcessState {
    child: Mutex<Option<ManagedBackendChild>>,
    #[cfg(windows)]
    job: WindowsKillOnCloseJob,
}

pub(crate) enum ManagedBackendChild {
    Std(Child),
    Shell { child: CommandChild, pid: u32 },
}

impl BackendProcessState {
    pub(crate) fn new() -> Result<Self> {
        Ok(Self {
            child: Mutex::new(None),
            #[cfg(windows)]
            job: WindowsKillOnCloseJob::new()?,
        })
    }

    pub(crate) fn replace(&self, child: ManagedBackendChild) -> Result<()> {
        #[cfg(windows)]
        self.job.attach_pid(child.pid())?;

        let previous = {
            let mut guard = self.child.lock().expect("backend state mutex poisoned");
            guard.replace(child)
        };

        if let Some(previous) = previous {
            trace_step(format!(
                "replacing an existing backend child pid={}; terminating the previous process",
                previous.pid()
            ));
            terminate_child(previous)?;
        }

        Ok(())
    }

    fn take(&self) -> Option<ManagedBackendChild> {
        let mut guard = self.child.lock().expect("backend state mutex poisoned");
        guard.take()
    }

    pub(crate) fn shutdown_blocking(&self) {
        if let Some(child) = self.take() {
            let _ = terminate_child(child);
        }
    }
}

impl ManagedBackendChild {
    fn pid(&self) -> u32 {
        match self {
            Self::Std(child) => child.id(),
            Self::Shell { pid, .. } => *pid,
        }
    }
}

pub(crate) fn spawn_packaged_backend(
    app: &AppHandle,
    port: u16,
    database_path: &Path,
) -> Result<ManagedBackendChild> {
    let runtime_paths = resolve_packaged_runtime_paths(app)?;
    match runtime_paths {
        PackagedRuntimePaths::ResourceNode {
            backend_kind,
            node_executable,
            backend_root,
            backend_entry,
            backend_log_path,
        } => {
            trace_step(format!(
                "resolved packaged {} resource backend paths: node={}, backend_root={}, entry={}, log={}",
                backend_kind_label(backend_kind),
                node_executable.display(),
                backend_root.display(),
                backend_entry.display(),
                backend_log_path.display(),
            ));

            if !node_executable.exists() {
                return Err(anyhow!(
                    "embedded Node runtime was not found at {}",
                    node_executable.display()
                ));
            }

            if !backend_entry.exists() {
                return Err(anyhow!(
                    "packaged {} backend entrypoint was not found at {}",
                    backend_kind_label(backend_kind),
                    backend_entry.display()
                ));
            }

            let (stdout_log, stderr_log) = open_backend_log_handles(&backend_log_path)?;
            let child = Command::new(&node_executable)
                .arg(&backend_entry)
                .current_dir(&backend_root)
                .env("PORT", port.to_string())
                .env("DATABASE_PATH", database_path)
                .env("NODE_ENV", "prod")
                .stdin(Stdio::null())
                .stdout(Stdio::from(stdout_log))
                .stderr(Stdio::from(stderr_log))
                .spawn()
                .with_context(|| {
                    format!(
                        "failed to spawn the packaged {} backend",
                        backend_kind_label(backend_kind)
                    )
                })?;

            Ok(ManagedBackendChild::Std(child))
        }
        PackagedRuntimePaths::ResourceExecutable {
            backend_kind,
            executable,
            backend_root,
            backend_log_path,
        } => {
            trace_step(format!(
                "resolved packaged {} resource backend paths: executable={}, backend_root={}, log={}",
                backend_kind_label(backend_kind),
                executable.display(),
                backend_root.display(),
                backend_log_path.display(),
            ));

            if !executable.exists() {
                return Err(anyhow!(
                    "packaged {} backend executable was not found at {}",
                    backend_kind_label(backend_kind),
                    executable.display()
                ));
            }

            let (stdout_log, stderr_log) = open_backend_log_handles(&backend_log_path)?;
            let child = Command::new(&executable)
                .current_dir(&backend_root)
                .env("PORT", port.to_string())
                .env("DATABASE_PATH", database_path)
                .env("SPRING_PROFILES_ACTIVE", "prod")
                .stdin(Stdio::null())
                .stdout(Stdio::from(stdout_log))
                .stderr(Stdio::from(stderr_log))
                .spawn()
                .with_context(|| {
                    format!(
                        "failed to spawn the packaged {} backend",
                        backend_kind_label(backend_kind)
                    )
                })?;

            Ok(ManagedBackendChild::Std(child))
        }
        PackagedRuntimePaths::Sidecar {
            backend_kind,
            sidecar_name,
            working_directory,
            backend_log_path,
        } => {
            trace_step(format!(
                "resolved packaged {} sidecar backend paths: sidecar={}, cwd={}, log={}",
                backend_kind_label(backend_kind),
                sidecar_name,
                working_directory.display(),
                backend_log_path.display(),
            ));

            let log_file = open_backend_log_file(&backend_log_path)?;
            let sidecar_command = app
                .shell()
                .sidecar(&sidecar_name)
                .with_context(|| format!("failed to resolve the {sidecar_name} Tauri sidecar"))?;
            let sidecar_command = configure_sidecar_command(
                sidecar_command,
                backend_kind,
                port,
                database_path,
                &working_directory,
            );
            let (mut receiver, child) = sidecar_command.spawn().with_context(|| {
                format!(
                    "failed to spawn the packaged {} sidecar backend",
                    backend_kind_label(backend_kind)
                )
            })?;
            let pid = child.pid();

            tauri::async_runtime::spawn(async move {
                let mut log_file = log_file;
                while let Some(event) = receiver.recv().await {
                    if let Err(error) = write_shell_event(&mut log_file, event) {
                        trace_step(format!(
                            "failed to write packaged backend sidecar logs for pid={pid}: {error:#}"
                        ));
                        break;
                    }
                }
            });

            Ok(ManagedBackendChild::Shell { child, pid })
        }
    }
}

fn configure_sidecar_command(
    command: tauri_plugin_shell::process::Command,
    backend_kind: PackagedRuntimeKind,
    port: u16,
    database_path: &Path,
    working_directory: &Path,
) -> tauri_plugin_shell::process::Command {
    let command = command
        .current_dir(working_directory)
        .env("PORT", port.to_string())
        .env("DATABASE_PATH", database_path.as_os_str());

    match backend_kind {
        PackagedRuntimeKind::NestNode | PackagedRuntimeKind::ExpressNode => {
            command.env("NODE_ENV", "prod")
        }
        PackagedRuntimeKind::SpringNative => prepend_library_search_path(
            command.env("SPRING_PROFILES_ACTIVE", "prod"),
            working_directory,
        ),
    }
}

fn prepend_library_search_path(
    command: tauri_plugin_shell::process::Command,
    library_directory: &Path,
) -> tauri_plugin_shell::process::Command {
    let current_path = std::env::var_os(path_env_key()).unwrap_or_default();
    let mut combined_path = std::ffi::OsString::new();
    combined_path.push(library_directory.as_os_str());

    if !current_path.is_empty() {
        combined_path.push(path_list_separator());
        combined_path.push(current_path);
    }

    command.env(path_env_key(), combined_path)
}

#[cfg(windows)]
fn path_env_key() -> &'static str {
    "PATH"
}

#[cfg(target_os = "macos")]
fn path_env_key() -> &'static str {
    "DYLD_LIBRARY_PATH"
}

#[cfg(all(not(windows), not(target_os = "macos")))]
fn path_env_key() -> &'static str {
    "LD_LIBRARY_PATH"
}

#[cfg(windows)]
fn path_list_separator() -> &'static str {
    ";"
}

#[cfg(not(windows))]
fn path_list_separator() -> &'static str {
    ":"
}

fn open_backend_log_file(log_path: &Path) -> Result<fs::File> {
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .with_context(|| {
            format!(
                "failed to open the backend runtime log file at {}",
                log_path.display()
            )
        })
}

fn open_backend_log_handles(log_path: &Path) -> Result<(fs::File, fs::File)> {
    let stdout_log = open_backend_log_file(log_path)?;
    let stderr_log = stdout_log
        .try_clone()
        .context("failed to duplicate the backend runtime log file handle")?;

    Ok((stdout_log, stderr_log))
}

fn write_shell_event(log_file: &mut fs::File, event: CommandEvent) -> Result<()> {
    match event {
        CommandEvent::Stdout(line) => {
            log_file.write_all(&line)?;
        }
        CommandEvent::Stderr(line) => {
            log_file.write_all(&line)?;
        }
        CommandEvent::Error(error) => {
            writeln!(log_file, "[shell-error] {error}")?;
        }
        CommandEvent::Terminated(payload) => {
            writeln!(log_file, "[terminated] {:?}", payload)?;
        }
        _ => {}
    }

    Ok(())
}

fn terminate_child(child: ManagedBackendChild) -> Result<()> {
    match child {
        ManagedBackendChild::Std(mut child) => terminate_std_child(&mut child),
        ManagedBackendChild::Shell { child, pid } => terminate_shell_child(child, pid),
    }
}

fn terminate_std_child(child: &mut Child) -> Result<()> {
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
        child
            .kill()
            .context("failed to terminate the packaged backend resource process")?;

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

fn terminate_shell_child(child: CommandChild, pid: u32) -> Result<()> {
    trace_step(format!("terminating backend sidecar pid={pid}"));

    #[cfg(windows)]
    {
        let _ = child;

        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        for _ in 0..(SHUTDOWN_TIMEOUT_MS / SHUTDOWN_POLL_MS) {
            if !is_pid_running(pid) {
                return Ok(());
            }

            thread::sleep(Duration::from_millis(SHUTDOWN_POLL_MS));
        }

        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        return Ok(());
    }

    #[cfg(not(windows))]
    {
        child
            .kill()
            .context("failed to terminate the packaged backend sidecar process")?;

        for _ in 0..(SHUTDOWN_TIMEOUT_MS / SHUTDOWN_POLL_MS) {
            if !is_pid_running(pid) {
                return Ok(());
            }

            thread::sleep(Duration::from_millis(SHUTDOWN_POLL_MS));
        }

        Ok(())
    }
}

fn backend_kind_label(kind: PackagedRuntimeKind) -> &'static str {
    match kind {
        PackagedRuntimeKind::NestNode => "Nest",
        PackagedRuntimeKind::ExpressNode => "Express",
        PackagedRuntimeKind::SpringNative => "Spring-native",
    }
}

#[cfg(windows)]
fn is_pid_running(pid: u32) -> bool {
    let handle = unsafe {
        OpenProcess(
            PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
            0,
            pid,
        )
    };
    if handle.is_null() {
        return false;
    }

    let wait_result = unsafe { WaitForSingleObject(handle, 0) };
    unsafe {
        CloseHandle(handle);
    }

    wait_result == WAIT_TIMEOUT
}

#[cfg(not(windows))]
fn is_pid_running(pid: u32) -> bool {
    Command::new("ps")
        .args(["-p", &pid.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
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
        let limits_size =
            u32::try_from(std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>())
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

            return Err(std::io::Error::last_os_error())
                .context("failed to configure the Windows backend job object for kill-on-close");
        }

        Ok(Self { handle })
    }

    fn attach_pid(&self, pid: u32) -> Result<()> {
        let process_handle = unsafe {
            OpenProcess(
                PROCESS_SET_QUOTA | PROCESS_TERMINATE | PROCESS_SYNCHRONIZE,
                0,
                pid,
            )
        };
        if process_handle.is_null() {
            return Err(std::io::Error::last_os_error()).context(
                "failed to open the packaged backend process handle for Windows job assignment",
            );
        }

        let attached =
            unsafe { AssignProcessToJobObject(self.handle as HANDLE, process_handle as HANDLE) };
        let last_error = std::io::Error::last_os_error();
        unsafe {
            CloseHandle(process_handle as HANDLE);
        }

        if attached == 0 {
            return Err(last_error).context(
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
