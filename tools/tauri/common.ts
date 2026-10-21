import { type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, cp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  resolveDesktopTargetInfo,
  type DesktopTargetInfo,
} from './runtime-target.ts';
import {
  ensureDir as ensureSharedDir,
  fileExists as sharedFileExists,
  type WorkspacePathOptions,
  writeJson as writeSharedJson,
} from '../shared/fs.ts';
import { waitForUrl as waitForSharedUrl } from '../shared/http.ts';
import {
  runCommand as runSharedCommand,
  RunCommandError,
  type RunCommandOptions,
  spawnLogged as spawnSharedLogged,
  terminateChildProcess as terminateSharedChildProcess,
} from '../shared/process.ts';
import { sleep } from '../shared/time.ts';
import { WORKSPACE_ROOT } from '../shared/workspace.ts';

// Re-export all path / named constants from the constants module.
export * from './constants.ts';
// Explicit import for internal use (export * does not provide module-scoped access).
import {
  BUN_COMMAND,
  SPRING_BACKEND_SIDECAR_NAME,
  TAURI_BINARIES_DIR,
} from './constants.ts';

// Re-export Node.js runtime download helpers.
export {
  ensureNodeBinaryDownloaded,
  getPackagedNodeExecutablePath,
} from './node-runtime.ts';

// Re-export stale-process detection and cleanup.
export { stopStaleTauriBackendProcesses } from './process-cleanup.ts';

export function logStep(message: string) {
  console.log(`[tauri-shell] ${message}`);
}

export { sleep, WORKSPACE_ROOT };

export async function ensureDir(path: string, options?: WorkspacePathOptions) {
  await ensureSharedDir(path, options);
}

export async function ensureCleanDir(path: string) {
  await rm(path, { recursive: true, force: true });
  await ensureDir(path);
}

export async function copyDirectory(source: string, destination: string) {
  await cp(source, destination, { recursive: true, force: true });
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeJson(
  path: string,
  value: unknown,
  options?: WorkspacePathOptions,
) {
  await writeSharedJson(path, value, options);
}

export async function writeTextFile(path: string, value: string) {
  await writeFile(path, value, 'utf8');
}

export async function fileExists(path: string, options?: WorkspacePathOptions) {
  return await sharedFileExists(path, options);
}

export async function waitForUrl(
  url: string,
  {
    attempts = 60,
    delayMs = 1000,
  }: {
    attempts?: number;
    delayMs?: number;
  } = {},
) {
  await waitForSharedUrl(url, {
    attempts,
    delayMs,
    onRetry(event) {
      if (typeof event.status === 'number') {
        logStep(
          `Wait for ${url} attempt ${event.attempt} returned ${event.status}`,
        );
        return;
      }

      logStep(
        `Wait for ${url} attempt ${event.attempt} failed: ${
          event.errorMessage ?? 'unknown error'
        }`,
      );
    },
  });
}

export async function runCommand(
  command: string,
  args: string[],
  options: SpawnOptions = {},
) {
  await runSharedCommand(command, args, {
    log: logStep,
    ...options,
  });
}

type StagedProductionDependencyInstallRunner = (
  command: string,
  args: string[],
  options: RunCommandOptions,
) => Promise<unknown>;

export interface InstallStagedProductionDependenciesOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  isCi?: boolean;
  label: string;
  platform?: NodeJS.Platform;
  run?: StagedProductionDependencyInstallRunner;
}

const STAGED_PRODUCTION_DEPENDENCY_INSTALL_ARGS = [
  'install',
  '--production',
  '--no-save',
  '--linker=hoisted',
] as const;

export function buildStagedProductionDependencyInstallArgs({
  offline,
}: {
  offline: boolean;
}): string[] {
  return offline
    ? [...STAGED_PRODUCTION_DEPENDENCY_INSTALL_ARGS, '--offline']
    : [...STAGED_PRODUCTION_DEPENDENCY_INSTALL_ARGS];
}

export function isBunOfflineCacheMiss(error: unknown): boolean {
  if (!(error instanceof RunCommandError)) {
    return false;
  }

  const diagnosticText = [error.stdout, error.stderr, error.message].join('\n');
  return /\boffline\b/iu.test(diagnosticText);
}

function assertStagedPackageTrustsSqlite(cwd: string): void {
  const packageJsonPath = join(cwd, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `Staged package.json is missing at ${packageJsonPath}. ` +
        'Write package.json with trustedDependencies before installing staged production dependencies.',
    );
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    trustedDependencies?: unknown;
  };
  const trustedDependencies = packageJson.trustedDependencies;
  if (
    !Array.isArray(trustedDependencies) ||
    !trustedDependencies.includes('sqlite3')
  ) {
    throw new Error(
      `Staged package.json at ${packageJsonPath} must list sqlite3 in trustedDependencies so Bun can build its native binding.`,
    );
  }
}

export async function installStagedProductionDependencies({
  cwd,
  env,
  isCi = process.env.CI === 'true',
  label,
  platform = process.platform,
  run = runSharedCommand,
}: InstallStagedProductionDependenciesOptions): Promise<void> {
  assertStagedPackageTrustsSqlite(cwd);

  const installEnv = {
    ...process.env,
    ...env,
    CI: 'true',
  };
  const baseOptions = {
    cwd,
    env: installEnv,
    log: logStep,
  };
  if (isCi && platform === 'win32') {
    logStep(
      `Using online bun production dependency install for ${label} on Windows CI.`,
    );
    await run(
      BUN_COMMAND,
      buildStagedProductionDependencyInstallArgs({ offline: false }),
      {
        ...baseOptions,
        stdio: 'inherit',
      },
    );
    return;
  }

  try {
    await run(
      BUN_COMMAND,
      buildStagedProductionDependencyInstallArgs({ offline: true }),
      {
        ...baseOptions,
        stdio: 'pipe',
      },
    );
    return;
  } catch (error) {
    if (!isCi || !isBunOfflineCacheMiss(error)) {
      throw error;
    }

    logStep(
      `Offline bun package cache is unavailable for ${label}; retrying production dependency install online.`,
    );

    try {
      await run(
        BUN_COMMAND,
        buildStagedProductionDependencyInstallArgs({ offline: false }),
        {
          ...baseOptions,
          stdio: 'inherit',
        },
      );
    } catch (fallbackError) {
      throw new Error(
        `Online bun install fallback failed after an offline cache miss for ${label}.`,
        { cause: fallbackError },
      );
    }
  }
}

export function spawnLogged(
  command: string,
  args: string[],
  options: SpawnOptions = {},
) {
  return spawnSharedLogged(command, args, {
    log: logStep,
    ...options,
  });
}

export async function terminateChildProcess(
  child: ChildProcess | undefined,
  label: string,
) {
  await terminateSharedChildProcess(child, label, {
    log(message) {
      logStep(
        message.startsWith('stopping ')
          ? `Stopping ${message.slice('stopping '.length)}`
          : message,
      );
    },
  });
}

export async function copyFileEnsured(source: string, destination: string) {
  await ensureDir(dirname(destination));
  await copyFile(source, destination);
}

export function getTauriSidecarBinaryFileName(
  sidecarName: string,
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  const extension = target.hostPlatform === 'win32' ? '.exe' : '';
  return `${sidecarName}-${target.rustTarget}${extension}`;
}

export function getTauriSidecarBinaryPath(
  sidecarName: string,
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  return join(
    TAURI_BINARIES_DIR,
    getTauriSidecarBinaryFileName(sidecarName, target),
  );
}

export function getPreparedSpringSidecarPath(
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  return getTauriSidecarBinaryPath(SPRING_BACKEND_SIDECAR_NAME, target);
}
