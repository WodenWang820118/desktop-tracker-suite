import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

import {
  GRID_BACKENDS,
  GRID_FRONTENDS,
  buildGeneratedTauriConfig,
  getGeneratedConfigPath,
  getUpdaterManifestFileName,
  parseGridBackend,
  parseGridFrontend,
  resolveIdentifier,
  resolveProductName,
  writeGeneratedTauriConfig,
} from './grid.ts';
import { TAURI_SRC_TAURI_ROOT, WORKSPACE_ROOT } from './common.ts';

const RELEASE_DOWNLOAD_BASE =
  'https://github.com/WodenWang820118/desktop-tracker-suite/releases/latest/download';

test('grid selector parsing accepts supported frontend and backend ids', () => {
  assert.equal(parseGridFrontend('ng'), 'ng');
  assert.equal(parseGridFrontend(' React '), 'react');
  assert.equal(parseGridFrontend('VUE'), 'vue');

  assert.equal(parseGridBackend('nest'), 'nest');
  assert.equal(parseGridBackend(' Express '), 'express');
  assert.equal(parseGridBackend('SPRING-NATIVE'), 'spring-native');
});

test('grid selector parsing rejects missing or unsupported ids', () => {
  assert.throws(
    () => parseGridFrontend(undefined),
    /TAURI_GRID_FRONTEND is required/u,
  );
  assert.throws(
    () => parseGridFrontend(''),
    /TAURI_GRID_FRONTEND is required/u,
  );
  assert.throws(
    () => parseGridFrontend('  '),
    /TAURI_GRID_FRONTEND is required/u,
  );
  assert.throws(
    () => parseGridFrontend('svelte'),
    /Unsupported TAURI_GRID_FRONTEND/u,
  );
  assert.throws(
    () => parseGridBackend(undefined),
    /TAURI_GRID_BACKEND is required/u,
  );
  assert.throws(() => parseGridBackend(''), /TAURI_GRID_BACKEND is required/u);
  assert.throws(
    () => parseGridBackend('  '),
    /TAURI_GRID_BACKEND is required/u,
  );
  assert.throws(
    () => parseGridBackend('java'),
    /Unsupported TAURI_GRID_BACKEND/u,
  );
});

test('canonical ng-nest generated config preserves production identity and updater endpoint', () => {
  const config = buildGeneratedTauriConfig({
    backend: 'nest',
    frontend: 'ng',
    version: '1.4.2',
  });

  assert.equal(config.productName, 'Desktop Tracker Suite');
  assert.equal(config.identifier, 'com.wodenwang820118.tracker.tauri');
  assert.equal(
    config.$schema,
    '../../../node_modules/@tauri-apps/cli/config.schema.json',
  );
  assert.equal(config.build.frontendDist, '../../../dist/ng-tracker/browser');
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(config.bundle.externalBin, ['binaries/nest-backend']);
  assert.deepEqual(config.bundle.resources, {
    '../../../dist/tauri-shell-nest-sidecar/resources/metadata': 'metadata',
  });
  assert.deepEqual(config.bundle.icon, [
    'icons/32x32.png',
    'icons/128x128.png',
    'icons/128x128@2x.png',
    'icons/icon.icns',
    'icons/icon.ico',
  ]);
  assert.deepEqual(config.plugins.updater.endpoints, [
    'https://github.com/WodenWang820118/desktop-tracker-suite/releases/latest/download/latest.json',
  ]);
});

test('generated config includes updater public key when provided', () => {
  const config = buildGeneratedTauriConfig({
    backend: 'express',
    frontend: 'react',
    updaterPubkey: '  public-key-content  ',
    version: '1.4.2',
  });

  assert.equal(config.plugins.updater.pubkey, 'public-key-content');
});

test('generated config omits blank updater public key', () => {
  const config = buildGeneratedTauriConfig({
    backend: 'express',
    frontend: 'react',
    updaterPubkey: '  ',
    version: '1.4.2',
  });

  assert.equal(Object.hasOwn(config.plugins.updater, 'pubkey'), false);
});

test('written generated config uses updater public key from environment', async () => {
  const selection = { backend: 'express', frontend: 'vue' } as const;
  const configPath = getGeneratedConfigPath(selection);
  const previousPubkey = process.env.TAURI_UPDATER_PUBKEY;
  let previousContents: string | undefined;

  try {
    previousContents = await readFile(configPath, 'utf8');
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    process.env.TAURI_UPDATER_PUBKEY = '  env-public-key  ';
    const withPubkey = await writeGeneratedTauriConfig({
      ...selection,
      version: '1.4.2',
    });
    assert.equal(withPubkey.config.plugins.updater.pubkey, 'env-public-key');
    assert.equal(
      (await readWrittenUpdater(configPath)).pubkey,
      'env-public-key',
    );

    process.env.TAURI_UPDATER_PUBKEY = 'env-public-key';
    const withExplicitPubkey = await writeGeneratedTauriConfig({
      ...selection,
      updaterPubkey: '  explicit-public-key  ',
      version: '1.4.2',
    });
    assert.equal(
      withExplicitPubkey.config.plugins.updater.pubkey,
      'explicit-public-key',
    );
    assert.equal(
      (await readWrittenUpdater(configPath)).pubkey,
      'explicit-public-key',
    );

    process.env.TAURI_UPDATER_PUBKEY = '  ';
    const withoutPubkey = await writeGeneratedTauriConfig({
      ...selection,
      version: '1.4.2',
    });
    assert.equal(
      Object.hasOwn(withoutPubkey.config.plugins.updater, 'pubkey'),
      false,
    );
    assert.equal(
      Object.hasOwn(await readWrittenUpdater(configPath), 'pubkey'),
      false,
    );

    process.env.TAURI_UPDATER_PUBKEY = '';
    const withoutEmptyPubkey = await writeGeneratedTauriConfig({
      ...selection,
      version: '1.4.2',
    });
    assert.equal(
      Object.hasOwn(withoutEmptyPubkey.config.plugins.updater, 'pubkey'),
      false,
    );
    assert.equal(
      Object.hasOwn(await readWrittenUpdater(configPath), 'pubkey'),
      false,
    );

    delete process.env.TAURI_UPDATER_PUBKEY;
    const withoutEnvPubkey = await writeGeneratedTauriConfig({
      ...selection,
      version: '1.4.2',
    });
    assert.equal(
      Object.hasOwn(withoutEnvPubkey.config.plugins.updater, 'pubkey'),
      false,
    );
    assert.equal(
      Object.hasOwn(await readWrittenUpdater(configPath), 'pubkey'),
      false,
    );
  } finally {
    if (previousPubkey === undefined) {
      delete process.env.TAURI_UPDATER_PUBKEY;
    } else {
      process.env.TAURI_UPDATER_PUBKEY = previousPubkey;
    }

    if (previousContents === undefined) {
      await rm(configPath, { force: true });
    } else {
      await writeFile(configPath, previousContents);
    }
  }
});

test('ng-spring-native preserves the legacy PoC identity and adds variant updater behavior', () => {
  const config = buildGeneratedTauriConfig({
    backend: 'spring-native',
    frontend: 'ng',
    version: '1.4.2',
  });

  assert.equal(config.productName, 'Desktop Tracker Suite Spring Native PoC');
  assert.equal(
    config.identifier,
    'com.wodenwang820118.tracker.tauri.springnative',
  );
  assert.equal(
    config.$schema,
    '../../../node_modules/@tauri-apps/cli/config.schema.json',
  );
  assert.equal(config.build.frontendDist, '../../../dist/ng-tracker/browser');
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(config.bundle.externalBin, ['binaries/spring-backend']);
  assert.deepEqual(config.bundle.resources, {
    '../../../dist/tauri-shell-spring-native/resources/spring-native':
      'spring-native',
    '../../../dist/tauri-shell-spring-native/resources/metadata': 'metadata',
  });
  assert.deepEqual(config.plugins.updater.endpoints, [
    'https://github.com/WodenWang820118/desktop-tracker-suite/releases/latest/download/latest-ng-spring-native.json',
  ]);
});

test('generated grid configs cover all frontend dist paths and backend runtime resources', () => {
  const expectedFrontendDist = {
    ng: '../../../dist/ng-tracker/browser',
    react: '../../../dist/react-tracker',
    vue: '../../../dist/vue-tracker',
  } as const;
  const expectedExternalBin = {
    express: ['binaries/express-backend'],
    nest: ['binaries/nest-backend'],
    'spring-native': ['binaries/spring-backend'],
  } as const;
  const expectedResources = {
    express: {
      '../../../dist/tauri-shell-express-sidecar/resources/metadata':
        'metadata',
    },
    nest: {
      '../../../dist/tauri-shell-nest-sidecar/resources/metadata': 'metadata',
    },
    'spring-native': {
      '../../../dist/tauri-shell-spring-native/resources/spring-native':
        'spring-native',
      '../../../dist/tauri-shell-spring-native/resources/metadata': 'metadata',
    },
  } as const;
  const expectedResolvedFrontendDist = {
    ng: join(WORKSPACE_ROOT, 'dist', 'ng-tracker', 'browser'),
    react: join(WORKSPACE_ROOT, 'dist', 'react-tracker'),
    vue: join(WORKSPACE_ROOT, 'dist', 'vue-tracker'),
  } as const;

  for (const frontend of GRID_FRONTENDS) {
    for (const backend of GRID_BACKENDS) {
      const config = buildGeneratedTauriConfig({
        backend,
        frontend,
        version: '1.4.2',
      });

      assert.equal(
        config.$schema,
        '../../../node_modules/@tauri-apps/cli/config.schema.json',
      );
      assert.equal(config.build.frontendDist, expectedFrontendDist[frontend]);
      assert.equal(
        resolve(TAURI_SRC_TAURI_ROOT, config.build.frontendDist),
        expectedResolvedFrontendDist[frontend],
      );
      assert.equal(config.bundle.createUpdaterArtifacts, true);
      assert.equal(Object.hasOwn(config.bundle, 'windows'), false);
      assert.deepEqual(config.bundle.externalBin, expectedExternalBin[backend]);
      assert.deepEqual(config.bundle.resources, expectedResources[backend]);
      for (const resourcePath of Object.keys(config.bundle.resources)) {
        const resolvedResourcePath = resolve(
          TAURI_SRC_TAURI_ROOT,
          resourcePath,
        );
        assert.equal(isWorkspacePath(resolvedResourcePath), true);
        assert.equal(
          relative(WORKSPACE_ROOT, resolvedResourcePath).split(/[\\/]/u)[0],
          'dist',
        );
      }
      assert.equal(
        config.plugins.updater.endpoints[0],
        `${RELEASE_DOWNLOAD_BASE}/${
          frontend === 'ng' && backend === 'nest'
            ? 'latest.json'
            : getUpdaterManifestFileName({ backend, frontend })
        }`,
      );
      assert.equal(Object.hasOwn(config.plugins.updater, 'pubkey'), false);
    }
  }
});

test('non-canonical identifiers and product names are stable', () => {
  assert.equal(
    resolveIdentifier({ backend: 'express', frontend: 'react' }),
    'com.wodenwang820118.tracker.tauri.react.express',
  );
  assert.equal(
    resolveIdentifier({ backend: 'spring-native', frontend: 'vue' }),
    'com.wodenwang820118.tracker.tauri.vue.springnative',
  );
  assert.equal(
    resolveProductName({ backend: 'express', frontend: 'react' }),
    'Desktop Tracker Suite React Express',
  );
});

function isWorkspacePath(path: string): boolean {
  const relativePath = relative(WORKSPACE_ROOT, path);
  return (
    relativePath !== '..' &&
    !relativePath.startsWith(`..\\`) &&
    !relativePath.startsWith('../')
  );
}

async function readWrittenUpdater(
  configPath: string,
): Promise<{ pubkey?: string }> {
  const writtenConfig = JSON.parse(await readFile(configPath, 'utf8')) as {
    plugins?: { updater?: { pubkey?: string } };
  };
  assert.ok(writtenConfig.plugins?.updater, 'Expected plugins.updater');
  return writtenConfig.plugins.updater;
}
