import assert from 'node:assert/strict';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

import {
  GRID_BACKENDS,
  GRID_FRONTENDS,
  buildGeneratedTauriConfig,
  getUpdaterManifestFileName,
  parseGridBackend,
  parseGridFrontend,
  resolveIdentifier,
  resolveProductName,
} from './grid.ts';
import { TAURI_SRC_TAURI_ROOT, WORKSPACE_ROOT } from './common.ts';

const RELEASE_DOWNLOAD_BASE =
  'https://github.com/WodenWang820118/nx-electron/releases/latest/download';

test('grid selector parsing accepts supported frontend and backend ids', () => {
  assert.equal(parseGridFrontend('ng'), 'ng');
  assert.equal(parseGridFrontend(' React '), 'react');
  assert.equal(parseGridFrontend('VUE'), 'vue');

  assert.equal(parseGridBackend('nest'), 'nest');
  assert.equal(parseGridBackend(' Express '), 'express');
  assert.equal(parseGridBackend('SPRING-NATIVE'), 'spring-native');
});

test('grid selector parsing rejects missing or unsupported ids', () => {
  assert.throws(() => parseGridFrontend(undefined), /TAURI_GRID_FRONTEND is required/u);
  assert.throws(() => parseGridFrontend(''), /TAURI_GRID_FRONTEND is required/u);
  assert.throws(() => parseGridFrontend('  '), /TAURI_GRID_FRONTEND is required/u);
  assert.throws(() => parseGridFrontend('svelte'), /Unsupported TAURI_GRID_FRONTEND/u);
  assert.throws(() => parseGridBackend(undefined), /TAURI_GRID_BACKEND is required/u);
  assert.throws(() => parseGridBackend(''), /TAURI_GRID_BACKEND is required/u);
  assert.throws(() => parseGridBackend('  '), /TAURI_GRID_BACKEND is required/u);
  assert.throws(() => parseGridBackend('java'), /Unsupported TAURI_GRID_BACKEND/u);
});

test('canonical ng-nest generated config preserves production identity and updater endpoint', () => {
  const config = buildGeneratedTauriConfig({
    backend: 'nest',
    frontend: 'ng',
    version: '1.4.2',
  });

  assert.equal(config.productName, 'Desktop Tracker Suite');
  assert.equal(config.identifier, 'com.wodenwang820118.tracker.tauri');
  assert.equal(config.$schema, '../../../node_modules/@tauri-apps/cli/config.schema.json');
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
    'https://github.com/WodenWang820118/nx-electron/releases/latest/download/latest.json',
  ]);
});

test('ng-spring-native preserves the legacy PoC identity and adds variant updater behavior', () => {
  const config = buildGeneratedTauriConfig({
    backend: 'spring-native',
    frontend: 'ng',
    version: '1.4.2',
  });

  assert.equal(config.productName, 'Desktop Tracker Suite Spring Native PoC');
  assert.equal(config.identifier, 'com.wodenwang820118.tracker.tauri.springnative');
  assert.equal(config.$schema, '../../../node_modules/@tauri-apps/cli/config.schema.json');
  assert.equal(config.build.frontendDist, '../../../dist/ng-tracker/browser');
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(config.bundle.externalBin, ['binaries/spring-backend']);
  assert.deepEqual(config.bundle.resources, {
    '../../../dist/tauri-shell-spring-native/resources/spring-native': 'spring-native',
    '../../../dist/tauri-shell-spring-native/resources/metadata': 'metadata',
  });
  assert.deepEqual(config.plugins.updater.endpoints, [
    'https://github.com/WodenWang820118/nx-electron/releases/latest/download/latest-ng-spring-native.json',
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
      '../../../dist/tauri-shell-express-sidecar/resources/metadata': 'metadata',
    },
    nest: {
      '../../../dist/tauri-shell-nest-sidecar/resources/metadata': 'metadata',
    },
    'spring-native': {
      '../../../dist/tauri-shell-spring-native/resources/spring-native': 'spring-native',
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
      const config = buildGeneratedTauriConfig({ backend, frontend, version: '1.4.2' });

      assert.equal(config.$schema, '../../../node_modules/@tauri-apps/cli/config.schema.json');
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
        const resolvedResourcePath = resolve(TAURI_SRC_TAURI_ROOT, resourcePath);
        assert.equal(isWorkspacePath(resolvedResourcePath), true);
        assert.equal(relative(WORKSPACE_ROOT, resolvedResourcePath).split(/[\\/]/u)[0], 'dist');
      }
      assert.equal(
        config.plugins.updater.endpoints[0],
        `${RELEASE_DOWNLOAD_BASE}/${
          frontend === 'ng' && backend === 'nest'
            ? 'latest.json'
            : getUpdaterManifestFileName({ backend, frontend })
        }`,
      );
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
  return relativePath !== '..' && !relativePath.startsWith(`..\\`) && !relativePath.startsWith('../');
}
