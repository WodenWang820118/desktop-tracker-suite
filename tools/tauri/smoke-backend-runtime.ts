/**
 * @deprecated Legacy Nest resource-mode smoke test.
 * Prefer smoke-node-sidecar-runtime.ts for new work.
 * The grid system (grid-build.ts) uses the sidecar path exclusively.
 * This module is retained for backward compatibility only.
 */

import {
  BACKEND_RUNTIME_DIR,
  getPackagedNodeExecutablePath,
} from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';
import { runBackendSmokeTest } from './smoke-harness.ts';

async function main() {
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);
  const executable = getPackagedNodeExecutablePath(target);

  await runBackendSmokeTest({
    label: `packaged ${target.profile} Nest runtime`,
    executable,
    args: ['main.js'],
    cwd: BACKEND_RUNTIME_DIR,
    extraEnv: { NODE_ENV: 'prod' },
    smokeText: 'packaged nest runtime smoke',
    smokeRootPrefix: 'tauri-shell-smoke-',
  });
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
