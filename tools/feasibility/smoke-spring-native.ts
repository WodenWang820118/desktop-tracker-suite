import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
  const distDir = join(process.cwd(), 'dist', 'spring-backend-native');
  const entries = await readdir(distDir, { withFileTypes: true });
  const executable = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .find((name) => name.toLowerCase().endsWith('.exe'));
  if (!executable) {
    throw new Error(`No Spring native executable found under ${distDir}. Run native-build first.`);
  }

  const executablePath = join(distDir, executable);
  const dllPaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.dll'))
    .map((entry) => join(distDir, entry.name));
  const smokeRoot = await mkdtemp(join(tmpdir(), 'spring-native-smoke-'));
  const databasePath = join(smokeRoot, 'database.sqlite3');
  const port = await reserveOpenPort();
  const metrics: Record<string, unknown> = {
    runtimeKind: 'spring-native-standalone',
    executablePath,
    executableSizeBytes: await pathSize(executablePath),
    companionDllSizeBytes: (
      await Promise.all(dllPaths.map((filePath) => pathSize(filePath)))
    ).reduce((total, current) => total + current, 0),
    databasePath,
    port,
    success: false,
  };

  const processHandle = spawnLogged(executablePath, [], {
    cwd: distDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
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
        text: 'native feasibility smoke',
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
    await writeMetricSnapshot('spring-native-standalone.json', metrics);
    await terminateChildProcess(processHandle, 'spring native executable');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
