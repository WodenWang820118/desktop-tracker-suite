import { syncDesktopVersionFiles } from './sync-version.ts';
import {
  logStep,
  PNPM_COMMAND,
  runCommand,
  TAURI_PROJECT_ROOT,
  WORKSPACE_ROOT,
} from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';
import {
  getBackendDefinition,
  getFrontendDefinition,
  getGeneratedConfigProjectPath,
  getGridVariantKey,
  listGridSelections,
  parseGridSelection,
  readWorkspaceVersion,
  resolveGridSelectionFromEnv,
  writeGeneratedTauriConfig,
  type GridSelection,
} from './grid.ts';

type GridMode = 'build' | 'package' | 'prepare' | 'verify';

async function main() {
  const mode = parseGridMode(process.argv[2]);
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);

  if (mode === 'verify') {
    for (const selection of listGridSelections()) {
      await runGridSelection({ mode: 'build', selection });
    }
    return;
  }

  const selection = resolveSelectionFromArgsOrEnv(process.argv.slice(3));
  await runGridSelection({ mode, selection });
}

async function runGridSelection({
  mode,
  selection,
}: {
  mode: Exclude<GridMode, 'verify'>;
  selection: GridSelection;
}) {
  const variantKey = getGridVariantKey(selection);
  logStep(`Preparing desktop grid variant ${variantKey}`);

  const syncResult = await syncDesktopVersionFiles();
  logStep(
    syncResult.changedFiles.length === 0
      ? `Desktop version already synchronized at ${syncResult.version}`
      : `Desktop version synchronized to ${syncResult.version}`,
  );

  await buildFrontend(selection);
  await buildBackend(selection);
  await materializeBackend(selection);

  const generatedConfig = await writeGeneratedTauriConfig({
    ...selection,
    version: await readWorkspaceVersion(),
  });
  logStep(`Generated Tauri grid config at ${generatedConfig.projectConfigPath}`);

  if (mode === 'prepare') {
    return;
  }

  if (mode === 'build') {
    await smokeBackend(selection);
  }

  await runTauriBuild({ mode, selection });
}

async function buildFrontend(selection: GridSelection) {
  const frontend = getFrontendDefinition(selection.frontend);
  logStep(`Building ${selection.frontend} frontend for Tauri grid packaging`);
  await runCommand(PNPM_COMMAND, frontend.buildArgs, {
    cwd: WORKSPACE_ROOT,
  });
}

async function buildBackend(selection: GridSelection) {
  const backend = getBackendDefinition(selection.backend);
  logStep(`Building ${selection.backend} backend for Tauri grid packaging`);
  await runCommand(PNPM_COMMAND, backend.buildArgs, {
    cwd: WORKSPACE_ROOT,
  });
}

async function materializeBackend(selection: GridSelection) {
  const backend = getBackendDefinition(selection.backend);
  logStep(`Materializing ${selection.backend} backend runtime for Tauri grid packaging`);
  await runCommand('node', backend.materializeArgs, {
    cwd: WORKSPACE_ROOT,
  });
}

async function smokeBackend(selection: GridSelection) {
  const backend = getBackendDefinition(selection.backend);
  logStep(`Smoke testing ${selection.backend} packaged backend runtime`);
  await runCommand('node', backend.smokeArgs, {
    cwd: WORKSPACE_ROOT,
  });
}

async function runTauriBuild({
  mode,
  selection,
}: {
  mode: 'build' | 'package';
  selection: GridSelection;
}) {
  const target = resolveDesktopTargetInfo();
  const tauriArgs = [
    'exec',
    'tauri',
    'build',
    '--config',
    getGeneratedConfigProjectPath(selection),
    '--target',
    target.rustTarget,
    '--ci',
  ];
  if (mode === 'build') {
    tauriArgs.push('--debug', '--no-bundle');
  }

  logStep(
    `Running Tauri ${mode} for ${target.profile} (${target.rustTarget}, variant=${getGridVariantKey(
      selection,
    )})`,
  );
  await runCommand(PNPM_COMMAND, tauriArgs, {
    cwd: TAURI_PROJECT_ROOT,
  });
}

function parseGridMode(value: string | undefined): GridMode {
  if (!value || value === 'build') {
    return 'build';
  }

  if (value === 'package' || value === 'prepare' || value === 'verify') {
    return value;
  }

  throw new Error('Unsupported grid mode. Expected "build", "package", "prepare", or "verify".');
}

function resolveSelectionFromArgsOrEnv(args: string[]): GridSelection {
  const [frontend, backend] = args;
  if (frontend || backend) {
    return parseGridSelection({ backend, frontend });
  }

  return resolveGridSelectionFromEnv();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
