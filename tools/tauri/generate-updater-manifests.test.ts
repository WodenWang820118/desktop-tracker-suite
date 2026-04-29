import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import {
  __test,
  buildUpdaterManifestContents,
  generateUpdaterManifestFiles,
  parseReleaseArtifact,
} from './generate-updater-manifests.ts';
import {
  GRID_BACKENDS,
  GRID_DESKTOP_TARGETS,
  GRID_FRONTENDS,
  getCanonicalUpdaterManifestFileName,
  getUpdaterManifestFileName,
  type GridBackend,
  type GridDesktopTarget,
  type GridFrontend,
} from './grid.ts';
import { WORKSPACE_ROOT } from './common.ts';

test('parseReleaseArtifact extracts variant and desktop target from asset names', () => {
  assert.equal(
    parseReleaseArtifact(
      join(
        'release',
        'desktop-tracker-suite-react-spring-native-1.4.2-darwin-aarch64.app.tar.gz.sig',
      ),
    ),
    null,
  );
  assert.equal(
    parseReleaseArtifact(
      join('release', 'desktop-tracker-suite-ng-nest-1.4.2-darwin-aarch64.app.tar.gz'),
    ),
    null,
  );
  assert.equal(
    parseReleaseArtifact(
      join('release', 'desktop-tracker-suite-ng-nest-1.4.2-darwin-x64.app.tar.gz'),
    ),
    null,
  );

  const windowsAsset = parseReleaseArtifact(
    join('release', 'desktop-tracker-suite-ng-nest-1.4.2-windows-x64-setup.exe'),
  );
  assert.ok(windowsAsset);
  assert.equal(windowsAsset.desktopTarget, 'windows-x64');
  assert.equal(windowsAsset.isSignature, false);

  const linuxAsset = parseReleaseArtifact(
    join('release', 'desktop-tracker-suite-vue-express-1.4.2-linux-x64.AppImage.tar.gz'),
  );
  assert.ok(linuxAsset);
  assert.equal(linuxAsset.desktopTarget, 'linux-x64');
  assert.equal(linuxAsset.isSignature, false);

  assert.equal(parseReleaseArtifact(join('release', 'README.txt')), null);
});

test('selectUpdaterArtifactPair prefers the highest priority Windows signature pair', () => {
  const setupAsset = releaseArtifact('desktop-tracker-suite-ng-nest-1.4.2-windows-x64-setup.exe');
  const nsisAsset = releaseArtifact('desktop-tracker-suite-ng-nest-1.4.2-windows-x64.nsis.zip');
  const pair = __test.selectUpdaterArtifactPair({
    artifacts: [
      nsisAsset,
      releaseArtifact(`${nsisAsset.fileName}.sig`, true),
      setupAsset,
      releaseArtifact(`${setupAsset.fileName}.sig`, true),
    ] as any,
    desktopTarget: 'windows-x64',
    selection: { backend: 'nest', frontend: 'ng' },
  });

  assert.equal(pair.asset.fileName, setupAsset.fileName);
  assert.equal(pair.signature.fileName, `${setupAsset.fileName}.sig`);
});

test('buildUpdaterManifestContents emits all variant manifests and canonical alias content', async () => {
  const releaseDir = await createCompleteReleaseArtifactTree();
  // The unsupported darwin pair must be ignored by the react-express manifest below.
  await writeUnsupportedDarwinArtifactPair({
    backend: 'express',
    frontend: 'react',
    root: releaseDir,
  });
  const manifests = await buildUpdaterManifestContents({
    now: new Date('2026-04-27T00:00:00.000Z'),
    releaseDir,
    releaseTag: 'v1.4.2',
    version: '1.4.2',
  });

  assert.equal(Object.keys(manifests).length, 10);
  assert.equal(
    manifests[getCanonicalUpdaterManifestFileName()],
    manifests[getUpdaterManifestFileName({ backend: 'nest', frontend: 'ng' })],
  );

  const reactExpress = JSON.parse(
    manifests[getUpdaterManifestFileName({ backend: 'express', frontend: 'react' })],
  ) as {
    platforms: Record<string, { signature: string; url: string }>;
    pub_date: string;
    version: string;
  };
  assert.equal(reactExpress.version, '1.4.2');
  assert.equal(reactExpress.pub_date, '2026-04-27T00:00:00.000Z');
  assert.deepEqual(Object.keys(reactExpress.platforms).sort(), [
    'linux-x86_64',
    'windows-x86_64',
  ]);
  assert.equal(
    reactExpress.platforms['windows-x86_64'].url,
    'https://github.com/WodenWang820118/desktop-tracker-suite/releases/download/v1.4.2/desktop-tracker-suite-react-express-1.4.2-windows-x64-setup.exe',
  );
  assert.equal(
    reactExpress.platforms['linux-x86_64'].signature,
    'signature react-express linux-x64',
  );
});

test('generateUpdaterManifestFiles copies latest-ng-nest.json byte-for-byte to latest.json', async () => {
  const releaseDir = await createCompleteReleaseArtifactTree();
  await writeUnsupportedDarwinArtifactPair({
    backend: 'nest',
    frontend: 'ng',
    root: releaseDir,
  });
  const outputRoot = join(WORKSPACE_ROOT, 'tmp');
  await mkdir(outputRoot, { recursive: true });
  const outputDir = join(await mkdtemp(join(outputRoot, 'tauri-updater-output-')), 'manifests');

  const writtenFiles = await generateUpdaterManifestFiles({
    now: new Date('2026-04-27T00:00:00.000Z'),
    outputDir,
    releaseDir,
    releaseTag: 'v1.4.2',
    version: '1.4.2',
  });

  assert.equal(writtenFiles.length, 10);
  assert.deepEqual(
    writtenFiles.map((filePath) => basename(filePath)).sort(),
    [
      'latest-ng-nest.json',
      'latest-ng-express.json',
      'latest-ng-spring-native.json',
      'latest-react-nest.json',
      'latest-react-express.json',
      'latest-react-spring-native.json',
      'latest-vue-nest.json',
      'latest-vue-express.json',
      'latest-vue-spring-native.json',
      'latest.json',
    ].sort(),
  );

  const canonicalVariant = await readFile(
    join(outputDir, getUpdaterManifestFileName({ backend: 'nest', frontend: 'ng' })),
  );
  const canonicalAlias = await readFile(
    join(outputDir, getCanonicalUpdaterManifestFileName()),
  );
  assert.deepEqual(canonicalAlias, canonicalVariant);

  const canonicalManifest = JSON.parse(canonicalVariant.toString('utf8')) as {
    platforms: Record<string, { signature: string; url: string }>;
  };
  assert.deepEqual(Object.keys(canonicalManifest.platforms).sort(), [
    'linux-x86_64',
    'windows-x86_64',
  ]);
});

test('buildUpdaterManifestContents fails when a required platform artifact is missing', async () => {
  const releaseDir = await createCompleteReleaseArtifactTree({
    skip: {
      backend: 'nest',
      desktopTarget: 'linux-x64',
      frontend: 'ng',
    },
  });

  await assert.rejects(
    () =>
      buildUpdaterManifestContents({
        now: new Date('2026-04-27T00:00:00.000Z'),
        releaseDir,
        releaseTag: 'v1.4.2',
        version: '1.4.2',
      }),
    /Missing updater asset\/signature pair for ng-nest linux-x64/u,
  );
});

async function createCompleteReleaseArtifactTree(options: {
  skip?: {
    backend: GridBackend;
    desktopTarget: GridDesktopTarget;
    frontend: GridFrontend;
  };
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'tauri-release-artifacts-'));
  for (const frontend of GRID_FRONTENDS) {
    for (const backend of GRID_BACKENDS) {
      for (const desktopTarget of GRID_DESKTOP_TARGETS) {
        if (
          options.skip?.frontend === frontend &&
          options.skip.backend === backend &&
          options.skip.desktopTarget === desktopTarget
        ) {
          continue;
        }

        await writeArtifactPair({
          backend,
          desktopTarget,
          frontend,
          root,
        });
      }
    }
  }

  return root;
}

async function writeArtifactPair(input: {
  backend: GridBackend;
  desktopTarget: GridDesktopTarget;
  frontend: GridFrontend;
  root: string;
}) {
  const variantDir = join(input.root, `${input.frontend}-${input.backend}`);
  await mkdir(variantDir, { recursive: true });
  const assetName = buildSampleAssetName(input);
  await writeFile(join(variantDir, assetName), `${assetName}\n`, 'utf8');
  await writeFile(
    join(variantDir, `${assetName}.sig`),
    `signature ${input.frontend}-${input.backend} ${input.desktopTarget}`,
    'utf8',
  );
}

async function writeUnsupportedDarwinArtifactPair(input: {
  backend: GridBackend;
  frontend: GridFrontend;
  root: string;
}) {
  const variantDir = join(input.root, `${input.frontend}-${input.backend}`);
  await mkdir(variantDir, { recursive: true });
  const assetName = `desktop-tracker-suite-${input.frontend}-${input.backend}-1.4.2-darwin-aarch64.app.tar.gz`;
  await writeFile(join(variantDir, assetName), `${assetName}\n`, 'utf8');
  await writeFile(
    join(variantDir, `${assetName}.sig`),
    `signature ${input.frontend}-${input.backend} unsupported-darwin`,
    'utf8',
  );
}

function buildSampleAssetName(input: {
  backend: GridBackend;
  desktopTarget: GridDesktopTarget;
  frontend: GridFrontend;
}) {
  const prefix = `desktop-tracker-suite-${input.frontend}-${input.backend}-1.4.2`;
  if (input.desktopTarget === 'windows-x64') {
    return `${prefix}-windows-x64-setup.exe`;
  }

  if (input.desktopTarget === 'linux-x64') {
    return `${prefix}-linux-x64.AppImage.tar.gz`;
  }

  const exhaustive: never = input.desktopTarget;
  throw new Error(`Unsupported sample desktop target: ${exhaustive}`);
}

function releaseArtifact(fileName: string, isSignature = false) {
  return {
    desktopTarget: 'windows-x64',
    fileName,
    filePath: join('release', fileName),
    isSignature,
    selection: {
      backend: 'nest',
      frontend: 'ng',
    },
  };
}
