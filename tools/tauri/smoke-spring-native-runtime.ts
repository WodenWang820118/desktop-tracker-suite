import {
  SPRING_NATIVE_RUNTIME_DIR,
  getPreparedSpringSidecarPath,
} from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';
import { runBackendSmokeTest } from './smoke-harness.ts';

async function main() {
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);
  const executable = getPreparedSpringSidecarPath(target);

  await runBackendSmokeTest({
    label: `packaged Spring-native runtime`,
    executable,
    cwd: SPRING_NATIVE_RUNTIME_DIR,
    extraEnv: {
      SPRING_PROFILES_ACTIVE: 'prod',
      ...buildNativeLibraryEnv(SPRING_NATIVE_RUNTIME_DIR),
    },
    createTaskExpectedStatus: 200,
    smokeText: 'packaged spring-native smoke',
    smokeRootPrefix: 'tauri-spring-native-smoke-',
  });
}

function buildLibrarySearchPath(libraryDir: string, existingValue: string | undefined) {
  const separator = process.platform === 'win32' ? ';' : ':';
  return [libraryDir, existingValue ?? ''].filter(Boolean).join(separator);
}

function buildNativeLibraryEnv(libraryDir: string): Record<string, string> {
  if (process.platform === 'win32') {
    return {
      PATH: buildLibrarySearchPath(libraryDir, process.env.PATH),
    };
  }

  if (process.platform === 'darwin') {
    return {
      DYLD_LIBRARY_PATH: buildLibrarySearchPath(
        libraryDir,
        process.env.DYLD_LIBRARY_PATH,
      ),
      PATH: process.env.PATH ?? '',
    };
  }

  return {
    LD_LIBRARY_PATH: buildLibrarySearchPath(libraryDir, process.env.LD_LIBRARY_PATH),
    PATH: process.env.PATH ?? '',
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
