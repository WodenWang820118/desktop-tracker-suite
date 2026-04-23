import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DATABASE_FILE_NAME,
  SPRING_NATIVE_DIST_DIR,
  SPRING_BACKEND_SIDECAR_NAME,
  SPRING_NATIVE_RUNTIME_DIR,
  TAURI_BINARIES_DIR,
  TAURI_SPRING_DIST_ROOT,
  TAURI_SPRING_METADATA_DIR,
  copyFileEnsured,
  ensureDir,
  ensureCleanDir,
  fileExists,
  getPreparedSpringSidecarPath,
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
  backendKind: 'spring-native';
  databaseFileName: string;
  desktopTarget: string;
  logFileName: string;
  runtimeMode: 'sidecar';
  sidecarName: string;
};

export function buildDesktopRuntimeMetadata(target: { profile: string }): SpringDesktopRuntimeMetadata {
  return {
    backendDirectory: 'spring-native',
    backendKind: 'spring-native',
    databaseFileName: DATABASE_FILE_NAME,
    desktopTarget: target.profile,
    logFileName: 'backend-runtime.log',
    runtimeMode: 'sidecar',
    sidecarName: SPRING_BACKEND_SIDECAR_NAME,
  };
}

export function buildSpringNativeExecutableFileName(target: {
  hostPlatform: NodeJS.Platform;
}) {
  return `spring-backend${target.hostPlatform === 'win32' ? '.exe' : ''}`;
}

export function listSpringNativeCompanionFiles(
  entries: Array<{ isFile(): boolean; name: string }>,
  executableFileName: string,
) {
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((entryName) => entryName.toLowerCase() !== executableFileName.toLowerCase());
}

async function main() {
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);
  const executableFileName = buildSpringNativeExecutableFileName(target);
  const executablePath = join(SPRING_NATIVE_DIST_DIR, executableFileName);
  if (!(await fileExists(executablePath))) {
    throw new Error(
      `Spring native executable is missing at ${executablePath}. Run nx run spring-backend:native-build first.`,
    );
  }

  logStep('Preparing Spring-native Tauri runtime resources');
  await ensureCleanDir(TAURI_SPRING_DIST_ROOT);
  await ensureCleanDir(SPRING_NATIVE_RUNTIME_DIR);
  await ensureCleanDir(TAURI_SPRING_METADATA_DIR);
  await ensureDir(TAURI_BINARIES_DIR);

  const preparedExecutablePath = getPreparedSpringSidecarPath(target);
  logStep(`Copying the built Spring native runtime into the Tauri sidecar binaries folder (${preparedExecutablePath})`);
  await copyFileEnsured(executablePath, preparedExecutablePath);

  const companionFiles = listSpringNativeCompanionFiles(
    await readdir(SPRING_NATIVE_DIST_DIR, { withFileTypes: true }),
    executableFileName,
  );
  for (const entry of companionFiles) {
    await copyFileEnsured(
      join(SPRING_NATIVE_DIST_DIR, entry),
      join(SPRING_NATIVE_RUNTIME_DIR, entry),
    );
  }

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
