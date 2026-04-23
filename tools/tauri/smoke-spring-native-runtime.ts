import { mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DATABASE_FILE_NAME,
  SPRING_NATIVE_RUNTIME_DIR,
  getPackagedSpringExecutablePath,
  logStep,
  spawnLogged,
  terminateChildProcess,
  waitForUrl,
} from './common.ts';

async function main() {
  const smokeRoot = await mkdtemp(join(tmpdir(), 'tauri-spring-native-smoke-'));
  const databaseRoot = join(smokeRoot, 'data');
  await mkdir(databaseRoot, { recursive: true });
  const databasePath = join(databaseRoot, DATABASE_FILE_NAME);
  const port = String(await reserveOpenPort());
  const packagedExecutable = getPackagedSpringExecutablePath();

  logStep(`Booting the packaged Spring-native runtime smoke test on port ${port}`);
  const backendProcess = spawnLogged(packagedExecutable, [], {
    cwd: SPRING_NATIVE_RUNTIME_DIR,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      PORT: port,
      SPRING_PROFILES_ACTIVE: 'prod',
    },
  });

  try {
    await waitForUrl(`http://127.0.0.1:${port}/health`, {
      attempts: 60,
      delayMs: 1000,
    });
    logStep(`Packaged Spring-native runtime responded successfully on port ${port}`);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
