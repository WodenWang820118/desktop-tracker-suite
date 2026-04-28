import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

function getFileName(filePath: string) {
  return filePath.split(/[\\/]/u).at(-1) ?? filePath;
}

function isTestExecutableName(fileName: string) {
  return /(^|[-_.])test([-_.]|$)/u.test(fileName.toLowerCase());
}

export function pickNativeExecutable(
  candidateDirs: string[],
  platform: NodeJS.Platform = process.platform,
) {
  const suffix = platform === 'win32' ? '.exe' : '';
  const candidates = candidateDirs.flatMap((dir) =>
    listFiles(dir).filter((filePath) => {
      const fileName = getFileName(filePath);
      return suffix
        ? fileName.toLowerCase().endsWith(suffix)
        : !fileName.includes('.');
    }),
  );

  const filtered = candidates
    .filter((filePath) => !isTestExecutableName(getFileName(filePath)))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  return filtered[0] ?? null;
}

export function isSpringNativeRuntimeArtifact(
  filePath: string,
  executablePath: string,
) {
  const normalized = filePath.toLowerCase();
  const fileName = getFileName(normalized);
  if (normalized === executablePath.toLowerCase()) {
    return true;
  }

  if (fileName.endsWith('.original')) {
    return false;
  }

  return (
    fileName.endsWith('.dll') ||
    fileName.endsWith('.so') ||
    /\.so\.\d+(?:\.\d+)*$/u.test(fileName) ||
    fileName.endsWith('.dylib')
  );
}

export function stageSpringNativeRuntimeArtifacts({
  distDir,
  executable,
  sourceDir,
}: {
  distDir: string;
  executable: string;
  sourceDir: string;
}) {
  if (!existsSync(sourceDir)) {
    throw new Error(`Spring native artifact source directory is missing: ${sourceDir}`);
  }

  const filesToCopy = listFiles(sourceDir).filter((filePath) =>
    isSpringNativeRuntimeArtifact(filePath, executable),
  );

  if (filesToCopy.length === 0) {
    throw new Error(`No Spring native runtime artifacts found in: ${sourceDir}`);
  }

  rmSync(distDir, { recursive: true, force: true });
  ensureDir(distDir);

  for (const filePath of filesToCopy) {
    cpSync(filePath, join(distDir, getFileName(filePath)), {
      force: true,
    });
  }
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
  stageSpringNativeRuntimeArtifacts({ distDir, executable, sourceDir });

  console.log(`Copied Spring native runtime artifacts to ${distDir}`);
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main();
}
