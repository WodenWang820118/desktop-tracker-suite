import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { reserveOpenPort } from '../shared/net.ts';
import { fetchJson, fetchJsonResponse } from '../shared/http.ts';
import { ensureDir, fileExists } from '../shared/fs.ts';
import {
  DATABASE_FILE_NAME,
  logStep,
  spawnLogged,
  terminateChildProcess,
  waitForUrl,
} from './common.ts';

type TaskResponse = {
  id: string;
  text: string;
  day: string;
  reminder: boolean;
};

export interface SmokeTestConfig {
  /** Human-readable label for logging (e.g. "packaged Nest runtime") */
  label: string;
  /** Path to the backend executable */
  executable: string;
  /** Arguments to pass to the executable */
  args?: string[];
  /**
   * Working directory for the spawned process.
   * Defaults to the smoke root temp directory (suitable for self-contained sidecars).
   * Provide an explicit path when the runtime needs a specific directory (e.g. for
   * resolving companion DLLs or relative entry-point paths).
   */
  cwd?: string;
  /** Extra environment variables merged on top of DATABASE_PATH and PORT */
  extraEnv?: Record<string, string>;
  /** Expected HTTP status for POST /tasks/create. Nest/Express = 201, Spring = 200. */
  createTaskExpectedStatus?: number;
  /** Descriptive text for the smoke test task */
  smokeText: string;
  /** Prefix for the temporary directory (e.g. "tauri-shell-smoke-") */
  smokeRootPrefix: string;
}

/**
 * Run a standard CRUD smoke test against a packaged backend runtime.
 *
 * Flow: reserve port → create temp dir → spawn backend → wait for /health →
 * POST /tasks/create → GET /tasks/:id → verify round-trip → verify database →
 * terminate process.
 */
export async function runBackendSmokeTest(
  config: SmokeTestConfig,
): Promise<void> {
  const smokeRoot = await mkdtemp(join(tmpdir(), config.smokeRootPrefix));
  const databaseRoot = join(smokeRoot, 'data');
  await ensureDir(databaseRoot, { root: smokeRoot });
  const databasePath = join(databaseRoot, DATABASE_FILE_NAME);
  const port = String(await reserveOpenPort());

  const workingDir = config.cwd ?? smokeRoot;

  logStep(`Booting the ${config.label} smoke test on port ${port}`);
  const backendProcess = spawnLogged(config.executable, config.args ?? [], {
    cwd: workingDir,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      PORT: port,
      ...config.extraEnv,
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          text: config.smokeText,
          day: '2026-04-23',
          reminder: true,
        }),
      },
    );

    const expectedStatus = config.createTaskExpectedStatus ?? 201;
    if (createdResponse.status !== expectedStatus) {
      throw new Error(
        `Expected ${config.label} createTask response status ${expectedStatus}, received ${createdResponse.status}.`,
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
      throw new Error(
        `Expected ${config.label} smoke database at ${databasePath} to exist.`,
      );
    }

    logStep(`${config.label} passed CRUD smoke on port ${port}`);
  } finally {
    await terminateChildProcess(backendProcess, config.label);
  }
}
