import { mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  BACKEND_RUNTIME_DIR,
  DATABASE_FILE_NAME,
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

async function main() {
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);
  const smokeRoot = await mkdtemp(join(tmpdir(), 'tauri-shell-smoke-'));
  const databaseRoot = join(smokeRoot, 'data');
  await mkdir(databaseRoot, { recursive: true });
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
    logStep(`Packaged Nest runtime responded successfully on port ${port}`);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
