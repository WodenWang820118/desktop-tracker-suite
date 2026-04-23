import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function listFiles(path: string) {
  if (!existsSync(path)) {
    return [];
  }

  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(path, entry.name));
}

function pickNativeExecutable(candidateDirs: string[]) {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const candidates = candidateDirs.flatMap((dir) =>
    listFiles(dir).filter((filePath) =>
      suffix ? filePath.toLowerCase().endsWith(suffix) : !filePath.includes('.'),
    ),
  );

  const filtered = candidates
    .filter((filePath) => !filePath.toLowerCase().includes('test'))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  return filtered[0] ?? null;
}

function main() {
  const candidateDirs = [
    resolve('apps/spring-backend/target'),
    resolve('target'),
  ];
  const executable = pickNativeExecutable(candidateDirs);
  if (!executable) {
    throw new Error(
      `No native executable found under ${candidateDirs.join(', ')}. Did native:compile run?`,
    );
  }

  const sourceDir = dirname(executable);
  const distDir = resolve('dist/spring-backend-native');
  rmSync(distDir, { recursive: true, force: true });
  ensureDir(distDir);

  const filesToCopy = listFiles(sourceDir).filter((filePath) => {
    const normalized = filePath.toLowerCase();
    return normalized === executable.toLowerCase() || normalized.endsWith('.dll');
  });

  for (const filePath of filesToCopy) {
    cpSync(filePath, join(distDir, filePath.split(/[\\/]/u).at(-1)!), {
      force: true,
    });
  }

  console.log(`Copied Spring native runtime artifacts to ${distDir}`);
}

main();
