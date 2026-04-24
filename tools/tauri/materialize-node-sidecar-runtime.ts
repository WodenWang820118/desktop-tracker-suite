import { chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DATABASE_FILE_NAME,
  EXPRESS_BACKEND_SIDECAR_NAME,
  EXPRESS_DIST_DIR,
  NEST_BACKEND_SIDECAR_NAME,
  NEST_DIST_DIR,
  NODE_SIDECAR_STAGE_ROOT,
  PNPM_COMMAND,
  TAURI_BINARIES_DIR,
  TAURI_EXPRESS_SIDECAR_DIST_ROOT,
  TAURI_EXPRESS_SIDECAR_METADATA_DIR,
  TAURI_NEST_SIDECAR_DIST_ROOT,
  TAURI_NEST_SIDECAR_METADATA_DIR,
  copyDirectory,
  copyFileEnsured,
  ensureCleanDir,
  ensureDir,
  fileExists,
  getTauriSidecarBinaryPath,
  installStagedProductionDependencies,
  logStep,
  readJson,
  runCommand,
  stopStaleTauriBackendProcesses,
  writeJson,
  writeTextFile,
  WORKSPACE_ROOT,
} from './common.ts';
import {
  buildNodeSidecarPackageJson,
  NODE_BACKEND_INSTALL_NPMRC,
} from './node-backend-packaging.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';

type NodeSidecarRuntimeMode = 'express' | 'nest';

type PackageJson = {
  dependencies?: Record<string, string>;
  packageManager?: string;
};

type NodeDesktopRuntimeMetadata = {
  backendKind: 'express-node' | 'nest-node';
  databaseFileName: string;
  desktopTarget: string;
  logFileName: string;
  runtimeMode: 'sidecar';
  sidecarName: string;
};

type NodeSidecarRuntimeDefinition = {
  backendDistDir: string;
  backendKind: NodeDesktopRuntimeMetadata['backendKind'];
  label: 'Express' | 'Nest';
  sidecarName: string;
  tauriDistRoot: string;
  tauriMetadataDir: string;
};

const NODE_SIDECAR_RUNTIME_DEFINITIONS: Record<
  NodeSidecarRuntimeMode,
  NodeSidecarRuntimeDefinition
> = {
  express: {
    backendDistDir: EXPRESS_DIST_DIR,
    backendKind: 'express-node',
    label: 'Express',
    sidecarName: EXPRESS_BACKEND_SIDECAR_NAME,
    tauriDistRoot: TAURI_EXPRESS_SIDECAR_DIST_ROOT,
    tauriMetadataDir: TAURI_EXPRESS_SIDECAR_METADATA_DIR,
  },
  nest: {
    backendDistDir: NEST_DIST_DIR,
    backendKind: 'nest-node',
    label: 'Nest',
    sidecarName: NEST_BACKEND_SIDECAR_NAME,
    tauriDistRoot: TAURI_NEST_SIDECAR_DIST_ROOT,
    tauriMetadataDir: TAURI_NEST_SIDECAR_METADATA_DIR,
  },
};

export function buildDesktopRuntimeMetadata(input: {
  backendKind: NodeDesktopRuntimeMetadata['backendKind'];
  profile: string;
  sidecarName: string;
}): NodeDesktopRuntimeMetadata {
  return {
    backendKind: input.backendKind,
    databaseFileName: DATABASE_FILE_NAME,
    desktopTarget: input.profile,
    logFileName: 'backend-runtime.log',
    runtimeMode: 'sidecar',
    sidecarName: input.sidecarName,
  };
}

export function resolveNodeSidecarRuntimeDefinition(
  mode: NodeSidecarRuntimeMode,
): NodeSidecarRuntimeDefinition {
  return NODE_SIDECAR_RUNTIME_DEFINITIONS[mode];
}

async function main() {
  const runtimeMode = parseRuntimeMode(process.argv[2]);
  const runtimeDefinition = resolveNodeSidecarRuntimeDefinition(runtimeMode);
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);
  const rootPackageJson = await readJson<PackageJson>(join(WORKSPACE_ROOT, 'package.json'));
  const sqlitePackageJson = await readJson<{ version?: string }>(
    join(WORKSPACE_ROOT, 'node_modules', 'sqlite3', 'package.json'),
  );
  const distPackageJsonPath = join(runtimeDefinition.backendDistDir, 'package.json');
  if (!(await fileExists(distPackageJsonPath))) {
    throw new Error(
      `${runtimeDefinition.label} backend build output is missing at ${distPackageJsonPath}. Run nx build ${
        runtimeMode === 'nest' ? 'nest-backend' : 'express-backend'
      } first.`,
    );
  }

  await stopStaleTauriBackendProcesses();

  logStep(`Preparing ${runtimeDefinition.label} sidecar Tauri runtime resources`);
  await ensureCleanDir(runtimeDefinition.tauriDistRoot);
  await ensureDir(TAURI_BINARIES_DIR);

  const stageRoot = join(NODE_SIDECAR_STAGE_ROOT, runtimeDefinition.sidecarName);
  await ensureCleanDir(stageRoot);
  await copyDirectory(runtimeDefinition.backendDistDir, stageRoot);
  await rm(join(stageRoot, 'pnpm-lock.yaml'), { force: true });

  const backendPackageJson = await readJson<PackageJson>(distPackageJsonPath);
  await writeJson(
    join(stageRoot, 'package.json'),
    buildNodeSidecarPackageJson({
      backendPackageJson,
      packageManager: rootPackageJson.packageManager,
      sidecarName: runtimeDefinition.sidecarName,
      sqliteVersion: sqlitePackageJson.version,
    }),
  );
  await writeTextFile(join(stageRoot, '.npmrc'), NODE_BACKEND_INSTALL_NPMRC);

  logStep(
    `Installing production dependencies for the packaged ${runtimeDefinition.label} sidecar (${target.profile})`,
  );
  await installStagedProductionDependencies({
    cwd: stageRoot,
    label: `packaged ${runtimeDefinition.label} sidecar`,
  });

  const sqliteBindingPath = join(
    stageRoot,
    'node_modules',
    'sqlite3',
    'build',
    'Release',
    'node_sqlite3.node',
  );
  if (!(await fileExists(sqliteBindingPath))) {
    throw new Error(
      `sqlite3 native binding was not built correctly for the ${runtimeDefinition.label} sidecar. Expected ${sqliteBindingPath} to exist.`,
    );
  }

  const sidecarBuildDir = join(stageRoot, 'sidecar-build');
  await ensureCleanDir(sidecarBuildDir);
  const outputBasePath = join(sidecarBuildDir, runtimeDefinition.sidecarName);
  logStep(`Packaging the ${runtimeDefinition.label} backend into a self-contained sidecar executable`);
  await runCommand(
    PNPM_COMMAND,
    ['exec', 'pkg', '.', '--targets', 'host', '--fallback-to-source', '--output', outputBasePath],
    {
      cwd: stageRoot,
      env: {
        ...process.env,
        CI: 'true',
      },
    },
  );

  const packagedSidecarPath = `${outputBasePath}${target.hostPlatform === 'win32' ? '.exe' : ''}`;
  if (!(await fileExists(packagedSidecarPath))) {
    throw new Error(
      `pkg did not create the ${runtimeDefinition.label} sidecar executable at ${packagedSidecarPath}.`,
    );
  }

  const tauriSidecarPath = getTauriSidecarBinaryPath(runtimeDefinition.sidecarName, target);
  await rm(tauriSidecarPath, { force: true });
  await copyFileEnsured(packagedSidecarPath, tauriSidecarPath);
  if (target.hostPlatform !== 'win32') {
    await chmod(tauriSidecarPath, 0o755);
  }

  await ensureDir(runtimeDefinition.tauriMetadataDir);
  await writeJson(
    join(runtimeDefinition.tauriMetadataDir, 'desktop-runtime.json'),
    buildDesktopRuntimeMetadata({
      backendKind: runtimeDefinition.backendKind,
      profile: target.profile,
      sidecarName: runtimeDefinition.sidecarName,
    }),
  );
  await writeTextFile(
    join(runtimeDefinition.tauriMetadataDir, '.tauri-database-name'),
    `${DATABASE_FILE_NAME}\n`,
  );

  logStep(
    `${runtimeDefinition.label} sidecar Tauri runtime materialized for ${target.profile} at ${runtimeDefinition.tauriDistRoot}`,
  );
}

function parseRuntimeMode(value: string | undefined): NodeSidecarRuntimeMode {
  if (!value || value === 'nest') {
    return 'nest';
  }

  if (value === 'express') {
    return 'express';
  }

  throw new Error(`Unsupported node sidecar runtime "${value}". Expected "nest" or "express".`);
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
