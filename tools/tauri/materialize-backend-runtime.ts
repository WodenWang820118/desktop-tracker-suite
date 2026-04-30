import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BACKEND_RUNTIME_DIR,
  DATABASE_FILE_NAME,
  NEST_DIST_DIR,
  NODE_RUNTIME_DIR,
  TAURI_METADATA_DIR,
  TAURI_DIST_ROOT,
  copyDirectory,
  copyFileEnsured,
  ensureCleanDir,
  ensureNodeBinaryDownloaded,
  fileExists,
  getPackagedNodeExecutablePath,
  installStagedProductionDependencies,
  logStep,
  readJson,
  stopStaleTauriBackendProcesses,
  writeJson,
  writeTextFile,
  WORKSPACE_ROOT,
} from './common.ts';
import {
  buildPackagedNodeBackendPackageJson,
  NODE_BACKEND_INSTALL_WORKSPACE_CONFIG,
} from './node-backend-packaging.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';

type PackageJson = {
  dependencies?: Record<string, string>;
  packageManager?: string;
};

type DesktopRuntimeMetadata = {
  backendDirectory: string;
  backendKind: 'nest-node';
  databaseFileName: string;
  desktopTarget: string;
  entryFile: string;
  logFileName: string;
  nodeBinaryName: string;
  runtimeMode: 'resource';
};

export function buildPackagedBackendPackageJson(input: {
  backendPackageJson: PackageJson;
  packageManager?: string;
  sqliteVersion?: string;
}) {
  return buildPackagedNodeBackendPackageJson(input);
}

export function buildDesktopRuntimeMetadata(target: {
  profile: string;
  nodeBinaryName: string;
}): DesktopRuntimeMetadata {
  return {
    backendDirectory: 'backend-runtime',
    backendKind: 'nest-node',
    databaseFileName: DATABASE_FILE_NAME,
    desktopTarget: target.profile,
    entryFile: 'main.js',
    logFileName: 'backend-runtime.log',
    nodeBinaryName: target.nodeBinaryName,
    runtimeMode: 'resource',
  };
}

async function main() {
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);
  const rootPackageJson = await readJson<PackageJson>(join(WORKSPACE_ROOT, 'package.json'));
  const sqlitePackageJson = await readJson<{ version?: string }>(
    join(WORKSPACE_ROOT, 'node_modules', 'sqlite3', 'package.json'),
  );
  const distPackageJsonPath = join(NEST_DIST_DIR, 'package.json');

  if (!(await fileExists(distPackageJsonPath))) {
    throw new Error(
      `Nest backend build output is missing at ${distPackageJsonPath}. Run nx build nest-backend first.`,
    );
  }

  await stopStaleTauriBackendProcesses();

  logStep('Preparing Tauri runtime resources');
  await ensureCleanDir(TAURI_DIST_ROOT);
  await ensureCleanDir(BACKEND_RUNTIME_DIR);
  await ensureCleanDir(NODE_RUNTIME_DIR);
  await ensureCleanDir(TAURI_METADATA_DIR);

  logStep('Copying the built Nest backend into the packaged runtime folder');
  await copyDirectory(NEST_DIST_DIR, BACKEND_RUNTIME_DIR);
  await rm(join(BACKEND_RUNTIME_DIR, 'pnpm-lock.yaml'), { force: true });

  const backendPackageJson = await readJson<PackageJson>(distPackageJsonPath);
  await writeJson(
    join(BACKEND_RUNTIME_DIR, 'package.json'),
    buildPackagedBackendPackageJson({
      backendPackageJson,
      packageManager: rootPackageJson.packageManager,
      sqliteVersion: sqlitePackageJson.version,
    }),
  );
  await writeTextFile(
    join(BACKEND_RUNTIME_DIR, 'pnpm-workspace.yaml'),
    NODE_BACKEND_INSTALL_WORKSPACE_CONFIG,
  );
  await writeTextFile(join(BACKEND_RUNTIME_DIR, '.tauri-desktop-target'), `${target.profile}\n`);
  await writeTextFile(join(BACKEND_RUNTIME_DIR, '.tauri-database-name'), `${DATABASE_FILE_NAME}\n`);
  await writeJson(
    join(TAURI_METADATA_DIR, 'desktop-runtime.json'),
    buildDesktopRuntimeMetadata(target),
  );

  logStep(`Installing production dependencies for the packaged Nest runtime (${target.profile})`);
  await installStagedProductionDependencies({
    cwd: BACKEND_RUNTIME_DIR,
    label: 'packaged Nest runtime',
  });
  const sqliteBindingPath = join(
    BACKEND_RUNTIME_DIR,
    'node_modules',
    'sqlite3',
    'build',
    'Release',
    'node_sqlite3.node',
  );
  if (!(await fileExists(sqliteBindingPath))) {
    throw new Error(
      `sqlite3 native binding was not built correctly. Expected ${sqliteBindingPath} to exist.`,
    );
  }

  logStep(`Fetching and verifying the pinned ${target.profile} Node runtime`);
  const cachedNodeExecutable = await ensureNodeBinaryDownloaded(target);
  await copyFileEnsured(cachedNodeExecutable, getPackagedNodeExecutablePath(target));

  logStep(`Tauri backend runtime materialized for ${target.profile} at ${TAURI_DIST_ROOT}`);
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
