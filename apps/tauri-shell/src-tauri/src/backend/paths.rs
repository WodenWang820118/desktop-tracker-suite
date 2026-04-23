use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

const BUNDLED_NODE_DIRECTORY: &str = "nodejs";
const BUNDLED_BACKEND_DIRECTORY: &str = "backend-runtime";
const DEFAULT_BACKEND_ENTRY_FILE_NAME: &str = "main.js";
const DEFAULT_BACKEND_LOG_FILE_NAME: &str = "backend-runtime.log";
const METADATA_DIRECTORY: &str = "metadata";
const DESKTOP_RUNTIME_METADATA_FILE_NAME: &str = "desktop-runtime.json";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PackagedRuntimeKind {
    NestNode,
    SpringNative,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
struct PackagedRuntimeMetadata {
    backend_directory: Option<String>,
    executable_name: Option<String>,
    log_file_name: Option<String>,
    node_binary_name: Option<String>,
    runtime_kind: PackagedRuntimeKind,
}

pub(crate) enum PackagedRuntimePaths {
    NestNode {
        node_executable: PathBuf,
        backend_root: PathBuf,
        backend_entry: PathBuf,
        backend_log_path: PathBuf,
    },
    SpringNative {
        executable: PathBuf,
        backend_root: PathBuf,
        backend_log_path: PathBuf,
    },
}

pub(crate) fn resolve_packaged_runtime_paths(app: &AppHandle) -> Result<PackagedRuntimePaths> {
    let resource_dir = normalize_spawn_path(
        app.path()
            .resource_dir()
            .context("failed to resolve the bundled Tauri resource directory")?,
    );
    let metadata = load_packaged_runtime_metadata(&resource_dir)?;
    let app_log_dir = app
        .path()
        .app_log_dir()
        .context("failed to resolve Tracker Suite log directory")?;
    fs::create_dir_all(&app_log_dir).context("failed to create Tracker Suite log directory")?;

    build_packaged_runtime_paths(
        resource_dir,
        app_log_dir.join(
            metadata
                .log_file_name
                .as_deref()
                .unwrap_or(DEFAULT_BACKEND_LOG_FILE_NAME),
        ),
        metadata,
    )
}

fn load_packaged_runtime_metadata(resource_dir: &Path) -> Result<PackagedRuntimeMetadata> {
    let metadata_path = resource_dir
        .join(METADATA_DIRECTORY)
        .join(DESKTOP_RUNTIME_METADATA_FILE_NAME);
    if !metadata_path.exists() {
        return Ok(PackagedRuntimeMetadata::default_nest());
    }

    let source = fs::read_to_string(&metadata_path).with_context(|| {
        format!(
            "failed to read packaged desktop runtime metadata at {}",
            metadata_path.display()
        )
    })?;
    serde_json::from_str(&source).with_context(|| {
        format!(
            "failed to parse packaged desktop runtime metadata at {}",
            metadata_path.display()
        )
    })
}

fn build_packaged_runtime_paths(
    resource_dir: PathBuf,
    backend_log_path: PathBuf,
    metadata: PackagedRuntimeMetadata,
) -> Result<PackagedRuntimePaths> {
    let backend_root = normalize_spawn_path(resource_dir.join(
        metadata
            .backend_directory
            .as_deref()
            .unwrap_or(BUNDLED_BACKEND_DIRECTORY),
    ));

    match metadata.runtime_kind {
        PackagedRuntimeKind::NestNode => {
            let node_executable = normalize_spawn_path(resource_dir.join(BUNDLED_NODE_DIRECTORY).join(
                metadata
                    .node_binary_name
                    .as_deref()
                    .unwrap_or(if cfg!(windows) { "node.exe" } else { "node" }),
            ));
            let backend_entry =
                normalize_spawn_path(backend_root.join(DEFAULT_BACKEND_ENTRY_FILE_NAME));
            Ok(PackagedRuntimePaths::NestNode {
                node_executable,
                backend_root,
                backend_entry,
                backend_log_path,
            })
        }
        PackagedRuntimeKind::SpringNative => {
            let executable = normalize_spawn_path(backend_root.join(
                metadata
                    .executable_name
                    .as_deref()
                    .context("spring-native packaged runtime metadata is missing executableName")?,
            ));
            Ok(PackagedRuntimePaths::SpringNative {
                executable,
                backend_root,
                backend_log_path,
            })
        }
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

impl PackagedRuntimeMetadata {
    fn default_nest() -> Self {
        Self {
            backend_directory: Some(BUNDLED_BACKEND_DIRECTORY.to_string()),
            executable_name: None,
            log_file_name: Some(DEFAULT_BACKEND_LOG_FILE_NAME.to_string()),
            node_binary_name: Some(if cfg!(windows) { "node.exe" } else { "node" }.to_string()),
            runtime_kind: PackagedRuntimeKind::NestNode,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{
        build_packaged_runtime_paths, normalize_spawn_path, PackagedRuntimeKind,
        PackagedRuntimeMetadata, PackagedRuntimePaths,
    };

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

    #[test]
    fn build_packaged_runtime_paths_defaults_to_nest_layout() {
        let resource_dir = sample_resource_dir();
        let backend_log_path = sample_log_path();

        let paths = build_packaged_runtime_paths(
            resource_dir.clone(),
            backend_log_path.clone(),
            PackagedRuntimeMetadata::default_nest(),
        )
        .expect("default Nest runtime metadata should resolve successfully");

        match paths {
            PackagedRuntimePaths::NestNode {
                node_executable,
                backend_root,
                backend_entry,
                backend_log_path: resolved_log_path,
            } => {
                assert_eq!(backend_root, resource_dir.join("backend-runtime"));
                assert_eq!(backend_entry, resource_dir.join("backend-runtime").join("main.js"));
                assert_eq!(resolved_log_path, backend_log_path);
                assert_eq!(
                    node_executable,
                    resource_dir.join("nodejs").join(if cfg!(windows) { "node.exe" } else { "node" }),
                );
            }
            PackagedRuntimePaths::SpringNative { .. } => {
                panic!("expected Nest runtime paths");
            }
        }
    }

    #[test]
    fn build_packaged_runtime_paths_supports_spring_native_layout() {
        let resource_dir = sample_resource_dir();
        let backend_log_path = sample_log_path();

        let paths = build_packaged_runtime_paths(
            resource_dir.clone(),
            backend_log_path.clone(),
            PackagedRuntimeMetadata {
                backend_directory: Some("spring-native".to_string()),
                executable_name: Some("spring-backend.exe".to_string()),
                log_file_name: Some("backend-runtime.log".to_string()),
                node_binary_name: None,
                runtime_kind: PackagedRuntimeKind::SpringNative,
            },
        )
        .expect("spring-native runtime metadata should resolve successfully");

        match paths {
            PackagedRuntimePaths::SpringNative {
                executable,
                backend_root,
                backend_log_path: resolved_log_path,
            } => {
                assert_eq!(backend_root, resource_dir.join("spring-native"));
                assert_eq!(executable, resource_dir.join("spring-native").join("spring-backend.exe"));
                assert_eq!(resolved_log_path, backend_log_path);
            }
            PackagedRuntimePaths::NestNode { .. } => {
                panic!("expected Spring-native runtime paths");
            }
        }
    }

    fn sample_resource_dir() -> PathBuf {
        #[cfg(windows)]
        {
            return PathBuf::from(r"C:\tracker-suite\resources");
        }

        #[cfg(not(windows))]
        {
            PathBuf::from("/tmp/tracker-suite/resources")
        }
    }

    fn sample_log_path() -> PathBuf {
        #[cfg(windows)]
        {
            return PathBuf::from(r"C:\tracker-suite\logs\backend-runtime.log");
        }

        #[cfg(not(windows))]
        {
            PathBuf::from("/tmp/tracker-suite/logs/backend-runtime.log")
        }
    }
}
