use std::{
    fs,
    path::Path,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use tauri::AppHandle;

use crate::diagnostics::trace_step;

use super::paths::resolve_packaged_runtime_paths;

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

const SHUTDOWN_POLL_MS: u64 = 250;
const SHUTDOWN_TIMEOUT_MS: u64 = 5000;

pub(crate) struct BackendProcessState {
    child: Mutex<Option<Child>>,
    #[cfg(windows)]
    job: WindowsKillOnCloseJob,
}

impl BackendProcessState {
    pub(crate) fn new() -> Result<Self> {
        Ok(Self {
            child: Mutex::new(None),
            #[cfg(windows)]
            job: WindowsKillOnCloseJob::new()?,
        })
    }

    pub(crate) fn replace(&self, child: Child) -> Result<()> {
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

    pub(crate) fn shutdown_blocking(&self) {
        if let Some(mut child) = self.take() {
            let _ = terminate_child(&mut child);
        }
    }
}

pub(crate) fn spawn_packaged_backend(
    app: &AppHandle,
    port: u16,
    database_path: &Path,
) -> Result<Child> {
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
        child
            .kill()
            .context("failed to terminate the Nest backend")?;

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

    fn attach(&self, child: &Child) -> Result<()> {
        let attached = unsafe {
            AssignProcessToJobObject(self.handle as HANDLE, child.as_raw_handle() as HANDLE)
        };
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
