import { syncDesktopVersionFiles } from './sync-version.ts';
import { logStep, PNPM_COMMAND, runCommand, TAURI_PROJECT_ROOT } from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';

type BuildMode = 'build' | 'package';

async function main() {
  const mode = parseBuildMode(process.argv[2]);
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);

  const syncResult = await syncDesktopVersionFiles();
  logStep(
    syncResult.changedFiles.length === 0
      ? `Desktop version already synchronized at ${syncResult.version}`
      : `Desktop version synchronized to ${syncResult.version}`,
  );

  const tauriArgs = ['exec', 'tauri', 'build', '--config', 'src-tauri/tauri.conf.json', '--target', target.rustTarget];
  if (mode === 'build') {
    tauriArgs.push('--debug', '--no-bundle');
  }

  logStep(`Running Tauri ${mode} for ${target.profile} (${target.rustTarget})`);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
