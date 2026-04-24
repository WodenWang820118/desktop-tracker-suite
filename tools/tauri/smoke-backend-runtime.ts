import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  BACKEND_RUNTIME_DIR,
  DATABASE_FILE_NAME,
  ensureDir,
  fileExists,
  getPackagedNodeExecutablePath,
  logStep,
  spawnLogged,
  terminateChildProcess,
  waitForUrl,
} from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';

type TaskResponse = {
  id: string;
  text: string;
  day: string;
  reminder: boolean;
};

async function main() {
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);
  const smokeRoot = await mkdtemp(join(tmpdir(), 'tauri-shell-smoke-'));
  const databaseRoot = join(smokeRoot, 'data');
  await ensureDir(databaseRoot, { root: smokeRoot });
  const databasePath = join(databaseRoot, DATABASE_FILE_NAME);
  const port = String(await reserveOpenPort());
  const packagedNodeExecutable = getPackagedNodeExecutablePath(target);

  logStep(`Booting the packaged ${target.profile} Nest runtime smoke test on port ${port}`);
  const backendProcess = spawnLogged(packagedNodeExecutable, ['main.js'], {
    cwd: BACKEND_RUNTIME_DIR,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      NODE_ENV: 'prod',
      PORT: port,
    },
  });

  try {
    await waitForUrl(`http://127.0.0.1:${port}/health`, {
      attempts: 60,
      delayMs: 1000,
    });

    const taskId = randomUUID();
    const createdResponse = await fetchJsonResponse<TaskResponse>(
      `http://127.0.0.1:${port}/tasks/create`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: taskId,
          text: 'packaged nest runtime smoke',
          day: '2026-04-23',
          reminder: true,
        }),
      },
    );
    if (createdResponse.status !== 201) {
      throw new Error(
        `Expected Nest createTask response status 201, received ${createdResponse.status}.`,
      );
    }
    const created = createdResponse.body;
    const reloaded = await fetchJson<TaskResponse>(
      `http://127.0.0.1:${port}/tasks/${encodeURIComponent(created.id)}`,
    );
    if (
      reloaded.id !== created.id ||
      reloaded.text !== created.text ||
      reloaded.day !== created.day ||
      reloaded.reminder !== created.reminder
    ) {
      throw new Error(
        `CRUD smoke verification failed. Expected ${JSON.stringify(created)}, received ${JSON.stringify(reloaded)}.`,
      );
    }

    if (!(await fileExists(databasePath, { root: smokeRoot }))) {
      throw new Error(`Expected Nest smoke database at ${databasePath} to exist.`);
    }

    logStep(`Packaged Nest runtime passed CRUD smoke on port ${port}`);
  } finally {
    await terminateChildProcess(backendProcess, 'packaged Nest runtime');
  }
}

async function reserveOpenPort() {
  return await new Promise<number>((resolvePromise, rejectPromise) => {
    const server = createServer();

    server.on('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectPromise(new Error('Failed to reserve an open port for the smoke test.'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }

        resolvePromise(port);
      });
    });
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return (await fetchJsonResponse<T>(url, init)).body;
}

async function fetchJsonResponse<T>(
  url: string,
  init?: RequestInit,
): Promise<{ body: T; status: number }> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with ${response.status} ${response.statusText}.`);
  }

  return {
    body: (await response.json()) as T,
    status: response.status,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
