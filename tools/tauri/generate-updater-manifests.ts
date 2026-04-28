import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
  ensureCleanDir,
  ensureDir,
  readJson,
  WORKSPACE_ROOT,
} from './common.ts';
import {
  GRID_BACKENDS,
  GRID_DESKTOP_TARGETS,
  GRID_FRONTENDS,
  getCanonicalUpdaterManifestFileName,
  getGridVariantKey,
  getUpdaterManifestFileName,
  listGridSelections,
  type GridBackend,
  type GridDesktopTarget,
  type GridFrontend,
  type GridSelection,
} from './grid.ts';

type ReleaseArtifact = {
  desktopTarget: GridDesktopTarget;
  fileName: string;
  filePath: string;
  isSignature: boolean;
  selection: GridSelection;
};

type UpdaterPlatform = {
  signature: string;
  url: string;
};

type UpdaterManifest = {
  platforms: Record<string, UpdaterPlatform>;
  pub_date: string;
  version: string;
};

export type GenerateUpdaterManifestsInput = {
  now?: Date;
  outputDir: string;
  releaseDir: string;
  releaseTag: string;
  version?: string;
};

const RELEASE_DOWNLOAD_BASE = 'https://github.com/WodenWang820118/nx-electron/releases/download';

const TARGET_PLATFORM_KEYS: Record<GridDesktopTarget, string> = {
  'darwin-arm64': 'darwin-aarch64',
  'linux-x64': 'linux-x86_64',
  'windows-x64': 'windows-x86_64',
};

const TARGET_NAME_PARTS: Record<GridDesktopTarget, { arch: string[]; platform: string[] }> = {
  'darwin-arm64': {
    arch: ['aarch64', 'arm64'],
    platform: ['darwin', 'macos'],
  },
  'linux-x64': {
    arch: ['x64', 'x86_64', 'amd64'],
    platform: ['linux'],
  },
  'windows-x64': {
    arch: ['x64', 'x86_64', 'amd64'],
    platform: ['windows'],
  },
};

export async function generateUpdaterManifestFiles(
  input: GenerateUpdaterManifestsInput,
): Promise<string[]> {
  const version = input.version ?? (await readWorkspaceVersion());
  const manifests = await buildUpdaterManifestContents({
    now: input.now,
    releaseDir: input.releaseDir,
    releaseTag: input.releaseTag,
    version,
  });

  await ensureCleanDir(input.outputDir);
  const writtenFiles: string[] = [];
  for (const [fileName, content] of Object.entries(manifests)) {
    if (fileName === getCanonicalUpdaterManifestFileName()) {
      continue;
    }

    const filePath = join(input.outputDir, fileName);
    await ensureDir(input.outputDir);
    await writeFile(filePath, content, 'utf8');
    writtenFiles.push(filePath);
  }

  const canonicalSource = join(
    input.outputDir,
    getUpdaterManifestFileName({ backend: 'nest', frontend: 'ng' }),
  );
  const canonicalDestination = join(input.outputDir, getCanonicalUpdaterManifestFileName());
  await copyFile(canonicalSource, canonicalDestination);
  writtenFiles.push(canonicalDestination);

  return writtenFiles;
}

export async function buildUpdaterManifestContents(input: {
  now?: Date;
  releaseDir: string;
  releaseTag: string;
  version: string;
}): Promise<Record<string, string>> {
  const artifacts = await collectReleaseArtifacts(input.releaseDir);
  const manifests: Record<string, string> = {};
  for (const selection of listGridSelections()) {
    const manifest = await buildUpdaterManifest({
      artifacts,
      now: input.now ?? new Date(),
      releaseTag: input.releaseTag,
      selection,
      version: input.version,
    });
    manifests[getUpdaterManifestFileName(selection)] = `${JSON.stringify(manifest, null, 2)}\n`;
  }

  const canonicalContent = manifests[getUpdaterManifestFileName({ backend: 'nest', frontend: 'ng' })];
  if (!canonicalContent) {
    throw new Error('Canonical ng-nest updater manifest was not generated.');
  }
  manifests[getCanonicalUpdaterManifestFileName()] = canonicalContent;

  return manifests;
}

export async function collectReleaseArtifacts(releaseDir: string): Promise<ReleaseArtifact[]> {
  const filePaths = await listFiles(releaseDir);
  return filePaths
    .map((filePath) => parseReleaseArtifact(filePath))
    .filter((artifact): artifact is ReleaseArtifact => artifact !== null);
}

export function parseReleaseArtifact(filePath: string): ReleaseArtifact | null {
  const fileName = basename(filePath);
  const variant = parseVariantFromArtifactName(fileName);
  if (!variant) {
    return null;
  }

  const desktopTarget = parseDesktopTargetFromArtifactName(fileName, variant.prefix);
  if (!desktopTarget) {
    return null;
  }

  return {
    desktopTarget,
    fileName,
    filePath,
    isSignature: fileName.endsWith('.sig'),
    selection: variant.selection,
  };
}

function parseVariantFromArtifactName(fileName: string):
  | { prefix: string; selection: GridSelection }
  | null {
  for (const frontend of GRID_FRONTENDS) {
    for (const backend of GRID_BACKENDS) {
      const prefix = `desktop-tracker-suite-${frontend}-${backend}-`;
      if (fileName.startsWith(prefix)) {
        return {
          prefix,
          selection: { backend, frontend },
        };
      }
    }
  }

  return null;
}

function parseDesktopTargetFromArtifactName(
  fileName: string,
  variantPrefix: string,
): GridDesktopTarget | null {
  const rest = fileName.slice(variantPrefix.length).toLowerCase();
  for (const target of GRID_DESKTOP_TARGETS) {
    const parts = TARGET_NAME_PARTS[target];
    if (
      parts.platform.some((platform) => rest.includes(`-${platform}-`)) &&
      parts.arch.some((arch) => rest.includes(`-${arch}`))
    ) {
      return target;
    }
  }

  return null;
}

async function buildUpdaterManifest(input: {
  artifacts: ReleaseArtifact[];
  now: Date;
  releaseTag: string;
  selection: GridSelection;
  version: string;
}): Promise<UpdaterManifest> {
  const platforms: Record<string, UpdaterPlatform> = {};
  for (const desktopTarget of GRID_DESKTOP_TARGETS) {
    const pair = selectUpdaterArtifactPair({
      artifacts: input.artifacts,
      desktopTarget,
      selection: input.selection,
    });
    const platformKey = TARGET_PLATFORM_KEYS[desktopTarget];
    platforms[platformKey] = {
      signature: await readFile(pair.signature.filePath, 'utf8'),
      url: buildReleaseDownloadUrl(input.releaseTag, pair.asset.fileName),
    };
  }

  return {
    version: input.version,
    pub_date: input.now.toISOString(),
    platforms,
  };
}

function selectUpdaterArtifactPair(input: {
  artifacts: ReleaseArtifact[];
  desktopTarget: GridDesktopTarget;
  selection: GridSelection;
}): { asset: ReleaseArtifact; signature: ReleaseArtifact } {
  const candidates = input.artifacts.filter(
    (artifact) =>
      artifact.desktopTarget === input.desktopTarget &&
      artifact.selection.frontend === input.selection.frontend &&
      artifact.selection.backend === input.selection.backend,
  );
  const assets = candidates.filter((artifact) => !artifact.isSignature);
  const signatures = candidates
    .filter((artifact) => artifact.isSignature)
    .sort(
      (left, right) =>
        signaturePriority(right.fileName, input.desktopTarget) -
        signaturePriority(left.fileName, input.desktopTarget),
    );

  for (const signature of signatures) {
    const matchingAsset = assets.find(
      (asset) => asset.fileName === signature.fileName.slice(0, -'.sig'.length),
    );
    if (matchingAsset) {
      return {
        asset: matchingAsset,
        signature,
      };
    }
  }

  throw new Error(
    `Missing updater asset/signature pair for ${getGridVariantKey(input.selection)} ${input.desktopTarget}.`,
  );
}

function signaturePriority(fileName: string, desktopTarget: GridDesktopTarget): number {
  if (desktopTarget === 'windows-x64') {
    if (fileName.endsWith('-setup.exe.sig')) return 100;
    if (fileName.endsWith('.nsis.zip.sig')) return 90;
    if (fileName.endsWith('.msi.sig') || fileName.endsWith('.msi.zip.sig')) return 80;
  }

  if (desktopTarget === 'linux-x64') {
    if (fileName.endsWith('.AppImage.tar.gz.sig')) return 100;
    if (fileName.endsWith('.AppImage.sig')) return 90;
  }

  if (desktopTarget === 'darwin-arm64') {
    if (fileName.endsWith('.app.tar.gz.sig')) return 100;
    if (fileName.endsWith('.dmg.sig')) return 80;
  }

  return 0;
}

function buildReleaseDownloadUrl(releaseTag: string, fileName: string): string {
  return `${RELEASE_DOWNLOAD_BASE}/${encodeURIComponent(releaseTag)}/${encodeURIComponent(fileName)}`;
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function readWorkspaceVersion(): Promise<string> {
  const packageJson = await readJson<{ version?: string }>(join(WORKSPACE_ROOT, 'package.json'));
  const version = packageJson.version?.trim();
  if (!version) {
    throw new Error('The root package.json is missing a version field.');
  }

  return version;
}

function parseCliArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument "${arg}".`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}.`);
    }

    values.set(arg.slice('--'.length), value);
    index += 1;
  }

  const releaseTag = values.get('release-tag');
  const releaseDir = values.get('release-dir');
  const outputDir = values.get('output-dir');
  if (!releaseTag || !releaseDir || !outputDir) {
    throw new Error(
      'Usage: node tools/tauri/generate-updater-manifests.ts --release-tag <tag> --release-dir <artifact-root> --output-dir <output-dir>',
    );
  }

  return {
    outputDir,
    releaseDir,
    releaseTag,
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const writtenFiles = await generateUpdaterManifestFiles(args);
  console.log(
    `Generated ${writtenFiles.length} updater manifest file(s): ${writtenFiles
      .map((filePath) => basename(filePath))
      .join(', ')}`,
  );
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

export const __test = {
  buildReleaseDownloadUrl,
  parseDesktopTargetFromArtifactName,
  parseVariantFromArtifactName,
  selectUpdaterArtifactPair,
};
