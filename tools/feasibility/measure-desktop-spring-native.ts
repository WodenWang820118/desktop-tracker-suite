import { mkdtemp, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DATABASE_FILE_NAME,
  SPRING_NATIVE_RUNTIME_DIR,
  TAURI_SPRING_METADATA_DIR,
  TAURI_SPRING_RESOURCE_ROOT,
} from '../tauri/common.ts';
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
  const entries = await readdir(SPRING_NATIVE_RUNTIME_DIR, { withFileTypes: true });
  const executable = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .find((name) => name.toLowerCase().endsWith('.exe'));
  if (!executable) {
    throw new Error(
      `No Spring-native executable found under ${SPRING_NATIVE_RUNTIME_DIR}. Run desktop:materialize-spring-native-runtime first.`,
    );
  }

  const executablePath = join(SPRING_NATIVE_RUNTIME_DIR, executable);
  const smokeRoot = await mkdtemp(join(tmpdir(), 'desktop-spring-native-smoke-'));
  const databasePath = join(smokeRoot, DATABASE_FILE_NAME);
  const port = await reserveOpenPort();
  const metrics: Record<string, unknown> = {
    runtimeKind: 'spring-native-packaged',
    executablePath,
    executableSizeBytes: await pathSize(executablePath),
    metadataSizeBytes: await pathSize(TAURI_SPRING_METADATA_DIR),
    runtimeDirectorySizeBytes: await pathSize(SPRING_NATIVE_RUNTIME_DIR),
    totalResourceSizeBytes: await pathSize(TAURI_SPRING_RESOURCE_ROOT),
    databasePath,
    port,
    success: false,
  };

  const backendProcess = spawnLogged(executablePath, [], {
    cwd: SPRING_NATIVE_RUNTIME_DIR,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      PORT: String(port),
      SPRING_PROFILES_ACTIVE: 'prod',
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
        text: 'desktop spring-native smoke',
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
    await writeMetricSnapshot('desktop-spring-native.json', metrics);
    await terminateChildProcess(backendProcess, 'packaged Spring-native runtime');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
