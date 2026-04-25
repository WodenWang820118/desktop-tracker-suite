import { syncDesktopVersionFiles } from './sync-version.ts';
import { logStep, PNPM_COMMAND, runCommand, TAURI_PROJECT_ROOT } from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';

type BuildMode = 'build' | 'package';
type DesktopRuntimeMode = 'express' | 'nest' | 'spring-native';

async function main() {
  const mode = parseBuildMode(process.argv[2]);
  const runtimeMode = parseRuntimeMode(process.argv[3]);
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);

  const syncResult = await syncDesktopVersionFiles();
  logStep(
    syncResult.changedFiles.length === 0
      ? `Desktop version already synchronized at ${syncResult.version}`
      : `Desktop version synchronized to ${syncResult.version}`,
  );

  const tauriArgs = [
    'exec',
    'tauri',
    'build',
    '--config',
    resolveConfigPath(mode, runtimeMode),
    '--target',
    target.rustTarget,
  ];
  if (mode === 'build') {
    tauriArgs.push('--debug', '--no-bundle');
  }

  logStep(`Running Tauri ${mode} for ${target.profile} (${target.rustTarget}, runtime=${runtimeMode})`);
  await runCommand(PNPM_COMMAND, tauriArgs, {
    cwd: TAURI_PROJECT_ROOT,
  });
}

function parseBuildMode(value: string | undefined): BuildMode {
  if (!value || value === 'build') {
    return 'build';
  }

  if (value === 'package') {
    return 'package';
  }

  throw new Error(`Unsupported build mode "${value}". Expected "build" or "package".`);
}

function parseRuntimeMode(value: string | undefined): DesktopRuntimeMode {
  if (!value || value === 'nest') {
    return 'nest';
  }

  if (value === 'express') {
    return 'express';
  }

  if (value === 'spring-native') {
    return 'spring-native';
  }

  throw new Error(
    `Unsupported runtime mode "${value}". Expected "nest", "express", or "spring-native".`,
  );
}

function resolveConfigPath(_mode: BuildMode, runtimeMode: DesktopRuntimeMode) {
  if (runtimeMode === 'nest') {
    return 'src-tauri/tauri.nest-sidecar.conf.json';
  }

  if (runtimeMode === 'express') {
    return 'src-tauri/tauri.express-sidecar.conf.json';
  }

  if (runtimeMode === 'spring-native') {
    return 'src-tauri/tauri.spring-native.conf.json';
  }

  throw new Error(`Unsupported runtime mode "${runtimeMode}".`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
