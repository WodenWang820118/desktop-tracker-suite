import { type ChildProcess, type SpawnOptions } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ensureDir,
  writeJson as writeSharedJson,
} from '../shared/fs.ts';
import { fetchJson as fetchSharedJson, waitForUrl as waitForSharedUrl } from '../shared/http.ts';
import { reserveOpenPort as reserveSharedPort } from '../shared/net.ts';
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
  return await reserveSharedPort();
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
  return await fetchSharedJson<T>(url, init);
}
