import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
  type DesktopTargetInfo,
} from './runtime-target.ts';
import { ensureDir } from '../shared/fs.ts';
import { runCommand as runSharedCommand } from '../shared/process.ts';
import { NODE_CACHE_DIR, NODE_VERSION, NODE_RUNTIME_DIR } from './constants.ts';

// ---- Local helpers (avoid circular dep on common.ts) ----

function nodeLog(message: string) {
  console.log(`[tauri-shell] ${message}`);
}

async function copyFileEnsured(source: string, destination: string) {
  await ensureDir(dirname(destination));
  await copyFile(source, destination);
}

async function runCommand(command: string, args: string[]) {
  await runSharedCommand(command, args, {
    log: (msg: string) => nodeLog(`> ${msg}`),
  });
}

// ---- Public API ----

export function getPackagedNodeExecutablePath(
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  return join(NODE_RUNTIME_DIR, target.nodeBinaryName);
}

export async function ensureNodeBinaryDownloaded(
  target: DesktopTargetInfo = resolveDesktopTargetInfo(),
) {
  assertHostCanBuildDesktopTarget(target);
  await ensureDir(NODE_CACHE_DIR);
  const shasumsUrl = `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`;
  const distributionPath = target.nodeDistributionPath;
  const distributionUrl = `https://nodejs.org/dist/v${NODE_VERSION}/${distributionPath}`;
  const expectedSha = await resolveNodeDistributionChecksum(
    shasumsUrl,
    distributionPath,
  );
  const cachedExecutablePath = getCachedNodeExecutablePath(target);

  if (target.nodeArchiveFileName && target.nodeArchiveEntryPath) {
    const archivePath = getCachedNodeArchivePath(target);
    if (!archivePath) {
      throw new Error(
        `Target ${target.profile} is missing a node archive path.`,
      );
    }

    if (
      !existsSync(archivePath) ||
      (await sha256(archivePath)) !== expectedSha
    ) {
      await downloadNodeArtifact(distributionUrl, archivePath);
    }

    const actualSha = await sha256(archivePath);
    if (actualSha !== expectedSha) {
      throw new Error(
        `Downloaded ${target.nodeArchiveFileName} checksum mismatch. Expected ${expectedSha}, received ${actualSha}.`,
      );
    }

    await extractNodeBinaryFromArchive(
      archivePath,
      target.nodeArchiveEntryPath,
      cachedExecutablePath,
    );
    await ensureExecutablePermissions(cachedExecutablePath);
    nodeLog(`Pinned Node runtime is ready at ${cachedExecutablePath}`);
    return cachedExecutablePath;
  }

  if (
    !existsSync(cachedExecutablePath) ||
    (await sha256(cachedExecutablePath)) !== expectedSha
  ) {
    await downloadNodeArtifact(distributionUrl, cachedExecutablePath);
  }

  const actualSha = await sha256(cachedExecutablePath);
  if (actualSha !== expectedSha) {
    throw new Error(
      `Downloaded ${target.nodeBinaryName} checksum mismatch. Expected ${expectedSha}, received ${actualSha}.`,
    );
  }

  await ensureExecutablePermissions(cachedExecutablePath);
  nodeLog(`Pinned Node runtime is ready at ${cachedExecutablePath}`);
  return cachedExecutablePath;
}

// ---- Internal helpers ----

function getCachedNodeExecutablePath(target: DesktopTargetInfo) {
  return join(NODE_CACHE_DIR, target.nodeCacheFileName);
}

function getCachedNodeArchivePath(target: DesktopTargetInfo) {
  if (!target.nodeArchiveFileName) {
    return null;
  }

  return join(NODE_CACHE_DIR, target.nodeArchiveFileName);
}

async function downloadNodeArtifact(url: string, destinationPath: string) {
  nodeLog(`Downloading pinned Node runtime ${NODE_VERSION} from ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(destinationPath, Buffer.from(arrayBuffer));
}

async function resolveNodeDistributionChecksum(
  shasumsUrl: string,
  distributionPath: string,
) {
  const response = await fetch(shasumsUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${shasumsUrl}: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const normalizedPath = distributionPath.replaceAll('\\', '/');
  const line = text
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find((entry) => entry.endsWith(normalizedPath));

  if (!line) {
    throw new Error(
      `Could not find the checksum for ${normalizedPath} in ${shasumsUrl}`,
    );
  }

  const [checksum] = line.split(/\s+/u);
  return checksum;
}

async function extractNodeBinaryFromArchive(
  archivePath: string,
  archiveEntryPath: string,
  destinationPath: string,
) {
  const extractionRoot = await mkdtemp(join(tmpdir(), 'tauri-node-runtime-'));
  try {
    await runCommand('tar', [
      '-xzf',
      archivePath,
      '-C',
      extractionRoot,
      archiveEntryPath,
    ]);
    await copyFileEnsured(
      join(extractionRoot, archiveEntryPath),
      destinationPath,
    );
  } finally {
    await rm(extractionRoot, { recursive: true, force: true });
  }
}

async function ensureExecutablePermissions(path: string) {
  if (process.platform === 'win32') {
    return;
  }

  await chmod(path, 0o755);
}

async function sha256(path: string) {
  const buffer = await readFile(path);
  return createHash('sha256').update(buffer).digest('hex');
}
