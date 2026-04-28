import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  BACKEND_RUNTIME_DIR,
  DATABASE_FILE_NAME,
  NODE_RUNTIME_DIR,
  TAURI_METADATA_DIR,
  TAURI_RESOURCE_ROOT,
  getPackagedNodeExecutablePath,
} from '../tauri/common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from '../tauri/runtime-target.ts';
import {
  fetchJson,
  pathSize,
  reserveOpenPort,
  spawnLogged,
  terminateChildProcess,
  waitForUrl,
  writeMetricSnapshot,
} from './common.ts';

type TaskResponse = {
  id: string;
  text: string;
  day: string;
  reminder: boolean;
};

async function main() {
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);

  const smokeRoot = await mkdtemp(join(tmpdir(), 'desktop-baseline-smoke-'));
  const databaseRoot = join(smokeRoot, 'data');
  await mkdir(databaseRoot, { recursive: true });
  const databasePath = join(databaseRoot, DATABASE_FILE_NAME);
  const port = await reserveOpenPort();
  const metrics: Record<string, unknown> = {
    runtimeKind: 'nest-node-packaged-legacy',
    desktopTarget: target.profile,
    backendRuntimeSizeBytes: await pathSize(BACKEND_RUNTIME_DIR),
    nodeRuntimeSizeBytes: await pathSize(NODE_RUNTIME_DIR),
    metadataSizeBytes: await pathSize(TAURI_METADATA_DIR),
    totalResourceSizeBytes: await pathSize(TAURI_RESOURCE_ROOT),
    databasePath,
    port,
    success: false,
  };

  const nodeExecutable = getPackagedNodeExecutablePath(target);
  const backendProcess = spawnLogged(nodeExecutable, ['main.js'], {
    cwd: BACKEND_RUNTIME_DIR,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      NODE_ENV: 'prod',
      PORT: String(port),
    },
  });

  try {
    metrics.healthReadyMs = await waitForUrl(`http://127.0.0.1:${port}/health`);
    const taskId = randomUUID();
    const created = await fetchJson<TaskResponse>(`http://127.0.0.1:${port}/tasks/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: taskId,
        text: 'desktop baseline smoke',
        day: '2026-04-23',
        reminder: true,
      }),
    });
    const reloaded = await fetchJson<TaskResponse>(
      `http://127.0.0.1:${port}/tasks/${encodeURIComponent(created.id)}`,
    );

    metrics.createdTaskId = created.id;
    metrics.reloadedText = reloaded.text;
    metrics.reloadedReminder = reloaded.reminder;
    metrics.success = true;
  } catch (error) {
    metrics.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeMetricSnapshot('desktop-baseline.json', metrics);
    await terminateChildProcess(backendProcess, 'packaged Nest runtime');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
