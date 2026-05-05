import { join } from 'node:path';

import { WORKSPACE_ROOT } from '../shared/workspace.ts';

// ---- Workspace roots ----
export const TAURI_PROJECT_ROOT = join(WORKSPACE_ROOT, 'apps', 'tauri-shell');
export const TAURI_SRC_TAURI_ROOT = join(TAURI_PROJECT_ROOT, 'src-tauri');
export const TAURI_BINARIES_DIR = join(TAURI_SRC_TAURI_ROOT, 'binaries');
export const DIST_ROOT = join(WORKSPACE_ROOT, 'dist');

// ---- Legacy (resource-mode) Tauri dist paths ----
export const TAURI_DIST_ROOT = join(DIST_ROOT, 'tauri-shell');
export const TAURI_RESOURCE_ROOT = join(TAURI_DIST_ROOT, 'resources');
export const BACKEND_RUNTIME_DIR = join(TAURI_RESOURCE_ROOT, 'backend-runtime');
export const NODE_RUNTIME_DIR = join(TAURI_RESOURCE_ROOT, 'nodejs');
export const TAURI_METADATA_DIR = join(TAURI_RESOURCE_ROOT, 'metadata');

// ---- Nest sidecar dist paths ----
export const TAURI_NEST_SIDECAR_DIST_ROOT = join(DIST_ROOT, 'tauri-shell-nest-sidecar');
export const TAURI_NEST_SIDECAR_RESOURCE_ROOT = join(
  TAURI_NEST_SIDECAR_DIST_ROOT,
  'resources',
);
export const TAURI_NEST_SIDECAR_METADATA_DIR = join(
  TAURI_NEST_SIDECAR_RESOURCE_ROOT,
  'metadata',
);

// ---- Express sidecar dist paths ----
export const TAURI_EXPRESS_SIDECAR_DIST_ROOT = join(
  DIST_ROOT,
  'tauri-shell-express-sidecar',
);
export const TAURI_EXPRESS_SIDECAR_RESOURCE_ROOT = join(
  TAURI_EXPRESS_SIDECAR_DIST_ROOT,
  'resources',
);
export const TAURI_EXPRESS_SIDECAR_METADATA_DIR = join(
  TAURI_EXPRESS_SIDECAR_RESOURCE_ROOT,
  'metadata',
);

// ---- Spring Native dist paths ----
export const SPRING_NATIVE_DIST_DIR = join(DIST_ROOT, 'spring-backend-native');
export const TAURI_SPRING_DIST_ROOT = join(DIST_ROOT, 'tauri-shell-spring-native');
export const TAURI_SPRING_RESOURCE_ROOT = join(TAURI_SPRING_DIST_ROOT, 'resources');
export const SPRING_NATIVE_RUNTIME_DIR = join(TAURI_SPRING_RESOURCE_ROOT, 'spring-native');
export const TAURI_SPRING_METADATA_DIR = join(TAURI_SPRING_RESOURCE_ROOT, 'metadata');

// ---- Cache & stage paths ----
export const NODE_CACHE_DIR = join(WORKSPACE_ROOT, '.cache', 'tauri-shell');
export const NODE_SIDECAR_STAGE_ROOT = join(NODE_CACHE_DIR, 'node-sidecars');

// ---- Frontend / backend dist directories ----
export const NG_DIST_BROWSER_DIR = join(DIST_ROOT, 'ng-tracker', 'browser');
export const NEST_DIST_DIR = join(DIST_ROOT, 'nest-backend');
export const EXPRESS_DIST_DIR = join(DIST_ROOT, 'express-backend');

// ---- Named constants ----
export const NODE_VERSION = '24.11.1';
export const DATABASE_FILE_NAME = 'database.sqlite3';
export const LEGACY_TAURI_DATABASE_FILE_NAME = 'tasks.sqlite';
export const SPRING_BACKEND_SIDECAR_NAME = 'spring-backend';
export const NEST_BACKEND_SIDECAR_NAME = 'nest-backend';
export const EXPRESS_BACKEND_SIDECAR_NAME = 'express-backend';
export const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
export const DEV_FRONTEND_URL = 'http://127.0.0.1:4200/';
export const DEV_TASK_API_URL = 'http://localhost:3000/tasks';
export const PROD_TASK_API_URL = 'http://localhost:5000/tasks';
