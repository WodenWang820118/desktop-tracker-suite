import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DATABASE_FILE_NAME,
  SPRING_NATIVE_RUNTIME_DIR,
  fileExists,
  getPreparedSpringSidecarPath,
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
  const smokeRoot = await mkdtemp(join(tmpdir(), 'tauri-spring-native-smoke-'));
  const databaseRoot = join(smokeRoot, 'data');
  await mkdir(databaseRoot, { recursive: true });
  const databasePath = join(databaseRoot, DATABASE_FILE_NAME);
  const port = String(await reserveOpenPort());
  const packagedExecutable = getPreparedSpringSidecarPath(target);

  logStep(`Booting the packaged Spring-native runtime smoke test on port ${port}`);
  const backendProcess = spawnLogged(packagedExecutable, [], {
    cwd: SPRING_NATIVE_RUNTIME_DIR,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      PORT: port,
      SPRING_PROFILES_ACTIVE: 'prod',
      ...buildNativeLibraryEnv(SPRING_NATIVE_RUNTIME_DIR),
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
          text: 'packaged spring-native smoke',
          day: '2026-04-23',
          reminder: true,
        }),
      },
    );
    if (createdResponse.status !== 200) {
      throw new Error(
        `Expected Spring-native createTask response status 200, received ${createdResponse.status}.`,
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

    if (!(await fileExists(databasePath))) {
      throw new Error(`Expected Spring-native smoke database at ${databasePath} to exist.`);
    }

    logStep(`Packaged Spring-native runtime passed CRUD smoke on port ${port}`);
  } finally {
    await terminateChildProcess(backendProcess, 'packaged Spring-native runtime');
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

function buildLibrarySearchPath(libraryDir: string, existingValue: string | undefined) {
  const separator = process.platform === 'win32' ? ';' : ':';
  return [libraryDir, existingValue ?? ''].filter(Boolean).join(separator);
}

function buildNativeLibraryEnv(libraryDir: string) {
  if (process.platform === 'win32') {
    return {
      PATH: buildLibrarySearchPath(libraryDir, process.env.PATH),
    };
  }

  if (process.platform === 'darwin') {
    return {
      DYLD_LIBRARY_PATH: buildLibrarySearchPath(
        libraryDir,
        process.env.DYLD_LIBRARY_PATH,
      ),
      PATH: process.env.PATH ?? '',
    };
  }

  return {
    LD_LIBRARY_PATH: buildLibrarySearchPath(libraryDir, process.env.LD_LIBRARY_PATH),
    PATH: process.env.PATH ?? '',
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
