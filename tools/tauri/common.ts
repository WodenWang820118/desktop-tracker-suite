import {
  spawn,
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
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
  type DesktopTargetInfo,
} from './runtime-target.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const WORKSPACE_ROOT = resolve(__dirname, '..', '..');
export const TAURI_PROJECT_ROOT = join(WORKSPACE_ROOT, 'apps', 'tauri-shell');
export const TAURI_SRC_TAURI_ROOT = join(TAURI_PROJECT_ROOT, 'src-tauri');
export const TAURI_BINARIES_DIR = join(TAURI_SRC_TAURI_ROOT, 'binaries');
export const DIST_ROOT = join(WORKSPACE_ROOT, 'dist');
export const TAURI_DIST_ROOT = join(DIST_ROOT, 'tauri-shell');
export const TAURI_RESOURCE_ROOT = join(TAURI_DIST_ROOT, 'resources');
export const BACKEND_RUNTIME_DIR = join(TAURI_RESOURCE_ROOT, 'backend-runtime');
export const NODE_RUNTIME_DIR = join(TAURI_RESOURCE_ROOT, 'nodejs');
export const TAURI_METADATA_DIR = join(TAURI_RESOURCE_ROOT, 'metadata');
export const SPRING_NATIVE_DIST_DIR = join(DIST_ROOT, 'spring-backend-native');
export const TAURI_SPRING_DIST_ROOT = join(DIST_ROOT, 'tauri-shell-spring-native');
export const TAURI_SPRING_RESOURCE_ROOT = join(TAURI_SPRING_DIST_ROOT, 'resources');
export const SPRING_NATIVE_RUNTIME_DIR = join(TAURI_SPRING_RESOURCE_ROOT, 'spring-native');
export const TAURI_SPRING_METADATA_DIR = join(TAURI_SPRING_RESOURCE_ROOT, 'metadata');
export const NODE_CACHE_DIR = join(WORKSPACE_ROOT, '.cache', 'tauri-shell');
export const NG_DIST_BROWSER_DIR = join(DIST_ROOT, 'ng-tracker', 'browser');
export const NEST_DIST_DIR = join(DIST_ROOT, 'nest-backend');
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

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

export async function ensureCleanDir(path: string) {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}

export async function copyDirectory(source: string, destination: string) {
  await cp(source, destination, { recursive: true, force: true });
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeTextFile(path: string, value: string) {
  await writeFile(path, value, 'utf8');
}

export async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      logStep(`Wait for ${url} attempt ${attempt} returned ${response.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStep(`Wait for ${url} attempt ${attempt} failed: ${message}`);
    }

    await sleep(delayMs);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runCommand(
  command: string,
  args: string[],
  options: SpawnOptions = {},
) {
  logStep(`> ${command} ${args.join(' ')}`);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: WORKSPACE_ROOT,
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
      ...options,
    });

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} exited with code ${String(code)} and signal ${String(
            signal,
          )}`,
        ),
      );
    });
  });
}

export function spawnLogged(
  command: string,
  args: string[],
  options: SpawnOptions = {},
) {
  logStep(`> ${command} ${args.join(' ')}`);

  return spawn(command, args, {
    stdio: 'inherit',
    cwd: WORKSPACE_ROOT,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    ...options,
  });
}

export async function terminateChildProcess(child: ChildProcess | undefined, label: string) {
  if (!child || !child.pid || child.exitCode !== null) return;

  logStep(`Stopping ${label} (pid ${child.pid})`);
  child.kill();

  const exited = await waitForExit(child, 5000);
  if (exited) return;

  if (process.platform === 'win32') {
    await runCommand('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    await waitForExit(child, 2000);
    return;
  }

  child.kill('SIGKILL');
  await waitForExit(child, 2000);
}

export async function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null) return true;

  return new Promise<boolean>((resolvePromise) => {
    const timeout = setTimeout(() => {
      resolvePromise(false);
    }, timeoutMs);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise(true);
    });
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
