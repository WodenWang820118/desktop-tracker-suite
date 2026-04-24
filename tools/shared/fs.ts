import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { WORKSPACE_ROOT } from './workspace.ts';

export interface WorkspacePathOptions {
  root?: string;
}

export async function ensureDir(
  path: string,
  options: WorkspacePathOptions = {},
): Promise<void> {
  await mkdir(resolveWorkspacePath(path, options), { recursive: true });
}

export async function writeJson(
  path: string,
  value: unknown,
  options: WorkspacePathOptions = {},
): Promise<void> {
  const resolvedPath = resolveWorkspacePath(path, options);
  await ensureDir(dirname(resolvedPath), options);
  await writeFile(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function fileExists(
  path: string,
  options: WorkspacePathOptions = {},
): Promise<boolean> {
  const resolvedPath = resolveWorkspacePath(path, options);

  try {
    await stat(resolvedPath);
    return true;
  } catch {
    return false;
  }
}

export function resolveWorkspacePath(
  path: string,
  { root = WORKSPACE_ROOT }: WorkspacePathOptions = {},
): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = isAbsolute(path) ? resolve(path) : resolve(resolvedRoot, path);
  const relativePath = relative(resolvedRoot, resolvedPath);
  const isInsideRoot =
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath));

  if (!isInsideRoot) {
    throw new Error(`Path is outside of the allowed root: ${path}`);
  }

  return resolvedPath;
}
