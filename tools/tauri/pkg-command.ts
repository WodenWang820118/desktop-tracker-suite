import { type SpawnOptions } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { runCommand } from '../shared/process.ts';
import { logStep } from './common.ts';

export function getWorkspacePkgPackageJsonPath(): string {
  return createRequire(import.meta.url).resolve('@yao-pkg/pkg/package.json');
}

export async function getWorkspacePkgEntryPoint(): Promise<string> {
  const packageJsonPath = getWorkspacePkgPackageJsonPath();
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    bin?: string | { pkg?: string };
  };
  const bin =
    typeof packageJson.bin === 'string'
      ? packageJson.bin
      : packageJson.bin?.pkg;
  if (typeof bin !== 'string' || !bin.trim()) {
    throw new Error(
      'Installed @yao-pkg/pkg does not declare a pkg executable.',
    );
  }

  const packageRoot = dirname(packageJsonPath);
  const entryPoint = resolve(packageRoot, bin);
  const entryRelativePath = relative(packageRoot, entryPoint);
  if (
    entryRelativePath === '..' ||
    entryRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(entryRelativePath)
  ) {
    throw new Error('Installed pkg executable must stay within its package.');
  }
  return entryPoint;
}

export async function runWorkspacePkg(
  args: string[],
  options: SpawnOptions = {},
) {
  if (process.versions.bun) {
    throw new Error('Sidecar packaging must be launched with Node.js.');
  }
  return await runCommand(
    process.execPath,
    [await getWorkspacePkgEntryPoint(), ...args],
    { log: logStep, ...options, shell: false },
  );
}
