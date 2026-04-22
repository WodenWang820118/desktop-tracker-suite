import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  TAURI_SRC_TAURI_ROOT,
  WORKSPACE_ROOT,
  logStep,
  readJson,
  writeJson,
} from './common.ts';

type RootPackageJson = {
  version?: string;
};

export interface SyncDesktopVersionOptions {
  workspaceRoot?: string;
  tauriSrcRoot?: string;
}

export interface SyncDesktopVersionResult {
  version: string;
  changedFiles: string[];
}

export async function syncDesktopVersionFiles(
  options: SyncDesktopVersionOptions = {},
): Promise<SyncDesktopVersionResult> {
  const workspaceRoot = options.workspaceRoot ?? WORKSPACE_ROOT;
  const tauriSrcRoot = options.tauriSrcRoot ?? TAURI_SRC_TAURI_ROOT;
  const version = await readWorkspaceVersion(workspaceRoot);
  const tauriConfigPath = join(tauriSrcRoot, 'tauri.conf.json');
  const cargoManifestPath = join(tauriSrcRoot, 'Cargo.toml');
  const changedFiles: string[] = [];

  const tauriConfig = await readRequiredJson<Record<string, unknown>>(
    tauriConfigPath,
    'Tauri desktop config',
  );
  if (tauriConfig.version !== version) {
    tauriConfig.version = version;
    await writeJson(tauriConfigPath, tauriConfig);
    changedFiles.push(tauriConfigPath);
  }

  const currentCargoManifest = await readRequiredTextFile(
    cargoManifestPath,
    'Tauri Cargo manifest',
  );
  const nextCargoManifest = updateCargoPackageVersion(currentCargoManifest, version);
  if (nextCargoManifest !== currentCargoManifest) {
    await writeFile(cargoManifestPath, nextCargoManifest, 'utf8');
    changedFiles.push(cargoManifestPath);
  }

  return {
    version,
    changedFiles,
  };
}

export function updateCargoPackageVersion(manifest: string, version: string) {
  const newline = manifest.includes('\r\n') ? '\r\n' : '\n';
  const lines = manifest.split(/\r?\n/u);
  let inPackageSection = false;
  let updated = false;

  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/u.test(trimmed)) {
      inPackageSection = trimmed === '[package]';
      return line;
    }

    if (inPackageSection && /^version\s*=/.test(trimmed) && !updated) {
      updated = true;
      const indentation = line.match(/^\s*/u)?.[0] ?? '';
      return `${indentation}version = "${version}"`;
    }

    return line;
  });

  if (!updated) {
    throw new Error('Cargo.toml is missing a version field inside the [package] section.');
  }

  return nextLines.join(newline);
}

async function readWorkspaceVersion(workspaceRoot: string) {
  const rootPackageJson = await readRequiredJson<RootPackageJson>(
    join(workspaceRoot, 'package.json'),
    'Workspace package.json',
  );
  const version = rootPackageJson.version?.trim();
  if (!version) {
    throw new Error('The root package.json is missing a version field.');
  }

  return version;
}

async function readRequiredJson<T>(path: string, label: string) {
  try {
    return await readJson<T>(path);
  } catch (error) {
    throw wrapMissingFileError(error, path, label);
  }
}

async function readRequiredTextFile(path: string, label: string) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw wrapMissingFileError(error, path, label);
  }
}

function wrapMissingFileError(error: unknown, path: string, label: string) {
  const errnoError = error as NodeJS.ErrnoException | undefined;
  if (errnoError?.code === 'ENOENT') {
    return new Error(`${label} is missing at ${path}.`, { cause: error });
  }

  return error;
}

async function main() {
  const result = await syncDesktopVersionFiles();
  logStep(
    result.changedFiles.length === 0
      ? `Desktop shell version is already synchronized at ${result.version}`
      : `Synchronized desktop shell version ${result.version} in ${result.changedFiles.length} file(s)`,
  );
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
