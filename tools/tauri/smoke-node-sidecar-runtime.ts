import {
  EXPRESS_BACKEND_SIDECAR_NAME,
  NEST_BACKEND_SIDECAR_NAME,
  fileExists,
  getTauriSidecarBinaryPath,
} from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';
import { runBackendSmokeTest } from './smoke-harness.ts';

type NodeSidecarRuntimeMode = 'express' | 'nest';

const RUNTIMES = {
  express: {
    label: 'Express',
    sidecarName: EXPRESS_BACKEND_SIDECAR_NAME,
  },
  nest: {
    label: 'Nest',
    sidecarName: NEST_BACKEND_SIDECAR_NAME,
  },
} satisfies Record<
  NodeSidecarRuntimeMode,
  { label: 'Express' | 'Nest'; sidecarName: string }
>;

async function main() {
  const runtimeMode = parseRuntimeMode(process.argv[2]);
  const runtime = RUNTIMES[runtimeMode];
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);
  const executablePath = getTauriSidecarBinaryPath(runtime.sidecarName, target);
  if (!(await fileExists(executablePath))) {
    throw new Error(
      `No ${runtime.label} sidecar executable was found at ${executablePath}. Run the matching desktop:materialize-runtime command first.`,
    );
  }

  await runBackendSmokeTest({
    label: `packaged ${target.profile} ${runtime.label} sidecar`,
    executable: executablePath,
    extraEnv: { NODE_ENV: 'prod' },
    smokeText: `packaged ${runtimeMode} sidecar smoke`,
    smokeRootPrefix: `tauri-shell-${runtimeMode}-sidecar-smoke-`,
  });
}

function parseRuntimeMode(value: string | undefined): NodeSidecarRuntimeMode {
  if (!value || value === 'nest') {
    return 'nest';
  }

  if (value === 'express') {
    return 'express';
  }

  throw new Error(
    `Unsupported node sidecar smoke runtime "${value}". Expected "nest" or "express".`,
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
