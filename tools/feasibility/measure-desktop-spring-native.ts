import { mkdtemp } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DATABASE_FILE_NAME,
  SPRING_NATIVE_RUNTIME_DIR,
  TAURI_BINARIES_DIR,
  TAURI_SPRING_METADATA_DIR,
  TAURI_SPRING_RESOURCE_ROOT,
  getPreparedSpringSidecarPath,
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
  const executablePath = getPreparedSpringSidecarPath(target);
  if (!(await pathSize(executablePath).catch(() => 0))) {
    throw new Error(
      `No Spring-native sidecar executable found at ${executablePath}. Run desktop:materialize-spring-native-runtime first.`,
    );
  }
  const smokeRoot = await mkdtemp(join(tmpdir(), 'desktop-spring-native-smoke-'));
  const databasePath = join(smokeRoot, DATABASE_FILE_NAME);
  const port = await reserveOpenPort();
  const metrics: Record<string, unknown> = {
    runtimeKind: 'spring-native-packaged',
    executablePath,
    executableSizeBytes: await pathSize(executablePath),
    binariesSizeBytes: await pathSize(TAURI_BINARIES_DIR),
    metadataSizeBytes: await pathSize(TAURI_SPRING_METADATA_DIR),
    totalResourceSizeBytes: await pathSize(TAURI_SPRING_RESOURCE_ROOT),
    totalPreparedPayloadSizeBytes:
      (await pathSize(TAURI_BINARIES_DIR)) + (await pathSize(TAURI_SPRING_RESOURCE_ROOT)),
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
      ...buildNativeLibraryEnv(SPRING_NATIVE_RUNTIME_DIR),
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
