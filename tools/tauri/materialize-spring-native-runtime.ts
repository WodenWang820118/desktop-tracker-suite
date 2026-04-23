import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DATABASE_FILE_NAME,
  SPRING_NATIVE_DIST_DIR,
  SPRING_NATIVE_RUNTIME_DIR,
  TAURI_SPRING_DIST_ROOT,
  TAURI_SPRING_METADATA_DIR,
  copyDirectory,
  ensureCleanDir,
  fileExists,
  logStep,
  writeJson,
  writeTextFile,
} from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';

type SpringDesktopRuntimeMetadata = {
  backendDirectory: string;
  databaseFileName: string;
  desktopTarget: string;
  executableName: string;
  logFileName: string;
  runtimeKind: 'spring-native';
};

function buildDesktopRuntimeMetadata(target: { profile: string }): SpringDesktopRuntimeMetadata {
  return {
    backendDirectory: 'spring-native',
    databaseFileName: DATABASE_FILE_NAME,
    desktopTarget: target.profile,
    executableName: 'spring-backend.exe',
    logFileName: 'backend-runtime.log',
    runtimeKind: 'spring-native',
  };
}

async function main() {
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);
  const executablePath = join(SPRING_NATIVE_DIST_DIR, 'spring-backend.exe');
  if (!(await fileExists(executablePath))) {
    throw new Error(
      `Spring native executable is missing at ${executablePath}. Run nx run spring-backend:native-build first.`,
    );
  }

  logStep('Preparing Spring-native Tauri runtime resources');
  await ensureCleanDir(TAURI_SPRING_DIST_ROOT);
  await ensureCleanDir(SPRING_NATIVE_RUNTIME_DIR);
  await ensureCleanDir(TAURI_SPRING_METADATA_DIR);

  logStep('Copying the built Spring native runtime into the packaged runtime folder');
  await copyDirectory(SPRING_NATIVE_DIST_DIR, SPRING_NATIVE_RUNTIME_DIR);
  await writeJson(
    join(TAURI_SPRING_METADATA_DIR, 'desktop-runtime.json'),
    buildDesktopRuntimeMetadata(target),
  );
  await writeTextFile(join(TAURI_SPRING_METADATA_DIR, '.tauri-database-name'), `${DATABASE_FILE_NAME}\n`);

  logStep(`Spring-native Tauri runtime materialized for ${target.profile} at ${TAURI_SPRING_DIST_ROOT}`);
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
