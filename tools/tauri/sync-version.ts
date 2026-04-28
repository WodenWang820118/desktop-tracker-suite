import { readdir, readFile, writeFile } from 'node:fs/promises';
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
  const changedFiles: string[] = [];
  const tauriConfigPath = join(tauriSrcRoot, 'tauri.conf.json');
  const pendingConfigWrites: Array<{ path: string; config: Record<string, unknown> }> = [];

  const tauriConfig = await readRequiredJson<Record<string, unknown>>(
    tauriConfigPath,
    'Tauri desktop config',
  );
  if (tauriConfig.version !== version) {
    tauriConfig.version = version;
    pendingConfigWrites.push({ path: tauriConfigPath, config: tauriConfig });
  }

  for (const variantConfigPath of await listTauriVariantConfigPaths(tauriSrcRoot)) {
    const variantConfig = await readRequiredJson<Record<string, unknown>>(
      variantConfigPath,
      `Tauri desktop config at ${variantConfigPath}`,
    );
    if (
      Object.hasOwn(variantConfig, 'version') &&
      variantConfig.version !== version
    ) {
      variantConfig.version = version;
      pendingConfigWrites.push({ path: variantConfigPath, config: variantConfig });
    }
  }

  const cargoManifestPath = join(tauriSrcRoot, 'Cargo.toml');
  const currentCargoManifest = await readRequiredTextFile(
    cargoManifestPath,
    'Tauri Cargo manifest',
  );
  const nextCargoManifest = updateCargoPackageVersion(
    currentCargoManifest,
    version,
  );

  for (const pendingConfigWrite of pendingConfigWrites) {
    await writeJson(pendingConfigWrite.path, pendingConfigWrite.config, {
      root: workspaceRoot,
    });
    changedFiles.push(pendingConfigWrite.path);
  }

  if (nextCargoManifest !== currentCargoManifest) {
    await writeFile(cargoManifestPath, nextCargoManifest, 'utf8');
    changedFiles.push(cargoManifestPath);
  }

  return {
    version,
    changedFiles,
  };
}

async function listTauriVariantConfigPaths(tauriSrcRoot: string) {
  const entries = await readdir(tauriSrcRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name !== 'tauri.conf.json')
    .filter((name) => /^tauri.*\.conf\.json$/u.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => join(tauriSrcRoot, name));
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

  if (error instanceof SyntaxError) {
    return new Error(`${label} contains invalid JSON (SyntaxError): ${error.message}`, {
      cause: error,
    });
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
