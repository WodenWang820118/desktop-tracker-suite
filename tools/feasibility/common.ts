import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const WORKSPACE_ROOT = resolve(__dirname, '..', '..');
export const FEASIBILITY_OUTPUT_DIR = join(
  WORKSPACE_ROOT,
  'dist',
  'feasibility',
  'graalvm-desktop',
  'windows',
);

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

export async function writeJson(path: string, value: unknown) {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeMetricSnapshot(fileName: string, value: unknown) {
  await ensureDir(FEASIBILITY_OUTPUT_DIR);
  await writeJson(join(FEASIBILITY_OUTPUT_DIR, fileName), value);
}

export async function pathSize(path: string): Promise<number> {
  const info = await stat(path);
  if (info.isFile()) {
    return info.size;
  }

  if (!info.isDirectory()) {
    return 0;
  }

  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map((entry) => pathSize(join(path, entry.name))),
  );
  return sizes.reduce((total, current) => total + current, 0);
}

export async function reserveOpenPort() {
  return await new Promise<number>((resolvePromise, rejectPromise) => {
    const server = createServer();

    server.on('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectPromise(new Error('Failed to reserve an open port.'));
        return;
      }

      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }

        resolvePromise(address.port);
      });
    });
  });
}

export async function sleep(ms: number) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return Date.now() - startedAt;
      }
    } catch {
      // Ignore and retry until timeout.
    }

    await sleep(delayMs);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export function spawnLogged(
  command: string,
  args: string[],
  options: SpawnOptions = {},
) {
  console.log(`[feasibility] > ${command} ${args.join(' ')}`);
  return spawn(command, args, {
    stdio: 'inherit',
    cwd: WORKSPACE_ROOT,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    ...options,
  });
}

export async function terminateChildProcess(
  child: ChildProcess | undefined,
  label: string,
) {
  if (!child || !child.pid || child.exitCode !== null) {
    return;
  }

  console.log(`[feasibility] stopping ${label} (pid ${child.pid})`);
  child.kill();

  const exited = await waitForExit(child, 5000);
  if (exited) {
    return;
  }

  if (process.platform === 'win32') {
    await spawnCommand('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    await waitForExit(child, 2000);
    return;
  }

  child.kill('SIGKILL');
  await waitForExit(child, 2000);
}

async function spawnCommand(command: string, args: string[]) {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      cwd: WORKSPACE_ROOT,
      shell: process.platform === 'win32',
    });

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(' ')} exited with code ${String(code)}`));
    });
  });
}

async function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null) {
    return true;
  }

  return await new Promise<boolean>((resolvePromise) => {
    const timeout = setTimeout(() => resolvePromise(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise(true);
    });
  });
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} returned ${response.status}`);
  }

  return (await response.json()) as T;
}
