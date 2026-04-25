import { basename, extname, join, relative } from 'node:path';
import { readdir } from 'node:fs/promises';

import { WORKSPACE_ROOT } from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  resolveDesktopTargetInfo,
} from '../tauri/runtime-target.ts';
import { writeMetricSnapshot, pathSize } from './common.ts';

type RuntimeMode = 'express' | 'nest' | 'nest-legacy' | 'spring-native';

type BundleArtifact = {
  relativePath: string;
  sizeBytes: number;
};

const PRIMARY_BUNDLE_EXTENSIONS = new Set(['.exe', '.msi', '.appimage', '.deb', '.rpm', '.dmg', '.zip']);

async function main() {
  const runtimeMode = parseRuntimeMode(process.argv[2]);
  const target = resolveDesktopTargetInfo();
  assertHostCanBuildDesktopTarget(target);

  const bundleRoot = join(
    WORKSPACE_ROOT,
    'apps',
    'tauri-shell',
    'src-tauri',
    'target',
    target.rustTarget,
    'release',
    'bundle',
  );
  const productName =
    runtimeMode === 'spring-native'
      ? 'Desktop Tracker Suite Spring Native PoC'
      : runtimeMode === 'express'
        ? 'Desktop Tracker Suite Express Sidecar PoC'
        : runtimeMode === 'nest-legacy'
          ? 'Desktop Tracker Suite Legacy Nest Runtime'
          : 'Desktop Tracker Suite';
  const bundleArtifacts = await collectBundleArtifacts(bundleRoot, productName);

  if (bundleArtifacts.length === 0) {
    throw new Error(
      `No packaged bundle artifacts for "${productName}" were found under ${bundleRoot}. Run the matching desktop:package command first.`,
    );
  }

  const primaryArtifacts = bundleArtifacts.filter((artifact) =>
    PRIMARY_BUNDLE_EXTENSIONS.has(extname(artifact.relativePath).toLowerCase()),
  );

  const metrics = {
    runtimeKind:
      runtimeMode === 'spring-native'
        ? 'spring-native-tauri-bundle'
        : runtimeMode === 'express'
          ? 'express-node-sidecar-tauri-bundle'
          : runtimeMode === 'nest-legacy'
            ? 'nest-node-legacy-tauri-bundle'
            : 'nest-node-sidecar-tauri-bundle',
    desktopTarget: target.profile,
    productName,
    bundleRoot,
    artifactCount: bundleArtifacts.length,
    artifactTotalSizeBytes: bundleArtifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0),
    primaryArtifactCount: primaryArtifacts.length,
    primaryArtifactTotalSizeBytes: primaryArtifacts.reduce(
      (total, artifact) => total + artifact.sizeBytes,
      0,
    ),
    primaryArtifacts,
  };

  await writeMetricSnapshot(
    runtimeMode === 'spring-native'
      ? 'desktop-spring-native-package.json'
      : runtimeMode === 'express'
        ? 'desktop-express-sidecar-package.json'
        : runtimeMode === 'nest-legacy'
          ? 'desktop-legacy-nest-package.json'
          : 'desktop-baseline-package.json',
    metrics,
  );
}

function parseRuntimeMode(value: string | undefined): RuntimeMode {
  if (!value || value === 'nest') {
    return 'nest';
  }

  if (value === 'spring-native') {
    return 'spring-native';
  }

  if (value === 'express') {
    return 'express';
  }

  if (value === 'nest-legacy') {
    return 'nest-legacy';
  }

  throw new Error(
    `Unsupported runtime mode "${value}". Expected "nest", "express", "nest-legacy", or "spring-native".`,
  );
}

async function collectBundleArtifacts(root: string, productName: string): Promise<BundleArtifact[]> {
  const matches: BundleArtifact[] = [];
  await walkBundleArtifacts(root, root, productName.toLowerCase(), matches);
  return matches;
}

async function walkBundleArtifacts(
  root: string,
  currentPath: string,
  normalizedProductName: string,
  matches: BundleArtifact[],
) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await walkBundleArtifacts(root, entryPath, normalizedProductName, matches);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!basename(entry.name).toLowerCase().includes(normalizedProductName)) {
      continue;
    }

    matches.push({
      relativePath: relative(root, entryPath),
      sizeBytes: await pathSize(entryPath),
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
