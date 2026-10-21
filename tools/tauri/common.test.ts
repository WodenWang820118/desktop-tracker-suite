import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildStagedProductionDependencyInstallArgs,
  installStagedProductionDependencies,
  isBunOfflineCacheMiss,
  BUN_COMMAND,
} from './common.ts';
import { RunCommandError, type RunCommandOptions } from '../shared/process.ts';

test('buildStagedProductionDependencyInstallArgs keeps the offline install shape', () => {
  assert.deepEqual(
    buildStagedProductionDependencyInstallArgs({ offline: true }),
    ['install', '--production', '--no-save', '--linker=hoisted', '--offline'],
  );
  assert.deepEqual(
    buildStagedProductionDependencyInstallArgs({ offline: false }),
    ['install', '--production', '--no-save', '--linker=hoisted'],
  );
});

test('isBunOfflineCacheMiss detects a bun offline cache miss', () => {
  assert.equal(
    isBunOfflineCacheMiss(
      new RunCommandError({
        args: ['install'],
        command: BUN_COMMAND,
        exitCode: 1,
        signal: null,
        stderr: 'error: Failed to resolve sqlite3 (offline mode)',
        stdout: '',
      }),
    ),
    true,
  );
  assert.equal(
    isBunOfflineCacheMiss(
      new RunCommandError({
        args: ['install'],
        command: BUN_COMMAND,
        exitCode: 1,
        signal: null,
        stderr: 'error: GET https://registry.npmjs.org/sqlite3 - 404 Not found',
        stdout: '',
      }),
    ),
    false,
  );
  assert.equal(isBunOfflineCacheMiss(new Error('offline mode')), false);
});

test('installStagedProductionDependencies succeeds with the offline install first', async () => {
  const calls: CommandCall[] = [];

  await withStagedWorkspace(async (cwd) => {
    await installStagedProductionDependencies({
      cwd,
      env: {
        CUSTOM_ENV: 'kept',
      },
      isCi: true,
      label: 'test runtime',
      platform: 'linux',
      run: async (...call) => {
        calls.push(call);
      },
    });

    assert.equal(calls.length, 1);
    assertCommandCall(calls[0], {
      args: buildStagedProductionDependencyInstallArgs({ offline: true }),
      cwd,
      env: {
        CUSTOM_ENV: 'kept',
      },
      stdio: 'pipe',
    });
  });
});

test('installStagedProductionDependencies falls back online in CI on offline cache misses', async () => {
  const calls: CommandCall[] = [];
  const offlineError = new RunCommandError({
    args: ['install'],
    command: BUN_COMMAND,
    exitCode: 1,
    signal: null,
    stderr: 'error: Failed to resolve sqlite3 (offline mode)',
    stdout: '',
  });

  await withStagedWorkspace(async (cwd) => {
    await installStagedProductionDependencies({
      cwd,
      isCi: true,
      label: 'test runtime',
      platform: 'linux',
      run: async (...call) => {
        calls.push(call);
        if (calls.length === 1) {
          throw offlineError;
        }
      },
    });

    assert.equal(calls.length, 2);
    assertCommandCall(calls[0], {
      args: buildStagedProductionDependencyInstallArgs({ offline: true }),
      cwd,
      stdio: 'pipe',
    });
    assertCommandCall(calls[1], {
      args: buildStagedProductionDependencyInstallArgs({ offline: false }),
      cwd,
      stdio: 'inherit',
    });
  });
});

test('installStagedProductionDependencies uses the online install directly on Windows CI', async () => {
  const calls: CommandCall[] = [];

  await withStagedWorkspace(async (cwd) => {
    await installStagedProductionDependencies({
      cwd,
      isCi: true,
      label: 'test runtime',
      platform: 'win32',
      run: async (...call) => {
        calls.push(call);
      },
    });

    assert.equal(calls.length, 1);
    assertCommandCall(calls[0], {
      args: buildStagedProductionDependencyInstallArgs({ offline: false }),
      cwd,
      stdio: 'inherit',
    });
  });
});

test('installStagedProductionDependencies does not fall back outside CI', async () => {
  const offlineError = new RunCommandError({
    args: ['install'],
    command: BUN_COMMAND,
    exitCode: 1,
    signal: null,
    stderr: 'error: Failed to resolve sqlite3 (offline mode)',
    stdout: '',
  });

  await withStagedWorkspace(async (cwd) => {
    await assert.rejects(
      installStagedProductionDependencies({
        cwd,
        isCi: false,
        label: 'test runtime',
        run: async () => {
          throw offlineError;
        },
      }),
      offlineError,
    );
  });
});

test('installStagedProductionDependencies does not fall back for other bun errors in CI', async () => {
  const calls: CommandCall[] = [];
  const otherPnpmError = new RunCommandError({
    args: ['install'],
    command: BUN_COMMAND,
    exitCode: 1,
    signal: null,
    stderr: 'error: GET https://registry.npmjs.org/sqlite3 - 404 Not found',
    stdout: '',
  });

  await withStagedWorkspace(async (cwd) => {
    await assert.rejects(
      installStagedProductionDependencies({
        cwd,
        isCi: true,
        label: 'test runtime',
        platform: 'linux',
        run: async (...call) => {
          calls.push(call);
          throw otherPnpmError;
        },
      }),
      otherPnpmError,
    );
  });

  assert.equal(calls.length, 1);
});

test('installStagedProductionDependencies does not fall back for plain errors in CI', async () => {
  const calls: CommandCall[] = [];
  const plainError = new Error('offline mode');

  await withStagedWorkspace(async (cwd) => {
    await assert.rejects(
      installStagedProductionDependencies({
        cwd,
        isCi: true,
        label: 'test runtime',
        platform: 'linux',
        run: async (...call) => {
          calls.push(call);
          throw plainError;
        },
      }),
      plainError,
    );
  });

  assert.equal(calls.length, 1);
});

test('installStagedProductionDependencies surfaces online fallback failures', async () => {
  const offlineError = new RunCommandError({
    args: ['install'],
    command: BUN_COMMAND,
    exitCode: 1,
    signal: null,
    stderr: 'error: Failed to resolve sqlite3 (offline mode)',
    stdout: '',
  });
  const onlineError = new Error('registry unavailable');
  let attempts = 0;

  await withStagedWorkspace(async (cwd) => {
    await assert.rejects(
      installStagedProductionDependencies({
        cwd,
        isCi: true,
        label: 'test runtime',
        platform: 'linux',
        run: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw offlineError;
          }

          throw onlineError;
        },
      }),
      (error) =>
        error instanceof Error &&
        error.message ===
          'Online bun install fallback failed after an offline cache miss for test runtime.' &&
        error.cause === onlineError,
    );
  });
});

test('installStagedProductionDependencies rejects a missing staged package.json', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tauri-staged-install-test-'));
  try {
    await assert.rejects(
      installStagedProductionDependencies({
        cwd,
        isCi: true,
        label: 'test runtime',
        run: async () => {
          throw new Error('install should not run');
        },
      }),
      /Staged package.json is missing/u,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

type CommandCall = [
  command: string,
  args: string[],
  options: RunCommandOptions,
];

async function withStagedWorkspace<T>(
  callback: (cwd: string) => Promise<T>,
): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), 'tauri-staged-install-test-'));
  try {
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: 'staged-runtime',
        private: true,
        trustedDependencies: ['@nestjs/core', 'sqlite3'],
      }),
      'utf8',
    );
    return await callback(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function assertCommandCall(
  call: CommandCall | undefined,
  expected: {
    args: string[];
    cwd: string;
    env?: Record<string, string>;
    stdio: RunCommandOptions['stdio'];
  },
): void {
  assert.ok(call);
  assert.equal(call[0], BUN_COMMAND);
  assert.deepEqual(call[1], expected.args);
  assert.equal(call[2].cwd, expected.cwd);
  assert.equal(call[2].stdio, expected.stdio);
  assert.equal(typeof call[2].log, 'function');
  assert.equal(call[2].env?.CI, 'true');
  for (const [key, value] of Object.entries(expected.env ?? {})) {
    assert.equal(call[2].env?.[key], value);
  }
}
