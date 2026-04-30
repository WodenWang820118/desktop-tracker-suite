import {
  spawnSync,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  chmod,
  copyFile,
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
  type DesktopTargetInfo,
} from './runtime-target.ts';
import {
  ensureDir as ensureSharedDir,
  fileExists as sharedFileExists,
  type WorkspacePathOptions,
  writeJson as writeSharedJson,
} from '../shared/fs.ts';
import { waitForUrl as waitForSharedUrl } from '../shared/http.ts';
import {
  runCommand as runSharedCommand,
  RunCommandError,
  type RunCommandOptions,
  spawnLogged as spawnSharedLogged,
  terminateChildProcess as terminateSharedChildProcess,
} from '../shared/process.ts';
import { sleep } from '../shared/time.ts';
import { WORKSPACE_ROOT } from '../shared/workspace.ts';

export const TAURI_PROJECT_ROOT = join(WORKSPACE_ROOT, 'apps', 'tauri-shell');
export const TAURI_SRC_TAURI_ROOT = join(TAURI_PROJECT_ROOT, 'src-tauri');
export const TAURI_BINARIES_DIR = join(TAURI_SRC_TAURI_ROOT, 'binaries');
export const DIST_ROOT = join(WORKSPACE_ROOT, 'dist');
export const TAURI_DIST_ROOT = join(DIST_ROOT, 'tauri-shell');
export const TAURI_RESOURCE_ROOT = join(TAURI_DIST_ROOT, 'resources');
export const BACKEND_RUNTIME_DIR = join(TAURI_RESOURCE_ROOT, 'backend-runtime');
export const NODE_RUNTIME_DIR = join(TAURI_RESOURCE_ROOT, 'nodejs');
export const TAURI_METADATA_DIR = join(TAURI_RESOURCE_ROOT, 'metadata');
export const TAURI_NEST_SIDECAR_DIST_ROOT = join(DIST_ROOT, 'tauri-shell-nest-sidecar');
export const TAURI_NEST_SIDECAR_RESOURCE_ROOT = join(TAURI_NEST_SIDECAR_DIST_ROOT, 'resources');
export const TAURI_NEST_SIDECAR_METADATA_DIR = join(
  TAURI_NEST_SIDECAR_RESOURCE_ROOT,
  'metadata',
);
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
export const SPRING_NATIVE_DIST_DIR = join(DIST_ROOT, 'spring-backend-native');
export const TAURI_SPRING_DIST_ROOT = join(DIST_ROOT, 'tauri-shell-spring-native');
export const TAURI_SPRING_RESOURCE_ROOT = join(TAURI_SPRING_DIST_ROOT, 'resources');
export const SPRING_NATIVE_RUNTIME_DIR = join(TAURI_SPRING_RESOURCE_ROOT, 'spring-native');
export const TAURI_SPRING_METADATA_DIR = join(TAURI_SPRING_RESOURCE_ROOT, 'metadata');
export const NODE_CACHE_DIR = join(WORKSPACE_ROOT, '.cache', 'tauri-shell');
export const NODE_SIDECAR_STAGE_ROOT = join(NODE_CACHE_DIR, 'node-sidecars');
export const NG_DIST_BROWSER_DIR = join(DIST_ROOT, 'ng-tracker', 'browser');
export const NEST_DIST_DIR = join(DIST_ROOT, 'nest-backend');
export const EXPRESS_DIST_DIR = join(DIST_ROOT, 'express-backend');
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

export function logStep(message: string) {
  console.log(`[tauri-shell] ${message}`);
}

export { sleep, WORKSPACE_ROOT };

export async function ensureDir(path: string, options?: WorkspacePathOptions) {
  await ensureSharedDir(path, options);
}

export async function ensureCleanDir(path: string) {
  await rm(path, { recursive: true, force: true });
  await ensureDir(path);
}

export async function copyDirectory(source: string, destination: string) {
  await cp(source, destination, { recursive: true, force: true });
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeJson(
  path: string,
  value: unknown,
  options?: WorkspacePathOptions,
) {
  await writeSharedJson(path, value, options);
}

export async function writeTextFile(path: string, value: string) {
  await writeFile(path, value, 'utf8');
}

export async function fileExists(path: string, options?: WorkspacePathOptions) {
  return await sharedFileExists(path, options);
}

export async function waitForUrl(
  url: string,
  {
    attempts = 60,
    delayMs = 1000,
  }: {
    attempts?: number;
    delayMs?: number;
  } = {},
) {
  await waitForSharedUrl(url, {
    attempts,
    delayMs,
    onRetry(event) {
      if (typeof event.status === 'number') {
        logStep(`Wait for ${url} attempt ${event.attempt} returned ${event.status}`);
        return;
      }

      logStep(
        `Wait for ${url} attempt ${event.attempt} failed: ${
          event.errorMessage ?? 'unknown error'
        }`,
      );
    },
  });
}

export async function runCommand(
  command: string,
  args: string[],
  options: SpawnOptions = {},
) {
  await runSharedCommand(command, args, {
    log: logStep,
    ...options,
  });
}

type StagedProductionDependencyInstallRunner = (
  command: string,
  args: string[],
  options: RunCommandOptions,
) => Promise<unknown>;

export interface InstallStagedProductionDependenciesOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  isCi?: boolean;
  label: string;
  platform?: NodeJS.Platform;
  run?: StagedProductionDependencyInstallRunner;
}

const STAGED_PRODUCTION_DEPENDENCY_INSTALL_ARGS = [
  'install',
  '--prod',
  '--no-lockfile',
] as const;

export function buildStagedProductionDependencyInstallArgs({
  offline,
}: {
  offline: boolean;
}): string[] {
  return offline
    ? [...STAGED_PRODUCTION_DEPENDENCY_INSTALL_ARGS, '--offline']
    : [...STAGED_PRODUCTION_DEPENDENCY_INSTALL_ARGS];
}

export function isPnpmOfflineMetadataMiss(error: unknown): boolean {
  if (!(error instanceof RunCommandError)) {
    return false;
  }

  const diagnosticText = [error.stdout, error.stderr, error.message].join('\n');
  return /\bERR_PNPM_NO_OFFLINE_META\b/u.test(diagnosticText);
}

export async function installStagedProductionDependencies({
  cwd,
  env,
  isCi = process.env.CI === 'true',
  label,
  platform = process.platform,
  run = runSharedCommand,
}: InstallStagedProductionDependenciesOptions): Promise<void> {
  const workspaceConfigPath = join(cwd, 'pnpm-workspace.yaml');
  if (!existsSync(workspaceConfigPath)) {
    throw new Error(
      `Staged pnpm workspace config is missing at ${workspaceConfigPath}. ` +
        'Write pnpm-workspace.yaml before installing staged production dependencies.',
    );
  }

  // Keep --ignore-workspace off: pnpm 11 must read the staged allowBuilds
  // policy. Callers anchor the stage with packages: [] in pnpm-workspace.yaml.
  const installEnv = {
    ...process.env,
    ...env,
    CI: 'true',
    // Defense in depth; the canonical staged pnpm policy lives in
    // pnpm-workspace.yaml so build-script approvals are versioned together.
    npm_config_node_linker: 'hoisted',
    npm_config_confirm_modules_purge: 'false',
  };
  const baseOptions = {
    cwd,
    env: installEnv,
    log: logStep,
  };
  if (isCi && platform === 'win32') {
    logStep(
      `Using online pnpm production dependency install for ${label} on Windows CI.`,
    );
    await run(PNPM_COMMAND, buildStagedProductionDependencyInstallArgs({ offline: false }), {
      ...baseOptions,
      stdio: 'inherit',
    });
    return;
  }

  try {
    await run(PNPM_COMMAND, buildStagedProductionDependencyInstallArgs({ offline: true }), {
      ...baseOptions,
      stdio: 'pipe',
    });
    return;
  } catch (error) {
    if (!isCi || !isPnpmOfflineMetadataMiss(error)) {
      throw error;
    }

    logStep(
      `Offline pnpm metadata is unavailable for ${label}; retrying production dependency install online.`,
    );

    try {
      await run(PNPM_COMMAND, buildStagedProductionDependencyInstallArgs({ offline: false }), {
        ...baseOptions,
        stdio: 'inherit',
      });
    } catch (fallbackError) {
      throw new Error(
        `Online pnpm install fallback failed after an offline metadata miss for ${label}.`,
        { cause: fallbackError },
      );
    }
  }
}

export function spawnLogged(
  command: string,
  args: string[],
  options: SpawnOptions = {},
) {
  return spawnSharedLogged(command, args, {
    log: logStep,
    ...options,
  });
}

export async function terminateChildProcess(child: ChildProcess | undefined, label: string) {
  await terminateSharedChildProcess(child, label, {
    log(message) {
      logStep(
        message.startsWith('stopping ')
          ? `Stopping ${message.slice('stopping '.length)}`
          : message,
      );
    },
  });
}

export async function stopStaleTauriBackendProcesses() {
  const staleProcesses =
    process.platform === 'win32'
      ? inspectWindowsStaleBackendProcesses()
      : inspectPosixStaleBackendProcesses();

  if (staleProcesses.length === 0) return;

  logStep(
    `Stopping ${staleProcesses.length} stale packaged backend process(es) before materializing the Tauri runtime`,
  );

  for (const { pid, commandLine } of staleProcesses) {
    logStep(`Stopping stale packaged backend process ${pid}: ${commandLine}`);
    try {
      if (process.platform === 'win32') {
        await runCommand('taskkill', ['/PID', pid, '/T', '/F']);
      } else {
        await terminatePosixProcess(Number(pid));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStep(`Ignoring stale backend shutdown failure for pid ${pid}: ${message}`);
    }
  }

  await sleep(500);
}

function runWindowsPowerShell(script: string) {
  const shellArgs = ['-NoProfile', '-NonInteractive', '-Command', script];
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const shellCandidates = [
    join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    join(systemRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    'powershell.exe',
    'powershell',
    'pwsh.exe',
    'pwsh',
  ];
  let lastError: NodeJS.ErrnoException | undefined;

  for (const shellCandidate of shellCandidates) {
    const result = spawnSync(shellCandidate, shellArgs, {
      encoding: 'utf8',
    });
    const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      lastError = result.error as NodeJS.ErrnoException;
      continue;
    }

    return result;
  }

  throw lastError ?? new Error('Could not find a PowerShell executable on PATH.');
}

function inspectWindowsStaleBackendProcesses() {
  const probe = runWindowsPowerShell(
    [
      "$legacyNodeSuffix = '\\dist\\tauri-shell\\resources\\backend-runtime\\main.js'",
      "$springSidecarSuffix = '\\apps\\tauri-shell\\src-tauri\\binaries\\spring-backend-'",
      "$nestSidecarSuffix = '\\apps\\tauri-shell\\src-tauri\\binaries\\nest-backend-'",
      "$expressSidecarSuffix = '\\apps\\tauri-shell\\src-tauri\\binaries\\express-backend-'",
      '$processes = Get-CimInstance Win32_Process | Where-Object { ' +
        "($_.Name -ieq 'node.exe' -and $null -ne $_.CommandLine -and $_.CommandLine -like \"*$legacyNodeSuffix*\") -or " +
        "($_.Name -like 'spring-backend-*.exe' -and $null -ne $_.CommandLine -and $_.CommandLine -like \"*$springSidecarSuffix*\") -or " +
        "($_.Name -like 'nest-backend-*.exe' -and $null -ne $_.CommandLine -and $_.CommandLine -like \"*$nestSidecarSuffix*\") -or " +
        "($_.Name -like 'express-backend-*.exe' -and $null -ne $_.CommandLine -and $_.CommandLine -like \"*$expressSidecarSuffix*\") }",
      '$processes | ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }',
    ].join('; '),
  );

  if (probe.error) {
    throw probe.error;
  }

  if (probe.status !== 0) {
    const stderr = probe.stderr.trim();
    const stdout = probe.stdout.trim();
    throw new Error(
      `Failed to inspect stale Tauri backend processes.${stderr ? ` ${stderr}` : ''}${
        stdout ? ` ${stdout}` : ''
      }`,
    );
  }

  return probe.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, commandLine = ''] = line.split('\t');
      return {
        pid,
        commandLine,
      };
    });
}

function inspectPosixStaleBackendProcesses() {
  const probe = spawnSync('ps', ['-ax', '-o', 'pid=', '-o', 'command='], {
    encoding: 'utf8',
  });

  if (probe.error) {
    throw probe.error;
  }

  if (probe.status !== 0) {
    const stderr = probe.stderr.trim();
    throw new Error(
      `Failed to inspect stale Tauri backend processes.${stderr ? ` ${stderr}` : ''}`,
    );
  }

  return probe.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/u);
      if (!match) {
        return null;
      }

      const [, pid, commandLine] = match;
      return { pid, commandLine };
    })
    .filter(
      (entry): entry is { pid: string; commandLine: string } =>
        entry !== null &&
        (
          entry.commandLine.includes('/dist/tauri-shell/resources/backend-runtime/main.js') ||
          entry.commandLine.includes('/apps/tauri-shell/src-tauri/binaries/spring-backend-') ||
          entry.commandLine.includes('/apps/tauri-shell/src-tauri/binaries/nest-backend-') ||
          entry.commandLine.includes('/apps/tauri-shell/src-tauri/binaries/express-backend-')
        ),
    );
}

async function terminatePosixProcess(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid process id ${String(pid)}.`);
  }

  if (!isProcessRunning(pid)) return;

  process.kill(pid, 'SIGTERM');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!isProcessRunning(pid)) {
      return;
    }

    await sleep(200);
  }

  if (isProcessRunning(pid)) {
    process.kill(pid, 'SIGKILL');
  }
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code !== 'ESRCH';
  }
}

export async function sha256(path: string) {
  const buffer = await readFile(path);
  return createHash('sha256').update(buffer).digest('hex');
}

export async function copyFileEnsured(source: string, destination: string) {
  await ensureDir(dirname(destination));
  await copyFile(source, destination);
}

export function getPackagedNodeExecutablePath(
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  return join(NODE_RUNTIME_DIR, target.nodeBinaryName);
}

export function getTauriSidecarBinaryFileName(
  sidecarName: string,
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  const extension = target.hostPlatform === 'win32' ? '.exe' : '';
  return `${sidecarName}-${target.rustTarget}${extension}`;
}

export function getTauriSidecarBinaryPath(
  sidecarName: string,
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  return join(TAURI_BINARIES_DIR, getTauriSidecarBinaryFileName(sidecarName, target));
}

export function getPreparedSpringSidecarPath(
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  return getTauriSidecarBinaryPath(SPRING_BACKEND_SIDECAR_NAME, target);
}

function getCachedNodeExecutablePath(target: DesktopTargetInfo) {
  return join(NODE_CACHE_DIR, target.nodeCacheFileName);
}

function getCachedNodeArchivePath(target: DesktopTargetInfo) {
  if (!target.nodeArchiveFileName) {
    return null;
  }

  return join(NODE_CACHE_DIR, target.nodeArchiveFileName);
}

export async function ensureNodeBinaryDownloaded(
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  assertHostCanBuildDesktopTarget(target);
  await ensureDir(NODE_CACHE_DIR);
  const shasumsUrl = `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`;
  const distributionPath = target.nodeDistributionPath;
  const distributionUrl = `https://nodejs.org/dist/v${NODE_VERSION}/${distributionPath}`;
  const expectedSha = await resolveNodeDistributionChecksum(shasumsUrl, distributionPath);
  const cachedExecutablePath = getCachedNodeExecutablePath(target);

  if (target.nodeArchiveFileName && target.nodeArchiveEntryPath) {
    const archivePath = getCachedNodeArchivePath(target);
    if (!archivePath) {
      throw new Error(`Target ${target.profile} is missing a node archive path.`);
    }

    if (!existsSync(archivePath) || (await sha256(archivePath)) !== expectedSha) {
      await downloadNodeArtifact(distributionUrl, archivePath);
    }

    const actualSha = await sha256(archivePath);
    if (actualSha !== expectedSha) {
      throw new Error(
        `Downloaded ${target.nodeArchiveFileName} checksum mismatch. Expected ${expectedSha}, received ${actualSha}.`,
      );
    }

    await extractNodeBinaryFromArchive(archivePath, target.nodeArchiveEntryPath, cachedExecutablePath);
    await ensureExecutablePermissions(cachedExecutablePath);
    logStep(`Pinned Node runtime is ready at ${cachedExecutablePath}`);
    return cachedExecutablePath;
  }

  if (!existsSync(cachedExecutablePath) || (await sha256(cachedExecutablePath)) !== expectedSha) {
    await downloadNodeArtifact(distributionUrl, cachedExecutablePath);
  }

  const actualSha = await sha256(cachedExecutablePath);
  if (actualSha !== expectedSha) {
    throw new Error(
      `Downloaded ${target.nodeBinaryName} checksum mismatch. Expected ${expectedSha}, received ${actualSha}.`,
    );
  }

  await ensureExecutablePermissions(cachedExecutablePath);
  logStep(`Pinned Node runtime is ready at ${cachedExecutablePath}`);
  return cachedExecutablePath;
}

async function downloadNodeArtifact(url: string, destinationPath: string) {
  logStep(`Downloading pinned Node runtime ${NODE_VERSION} from ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(destinationPath, Buffer.from(arrayBuffer));
}

async function resolveNodeDistributionChecksum(shasumsUrl: string, distributionPath: string) {
  const response = await fetch(shasumsUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${shasumsUrl}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const normalizedPath = distributionPath.replaceAll('\\', '/');
  const line = text
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find((entry) => entry.endsWith(normalizedPath));

  if (!line) {
    throw new Error(`Could not find the checksum for ${normalizedPath} in ${shasumsUrl}`);
  }

  const [checksum] = line.split(/\s+/u);
  return checksum;
}

async function extractNodeBinaryFromArchive(
  archivePath: string,
  archiveEntryPath: string,
  destinationPath: string,
) {
  const extractionRoot = await mkdtemp(join(tmpdir(), 'tauri-node-runtime-'));
  try {
    await runCommand('tar', ['-xzf', archivePath, '-C', extractionRoot, archiveEntryPath]);
    await copyFileEnsured(join(extractionRoot, archiveEntryPath), destinationPath);
  } finally {
    await rm(extractionRoot, { recursive: true, force: true });
  }
}

async function ensureExecutablePermissions(path: string) {
  if (process.platform === 'win32') {
    return;
  }

  await chmod(path, 0o755);
}

