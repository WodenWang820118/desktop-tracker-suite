use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

const BUNDLED_NODE_DIRECTORY: &str = "nodejs";
const BUNDLED_BACKEND_DIRECTORY: &str = "backend-runtime";
const DEFAULT_BACKEND_ENTRY_FILE_NAME: &str = "main.js";
const DEFAULT_BACKEND_LOG_FILE_NAME: &str = "backend-runtime.log";
const METADATA_DIRECTORY: &str = "metadata";
const DESKTOP_RUNTIME_METADATA_FILE_NAME: &str = "desktop-runtime.json";

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PackagedRuntimeMode {
    #[default]
    Resource,
    Sidecar,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PackagedRuntimeKind {
    #[default]
    NestNode,
    ExpressNode,
    SpringNative,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PackagedRuntimeMetadata {
    #[serde(default)]
    backend_directory: Option<String>,
    #[serde(default, alias = "runtimeKind")]
    backend_kind: PackagedRuntimeKind,
    #[serde(default)]
    database_file_name: Option<String>,
    #[serde(default)]
    entry_file: Option<String>,
    #[serde(default)]
    executable_name: Option<String>,
    #[serde(default)]
    log_file_name: Option<String>,
    #[serde(default)]
    node_binary_name: Option<String>,
    #[serde(default)]
    runtime_mode: PackagedRuntimeMode,
    #[serde(default)]
    sidecar_name: Option<String>,
}

#[derive(Debug)]
pub(crate) enum PackagedRuntimePaths {
    ResourceNode {
        backend_kind: PackagedRuntimeKind,
        node_executable: PathBuf,
        backend_root: PathBuf,
        backend_entry: PathBuf,
        backend_log_path: PathBuf,
    },
    ResourceExecutable {
        backend_kind: PackagedRuntimeKind,
        executable: PathBuf,
        backend_root: PathBuf,
        backend_log_path: PathBuf,
    },
    Sidecar {
        backend_kind: PackagedRuntimeKind,
        sidecar_name: String,
        working_directory: PathBuf,
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
    let mut metadata: PackagedRuntimeMetadata =
        serde_json::from_str(&source).with_context(|| {
            format!(
                "failed to parse packaged desktop runtime metadata at {}",
                metadata_path.display()
            )
        })?;
    metadata.fill_defaults();
    Ok(metadata)
}

fn build_packaged_runtime_paths(
    resource_dir: PathBuf,
    backend_log_path: PathBuf,
    mut metadata: PackagedRuntimeMetadata,
) -> Result<PackagedRuntimePaths> {
    metadata.fill_defaults();

    match metadata.runtime_mode {
        PackagedRuntimeMode::Resource => {
            build_resource_runtime_paths(resource_dir, backend_log_path, metadata)
        }
        PackagedRuntimeMode::Sidecar => {
            build_sidecar_runtime_paths(resource_dir, backend_log_path, metadata)
        }
    }
}

fn build_resource_runtime_paths(
    resource_dir: PathBuf,
    backend_log_path: PathBuf,
    metadata: PackagedRuntimeMetadata,
) -> Result<PackagedRuntimePaths> {
    let backend_root = normalize_spawn_path(
        resource_dir.join(
            metadata
                .backend_directory
                .as_deref()
                .unwrap_or(BUNDLED_BACKEND_DIRECTORY),
        ),
    );

    match metadata.backend_kind {
        PackagedRuntimeKind::NestNode | PackagedRuntimeKind::ExpressNode => {
            let node_executable = normalize_spawn_path(
                resource_dir.join(BUNDLED_NODE_DIRECTORY).join(
                    metadata
                        .node_binary_name
                        .as_deref()
                        .unwrap_or(default_node_binary_name()),
                ),
            );
            let backend_entry = normalize_spawn_path(
                backend_root.join(
                    metadata
                        .entry_file
                        .as_deref()
                        .unwrap_or(DEFAULT_BACKEND_ENTRY_FILE_NAME),
                ),
            );
            Ok(PackagedRuntimePaths::ResourceNode {
                backend_kind: metadata.backend_kind,
                node_executable,
                backend_root,
                backend_entry,
                backend_log_path,
            })
        }
        PackagedRuntimeKind::SpringNative => {
            let executable = normalize_spawn_path(
                backend_root.join(metadata.executable_name.as_deref().context(
                    "spring-native packaged runtime metadata is missing executableName",
                )?),
            );
            Ok(PackagedRuntimePaths::ResourceExecutable {
                backend_kind: metadata.backend_kind,
                executable,
                backend_root,
                backend_log_path,
            })
        }
    }
}

fn build_sidecar_runtime_paths(
    resource_dir: PathBuf,
    backend_log_path: PathBuf,
    metadata: PackagedRuntimeMetadata,
) -> Result<PackagedRuntimePaths> {
    let working_directory = normalize_spawn_path(match metadata.backend_directory.as_deref() {
        Some(backend_directory) => resource_dir.join(backend_directory),
        None => resource_dir.clone(),
    });
    let sidecar_name = metadata
        .sidecar_name
        .clone()
        .or_else(|| default_sidecar_name(metadata.backend_kind).map(str::to_string))
        .ok_or_else(|| anyhow!("sidecar packaged runtime metadata is missing sidecarName"))?;

    Ok(PackagedRuntimePaths::Sidecar {
        backend_kind: metadata.backend_kind,
        sidecar_name,
        working_directory,
        backend_log_path,
    })
}

fn default_node_binary_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

fn default_sidecar_name(kind: PackagedRuntimeKind) -> Option<&'static str> {
    match kind {
        PackagedRuntimeKind::NestNode => Some("nest-backend"),
        PackagedRuntimeKind::ExpressNode => Some("express-backend"),
        PackagedRuntimeKind::SpringNative => Some("spring-backend"),
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
        let mut metadata = Self {
            backend_directory: Some(BUNDLED_BACKEND_DIRECTORY.to_string()),
            backend_kind: PackagedRuntimeKind::NestNode,
            database_file_name: None,
            entry_file: Some(DEFAULT_BACKEND_ENTRY_FILE_NAME.to_string()),
            executable_name: None,
            log_file_name: Some(DEFAULT_BACKEND_LOG_FILE_NAME.to_string()),
            node_binary_name: Some(default_node_binary_name().to_string()),
            runtime_mode: PackagedRuntimeMode::Resource,
            sidecar_name: None,
        };
        metadata.fill_defaults();
        metadata
    }

    fn fill_defaults(&mut self) {
        if self.log_file_name.is_none() {
            self.log_file_name = Some(DEFAULT_BACKEND_LOG_FILE_NAME.to_string());
        }

        if matches!(
            self.backend_kind,
            PackagedRuntimeKind::NestNode | PackagedRuntimeKind::ExpressNode
        ) {
            if self.backend_directory.is_none()
                && self.runtime_mode == PackagedRuntimeMode::Resource
            {
                self.backend_directory = Some(BUNDLED_BACKEND_DIRECTORY.to_string());
            }
            if self.entry_file.is_none() {
                self.entry_file = Some(DEFAULT_BACKEND_ENTRY_FILE_NAME.to_string());
            }
            if self.node_binary_name.is_none() {
                self.node_binary_name = Some(default_node_binary_name().to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{
        build_packaged_runtime_paths, normalize_spawn_path, PackagedRuntimeKind,
        PackagedRuntimeMetadata, PackagedRuntimeMode, PackagedRuntimePaths,
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
    fn build_packaged_runtime_paths_defaults_to_nest_resource_layout() {
        let resource_dir = sample_resource_dir();
        let backend_log_path = sample_log_path();

        let paths = build_packaged_runtime_paths(
            resource_dir.clone(),
            backend_log_path.clone(),
            PackagedRuntimeMetadata::default_nest(),
        )
        .expect("default Nest runtime metadata should resolve successfully");

        match paths {
            PackagedRuntimePaths::ResourceNode {
                backend_kind,
                node_executable,
                backend_root,
                backend_entry,
                backend_log_path: resolved_log_path,
            } => {
                assert_eq!(backend_kind, PackagedRuntimeKind::NestNode);
                assert_eq!(backend_root, resource_dir.join("backend-runtime"));
                assert_eq!(
                    backend_entry,
                    resource_dir.join("backend-runtime").join("main.js")
                );
                assert_eq!(resolved_log_path, backend_log_path);
                assert_eq!(
                    node_executable,
                    resource_dir.join("nodejs").join(if cfg!(windows) {
                        "node.exe"
                    } else {
                        "node"
                    }),
                );
            }
            PackagedRuntimePaths::ResourceExecutable { .. } => {
                panic!("expected resource-node runtime paths");
            }
            PackagedRuntimePaths::Sidecar { .. } => {
                panic!("expected resource-node runtime paths");
            }
        }
    }

    #[test]
    fn build_packaged_runtime_paths_supports_resource_spring_layout() {
        let resource_dir = sample_resource_dir();
        let backend_log_path = sample_log_path();

        let paths = build_packaged_runtime_paths(
            resource_dir.clone(),
            backend_log_path.clone(),
            PackagedRuntimeMetadata {
                backend_directory: Some("spring-native".to_string()),
                backend_kind: PackagedRuntimeKind::SpringNative,
                database_file_name: Some("database.sqlite3".to_string()),
                entry_file: None,
                executable_name: Some("spring-backend.exe".to_string()),
                log_file_name: Some("backend-runtime.log".to_string()),
                node_binary_name: None,
                runtime_mode: PackagedRuntimeMode::Resource,
                sidecar_name: None,
            },
        )
        .expect("spring-native runtime metadata should resolve successfully");

        match paths {
            PackagedRuntimePaths::ResourceExecutable {
                backend_kind,
                executable,
                backend_root,
                backend_log_path: resolved_log_path,
            } => {
                assert_eq!(backend_kind, PackagedRuntimeKind::SpringNative);
                assert_eq!(backend_root, resource_dir.join("spring-native"));
                assert_eq!(
                    executable,
                    resource_dir
                        .join("spring-native")
                        .join("spring-backend.exe")
                );
                assert_eq!(resolved_log_path, backend_log_path);
            }
            PackagedRuntimePaths::ResourceNode { .. } => {
                panic!("expected resource-executable runtime paths");
            }
            PackagedRuntimePaths::Sidecar { .. } => {
                panic!("expected resource-executable runtime paths");
            }
        }
    }

    #[test]
    fn build_packaged_runtime_paths_supports_sidecar_layout() {
        let resource_dir = sample_resource_dir();
        let backend_log_path = sample_log_path();

        let paths = build_packaged_runtime_paths(
            resource_dir.clone(),
            backend_log_path.clone(),
            PackagedRuntimeMetadata {
                backend_directory: None,
                backend_kind: PackagedRuntimeKind::SpringNative,
                database_file_name: Some("database.sqlite3".to_string()),
                entry_file: None,
                executable_name: None,
                log_file_name: Some("backend-runtime.log".to_string()),
                node_binary_name: None,
                runtime_mode: PackagedRuntimeMode::Sidecar,
                sidecar_name: Some("spring-backend".to_string()),
            },
        )
        .expect("spring-native sidecar metadata should resolve successfully");

        match paths {
            PackagedRuntimePaths::Sidecar {
                backend_kind,
                sidecar_name,
                working_directory,
                backend_log_path: resolved_log_path,
            } => {
                assert_eq!(backend_kind, PackagedRuntimeKind::SpringNative);
                assert_eq!(sidecar_name, "spring-backend");
                assert_eq!(working_directory, resource_dir);
                assert_eq!(resolved_log_path, backend_log_path);
            }
            PackagedRuntimePaths::ResourceNode { .. } => {
                panic!("expected sidecar runtime paths");
            }
            PackagedRuntimePaths::ResourceExecutable { .. } => {
                panic!("expected sidecar runtime paths");
            }
        }
    }

    #[test]
    fn build_packaged_runtime_paths_uses_default_sidecar_name_when_missing() {
        let resource_dir = sample_resource_dir();
        let backend_log_path = sample_log_path();

        let paths = build_packaged_runtime_paths(
            resource_dir.clone(),
            backend_log_path.clone(),
            PackagedRuntimeMetadata {
                backend_directory: Some("spring-native".to_string()),
                backend_kind: PackagedRuntimeKind::SpringNative,
                database_file_name: Some("database.sqlite3".to_string()),
                entry_file: None,
                executable_name: None,
                log_file_name: Some("backend-runtime.log".to_string()),
                node_binary_name: None,
                runtime_mode: PackagedRuntimeMode::Sidecar,
                sidecar_name: None,
            },
        )
        .expect("spring-native sidecar metadata should infer the default sidecar name");

        match paths {
            PackagedRuntimePaths::Sidecar {
                sidecar_name,
                working_directory,
                ..
            } => {
                assert_eq!(sidecar_name, "spring-backend");
                assert_eq!(working_directory, resource_dir.join("spring-native"));
            }
            PackagedRuntimePaths::ResourceNode { .. } => {
                panic!("expected sidecar runtime paths");
            }
            PackagedRuntimePaths::ResourceExecutable { .. } => {
                panic!("expected sidecar runtime paths");
            }
        }
    }

    #[test]
    fn build_packaged_runtime_paths_uses_default_nest_sidecar_name_when_missing() {
        let paths = build_packaged_runtime_paths(
            sample_resource_dir(),
            sample_log_path(),
            PackagedRuntimeMetadata {
                backend_directory: None,
                backend_kind: PackagedRuntimeKind::NestNode,
                database_file_name: Some("database.sqlite3".to_string()),
                entry_file: None,
                executable_name: None,
                log_file_name: Some("backend-runtime.log".to_string()),
                node_binary_name: None,
                runtime_mode: PackagedRuntimeMode::Sidecar,
                sidecar_name: None,
            },
        )
        .expect("Nest sidecar metadata should infer the default sidecar name");

        match paths {
            PackagedRuntimePaths::Sidecar { sidecar_name, .. } => {
                assert_eq!(sidecar_name, "nest-backend");
            }
            PackagedRuntimePaths::ResourceNode { .. } => {
                panic!("expected sidecar runtime paths");
            }
            PackagedRuntimePaths::ResourceExecutable { .. } => {
                panic!("expected sidecar runtime paths");
            }
        }
    }

    #[test]
    fn build_packaged_runtime_paths_uses_default_express_sidecar_name_when_missing() {
        let paths = build_packaged_runtime_paths(
            sample_resource_dir(),
            sample_log_path(),
            PackagedRuntimeMetadata {
                backend_directory: None,
                backend_kind: PackagedRuntimeKind::ExpressNode,
                database_file_name: Some("database.sqlite3".to_string()),
                entry_file: None,
                executable_name: None,
                log_file_name: Some("backend-runtime.log".to_string()),
                node_binary_name: None,
                runtime_mode: PackagedRuntimeMode::Sidecar,
                sidecar_name: None,
            },
        )
        .expect("Express sidecar metadata should infer the default sidecar name");

        match paths {
            PackagedRuntimePaths::Sidecar { sidecar_name, .. } => {
                assert_eq!(sidecar_name, "express-backend");
            }
            PackagedRuntimePaths::ResourceNode { .. } => {
                panic!("expected sidecar runtime paths");
            }
            PackagedRuntimePaths::ResourceExecutable { .. } => {
                panic!("expected sidecar runtime paths");
            }
        }
    }

    #[test]
    fn build_packaged_runtime_paths_rejects_resource_spring_layout_without_executable_name() {
        let resource_dir = sample_resource_dir();
        let backend_log_path = sample_log_path();

        let error = build_packaged_runtime_paths(
            resource_dir,
            backend_log_path,
            PackagedRuntimeMetadata {
                backend_directory: Some("spring-native".to_string()),
                backend_kind: PackagedRuntimeKind::SpringNative,
                database_file_name: Some("database.sqlite3".to_string()),
                entry_file: None,
                executable_name: None,
                log_file_name: Some("backend-runtime.log".to_string()),
                node_binary_name: None,
                runtime_mode: PackagedRuntimeMode::Resource,
                sidecar_name: None,
            },
        )
        .expect_err("resource spring metadata should require executableName");

        assert!(error
            .to_string()
            .contains("missing executableName"));
    }

    #[test]
    fn parse_camel_case_metadata_with_legacy_runtime_kind_alias() {
        let metadata: PackagedRuntimeMetadata = serde_json::from_str(
            r#"{
              "backendDirectory": "spring-native",
              "databaseFileName": "database.sqlite3",
              "desktopTarget": "windows-x64",
              "executableName": "spring-backend.exe",
              "logFileName": "backend-runtime.log",
              "runtimeKind": "spring-native"
            }"#,
        )
        .expect("legacy runtimeKind metadata should parse");

        assert_eq!(metadata.backend_kind, PackagedRuntimeKind::SpringNative);
        assert_eq!(metadata.runtime_mode, PackagedRuntimeMode::Resource);
        assert_eq!(
            metadata.executable_name.as_deref(),
            Some("spring-backend.exe")
        );
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
