import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runCommand,
  RunCommandError,
  spawnLogged,
  terminateChildProcess,
} from './process.ts';

test('spawnLogged sends command text through the supplied logger', async () => {
  const logs: string[] = [];
  const child = spawnLogged(process.execPath, ['-e', ''], {
    log: (message) => logs.push(`[test] ${message}`),
    stdio: 'ignore',
  });

  await onceExit(child);

  assert.deepEqual(logs, [`[test] > ${process.execPath} -e `]);
});

test('runCommand rejects on non-zero exit codes', async () => {
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'process.exit(7)'], {
      log: () => undefined,
      stdio: 'ignore',
    }),
    /exited with code 7/,
  );
});

test('runCommand resolves with captured output when stdio is piped', async () => {
  const result = await runCommand(
    process.execPath,
    ['-e', "console.log('test-output')"],
    {
      log: () => undefined,
      stdio: 'pipe',
    },
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'test-output\n');
  assert.equal(result.stderr, '');
});

test('runCommand rejects when the executable cannot be started', async () => {
  await assert.rejects(
    runCommand('definitely-not-a-real-command-for-shared-tests', [], {
      log: () => undefined,
      stdio: 'ignore',
    }),
    (error) =>
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT',
  );
});

test('runCommand includes captured output on non-zero exit errors', async () => {
  await assert.rejects(
    runCommand(
      process.execPath,
      [
        '-e',
        "console.log('before-failure'); console.error('failure-detail'); process.exit(7)",
      ],
      {
        log: () => undefined,
        stdio: 'pipe',
      },
    ),
    (error) =>
      error instanceof RunCommandError &&
      error.exitCode === 7 &&
      error.stdout === 'before-failure\n' &&
      error.stderr === 'failure-detail\n',
  );
});

test('terminateChildProcess stops a running child process', async () => {
  const logs: string[] = [];
  const child = spawnLogged(
    process.execPath,
    ['-e', 'setTimeout(() => undefined, 30_000)'],
    {
      log: (message) => logs.push(message),
      stdio: 'ignore',
    },
  );

  await terminateChildProcess(child, 'test process', {
    log: (message) => logs.push(message),
    stdio: 'ignore',
  });

  assert.ok(child.exitCode !== null || child.signalCode !== null);
  assert.ok(logs.some((message) => /^stopping test process \(pid \d+\)$/.test(message)));
});

async function onceExit(child: ReturnType<typeof spawnLogged>): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('exit', () => resolvePromise());
  });
}
