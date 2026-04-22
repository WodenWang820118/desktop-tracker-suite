import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const WORKSPACE_ROOT = resolve(__dirname, '..', '..');
export const TAURI_PROJECT_ROOT = join(WORKSPACE_ROOT, 'apps', 'tauri-shell');
export const TAURI_SRC_TAURI_ROOT = join(TAURI_PROJECT_ROOT, 'src-tauri');
export const DIST_ROOT = join(WORKSPACE_ROOT, 'dist');
export const TAURI_DIST_ROOT = join(DIST_ROOT, 'tauri-shell');
export const TAURI_RESOURCE_ROOT = join(TAURI_DIST_ROOT, 'resources');
export const BACKEND_RUNTIME_DIR = join(TAURI_RESOURCE_ROOT, 'backend-runtime');
export const NODE_RUNTIME_DIR = join(TAURI_RESOURCE_ROOT, 'nodejs');
export const NODE_CACHE_DIR = join(WORKSPACE_ROOT, '.cache', 'tauri-shell');
export const NG_DIST_BROWSER_DIR = join(DIST_ROOT, 'ng-tracker', 'browser');
export const NEST_DIST_DIR = join(DIST_ROOT, 'nest-backend');
export const NODE_VERSION = '24.11.1';
export const NODE_EXE_NAME = 'node.exe';
export const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
export const CACHED_NODE_EXE = join(NODE_CACHE_DIR, `node-v${NODE_VERSION}-win-x64.exe`);
export const PACKAGED_NODE_EXE = join(NODE_RUNTIME_DIR, NODE_EXE_NAME);
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
  if (process.platform !== 'win32') return;

  const probe = runWindowsPowerShell(
    [
      "$targetSuffix = '\\dist\\tauri-shell\\resources\\backend-runtime\\main.js'",
      "$processes = Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'node.exe' -and $null -ne $_.CommandLine -and $_.CommandLine -like \"*$targetSuffix*\" }",
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

  const staleProcesses = probe.stdout
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

  if (staleProcesses.length === 0) return;

  logStep(
    `Stopping ${staleProcesses.length} stale packaged backend process(es) before materializing the Tauri runtime`,
  );

  for (const { pid, commandLine } of staleProcesses) {
    logStep(`Stopping stale packaged backend process ${pid}: ${commandLine}`);
    try {
      await runCommand('taskkill', ['/PID', pid, '/T', '/F']);
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

export async function sha256(path: string) {
  const buffer = await readFile(path);
  return createHash('sha256').update(buffer).digest('hex');
}

export async function copyFileEnsured(source: string, destination: string) {
  await ensureDir(dirname(destination));
  await copyFile(source, destination);
}

export async function ensureNodeBinaryDownloaded() {
  await ensureDir(NODE_CACHE_DIR);

  const shasumsUrl = `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`;
  const nodeExeUrl = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;
  const expectedSha = await resolveNodeExeChecksum(shasumsUrl);

  if (!existsSync(CACHED_NODE_EXE) || (await sha256(CACHED_NODE_EXE)) !== expectedSha) {
    logStep(`Downloading pinned Node runtime ${NODE_VERSION} from ${nodeExeUrl}`);
    const response = await fetch(nodeExeUrl);
    if (!response.ok) {
      throw new Error(`Failed to download ${nodeExeUrl}: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await writeFile(CACHED_NODE_EXE, Buffer.from(arrayBuffer));
  }

  const actualSha = await sha256(CACHED_NODE_EXE);
  if (actualSha !== expectedSha) {
    throw new Error(
      `Downloaded node.exe checksum mismatch. Expected ${expectedSha}, received ${actualSha}.`,
    );
  }

  logStep(`Pinned Node runtime is ready at ${CACHED_NODE_EXE}`);
}

async function resolveNodeExeChecksum(shasumsUrl: string) {
  const response = await fetch(shasumsUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${shasumsUrl}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const line = text
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find((entry) => entry.endsWith('win-x64/node.exe'));

  if (!line) {
    throw new Error(`Could not find the checksum for win-x64/node.exe in ${shasumsUrl}`);
  }

  const [checksum] = line.split(/\s+/u);
  return checksum;
}
