import { type ChildProcess, type SpawnOptions } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

import {
  ensureDir,
  writeJson as writeSharedJson,
} from '../shared/fs.ts';
import { waitForUrl as waitForSharedUrl } from '../shared/http.ts';
import {
  spawnLogged as spawnSharedLogged,
  terminateChildProcess as terminateSharedChildProcess,
} from '../shared/process.ts';
import { sleep } from '../shared/time.ts';
import { WORKSPACE_ROOT } from '../shared/workspace.ts';

export const FEASIBILITY_OUTPUT_DIR = join(
  WORKSPACE_ROOT,
  'dist',
  'feasibility',
  'graalvm-desktop',
  'windows',
);

export { ensureDir, sleep, WORKSPACE_ROOT };

export async function writeJson(path: string, value: unknown) {
  await writeSharedJson(path, value);
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
  return await waitForSharedUrl(url, { attempts, delayMs });
}

export function spawnLogged(
  command: string,
  args: string[],
  options: SpawnOptions = {},
) {
  return spawnSharedLogged(command, args, {
    log: (message) => console.log(`[feasibility] ${message}`),
    ...options,
  });
}

export async function terminateChildProcess(
  child: ChildProcess | undefined,
  label: string,
) {
  await terminateSharedChildProcess(child, label, {
    log: (message) => console.log(`[feasibility] ${message}`),
  });
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} returned ${response.status}`);
  }

  return (await response.json()) as T;
}
