import {
  DEV_FRONTEND_URL,
  PNPM_COMMAND,
  TAURI_PROJECT_ROOT,
  logStep,
  spawnLogged,
  terminateChildProcess,
  waitForUrl,
} from './common.ts';

async function main() {
  const childProcesses = [
    spawnLogged(PNPM_COMMAND, [
      'exec',
      'nx',
      'run',
      'ng-tracker:serve',
      '--host=127.0.0.1',
      '--port=4200',
    ]),
    spawnLogged(PNPM_COMMAND, ['exec', 'nx', 'run', 'nest-backend:serve:development'], {
      env: {
        ...process.env,
        NODE_ENV: 'dev',
        PORT: '3000',
      },
    }),
  ];

  const cleanup = async () => {
    await Promise.all([
      terminateChildProcess(childProcesses[1], 'nest-backend dev server'),
      terminateChildProcess(childProcesses[0], 'ng-tracker dev server'),
      terminateChildProcess(tauriProcess, 'Tauri dev process'),
    ]);
  };

  let tauriProcess: ReturnType<typeof spawnLogged> | undefined;

  const handleSignal = (signal: NodeJS.Signals) => {
    logStep(`Received ${signal}, stopping the Tauri dev stack`);
    void cleanup().finally(() => process.exit(130));
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    await waitForUrl(DEV_FRONTEND_URL, { attempts: 90, delayMs: 1000 });
    await waitForUrl('http://127.0.0.1:3000/health', { attempts: 90, delayMs: 1000 });

    tauriProcess = spawnLogged(
      PNPM_COMMAND,
      ['exec', 'tauri', 'dev', '--config', 'src-tauri/tauri.conf.json', '--no-dev-server-wait'],
      {
        cwd: TAURI_PROJECT_ROOT,
      },
    );
    if (!tauriProcess) {
      throw new Error('Failed to start the Tauri dev process.');
    }
    const runningTauriProcess = tauriProcess;

    const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
      runningTauriProcess.on('error', rejectPromise);
      runningTauriProcess.on('exit', (code) => resolvePromise(code ?? 0));
    });

    process.exitCode = exitCode;
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
