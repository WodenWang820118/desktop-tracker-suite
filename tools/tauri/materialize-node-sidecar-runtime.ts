import { createHash } from 'node:crypto';
import { chmod, readdir, readFile, rm } from 'node:fs/promises';
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
  NODE_BACKEND_INSTALL_WORKSPACE_CONFIG,
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

type NodeSidecarCacheManifest = {
  cacheKey: string;
  packagedSidecarPath: string;
  schemaVersion: number;
};

export type NodeSidecarCacheKeyInput = {
  backendDistHash: string;
  backendKind: NodeDesktopRuntimeMetadata['backendKind'];
  cacheSchemaVersion: number;
  installEnvironment: Record<string, string>;
  packageManager?: string;
  packagedPackageJson: unknown;
  pkgEnvironment: Record<string, string>;
  pkgVersion: string;
  pnpmLockHash: string;
  processArch: string;
  processPlatform: string;
  processVersion: string;
  profile: string;
  rustTarget: string;
  sidecarName: string;
};

const NODE_SIDECAR_CACHE_SCHEMA_VERSION = 1;
const NODE_SIDECAR_CACHE_MANIFEST_NAME = 'materialize-cache.json';

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

export function buildNodeSidecarCacheKey(input: NodeSidecarCacheKeyInput): string {
  return createHash('sha256').update(stableJson(input)).digest('hex');
}

export function buildNodeSidecarCacheManifest(input: {
  cacheKey: string;
  packagedSidecarPath: string;
}): NodeSidecarCacheManifest {
  return {
    cacheKey: input.cacheKey,
    packagedSidecarPath: input.packagedSidecarPath,
    schemaVersion: NODE_SIDECAR_CACHE_SCHEMA_VERSION,
  };
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

  const backendPackageJson = await readJson<PackageJson>(distPackageJsonPath);
  const packagedPackageJson = buildNodeSidecarPackageJson({
    backendPackageJson,
    packageManager: rootPackageJson.packageManager,
    sidecarName: runtimeDefinition.sidecarName,
    sqliteVersion: sqlitePackageJson.version,
  });
  const stageRoot = join(NODE_SIDECAR_STAGE_ROOT, runtimeDefinition.sidecarName);
  const sidecarBuildDir = join(stageRoot, 'sidecar-build');
  const outputBasePath = join(sidecarBuildDir, runtimeDefinition.sidecarName);
  const packagedSidecarPath = `${outputBasePath}${target.hostPlatform === 'win32' ? '.exe' : ''}`;
  const cacheKey = buildNodeSidecarCacheKey({
    backendDistHash: await hashDirectory(runtimeDefinition.backendDistDir),
    backendKind: runtimeDefinition.backendKind,
    cacheSchemaVersion: NODE_SIDECAR_CACHE_SCHEMA_VERSION,
    installEnvironment: buildInstallCacheEnvironment(),
    packageManager: rootPackageJson.packageManager,
    packagedPackageJson,
    pkgEnvironment: buildPkgCacheEnvironment(),
    pkgVersion: await readPkgVersion(),
    pnpmLockHash: await hashFile(join(WORKSPACE_ROOT, 'pnpm-lock.yaml')),
    processArch: process.arch,
    processPlatform: process.platform,
    processVersion: process.version,
    profile: target.profile,
    rustTarget: target.rustTarget,
    sidecarName: runtimeDefinition.sidecarName,
  });

  const cachedSidecar = await resolveCachedSidecar({
    cacheKey,
    expectedPackagedSidecarPath: packagedSidecarPath,
    manifestPath: join(stageRoot, NODE_SIDECAR_CACHE_MANIFEST_NAME),
  });
  if (cachedSidecar.hit) {
    logStep(
      `[CACHE HIT] Using cached ${runtimeDefinition.label} sidecar for ${target.profile}.`,
    );
    await publishNodeSidecarRuntime({
      packagedSidecarPath: cachedSidecar.packagedSidecarPath,
      runtimeDefinition,
      target,
    });
    return;
  }

  logStep(`[CACHE MISS] ${cachedSidecar.reason}`);
  await ensureCleanDir(stageRoot);
  await copyDirectory(runtimeDefinition.backendDistDir, stageRoot);
  await rm(join(stageRoot, 'pnpm-lock.yaml'), { force: true });
  await writeJson(
    join(stageRoot, 'package.json'),
    packagedPackageJson,
  );
  await writeTextFile(
    join(stageRoot, 'pnpm-workspace.yaml'),
    NODE_BACKEND_INSTALL_WORKSPACE_CONFIG,
  );

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

  await ensureCleanDir(sidecarBuildDir);
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

  if (!(await fileExists(packagedSidecarPath))) {
    throw new Error(
      `pkg did not create the ${runtimeDefinition.label} sidecar executable at ${packagedSidecarPath}.`,
    );
  }

  await writeJson(
    join(stageRoot, NODE_SIDECAR_CACHE_MANIFEST_NAME),
    buildNodeSidecarCacheManifest({
      cacheKey,
      packagedSidecarPath,
    }),
  );

  await publishNodeSidecarRuntime({
    packagedSidecarPath,
    runtimeDefinition,
    target,
  });
}

async function publishNodeSidecarRuntime({
  packagedSidecarPath,
  runtimeDefinition,
  target,
}: {
  packagedSidecarPath: string;
  runtimeDefinition: NodeSidecarRuntimeDefinition;
  target: ReturnType<typeof resolveDesktopTargetInfo>;
}) {
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

async function resolveCachedSidecar({
  cacheKey,
  expectedPackagedSidecarPath,
  manifestPath,
}: {
  cacheKey: string;
  expectedPackagedSidecarPath: string;
  manifestPath: string;
}): Promise<
  | { hit: true; packagedSidecarPath: string }
  | { hit: false; reason: string }
> {
  if (!(await fileExists(manifestPath))) {
    return { hit: false, reason: 'No existing node sidecar cache manifest was found.' };
  }

  const manifest = await readJson<NodeSidecarCacheManifest>(manifestPath);
  if (
    manifest.schemaVersion !== NODE_SIDECAR_CACHE_SCHEMA_VERSION ||
    manifest.cacheKey !== cacheKey
  ) {
    return { hit: false, reason: 'Node sidecar cache key mismatch.' };
  }

  if (manifest.packagedSidecarPath !== expectedPackagedSidecarPath) {
    return { hit: false, reason: 'Cached node sidecar executable path mismatch.' };
  }

  if (!(await fileExists(expectedPackagedSidecarPath))) {
    return { hit: false, reason: 'Cached node sidecar executable is missing.' };
  }

  return {
    hit: true,
    packagedSidecarPath: expectedPackagedSidecarPath,
  };
}

function buildInstallCacheEnvironment(): Record<string, string> {
  return {
    CI: 'true',
    npm_config_confirm_modules_purge: 'false',
    npm_config_node_linker: 'hoisted',
  };
}

function buildPkgCacheEnvironment(): Record<string, string> {
  return {
    CI: 'true',
  };
}

async function readPkgVersion(): Promise<string> {
  const pkgPackageJson = await readJson<{ version?: string }>(
    join(WORKSPACE_ROOT, 'node_modules', '@yao-pkg', 'pkg', 'package.json'),
  );
  const version = pkgPackageJson.version?.trim();
  if (!version) {
    throw new Error('@yao-pkg/pkg is missing from the installed workspace dependencies.');
  }

  return version;
}

async function hashDirectory(root: string): Promise<string> {
  const entries = await listDirectoryFiles(root);
  const hasher = createHash('sha256');
  for (const entry of entries) {
    hasher.update(entry.relativePath);
    hasher.update('\0');
    hasher.update(entry.hash);
    hasher.update('\0');
  }

  return hasher.digest('hex');
}

async function listDirectoryFiles(
  root: string,
  relativeRoot = '',
): Promise<Array<{ hash: string; relativePath: string }>> {
  const entries = await readdir(join(root, relativeRoot), { withFileTypes: true });
  const files: Array<{ hash: string; relativePath: string }> = [];
  for (const entry of entries) {
    const relativePath = relativeRoot ? join(relativeRoot, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listDirectoryFiles(root, relativePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push({
        hash: await hashFile(join(root, relativePath)),
        relativePath: relativePath.replaceAll('\\', '/'),
      });
    }
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function hashFile(path: string): Promise<string> {
  const hasher = createHash('sha256');
  hasher.update(await readFile(path));
  return hasher.digest('hex');
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)]),
    );
  }

  return value;
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
