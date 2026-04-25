import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNodeSidecarCacheKey,
  buildNodeSidecarCacheManifest,
  buildDesktopRuntimeMetadata,
  type NodeSidecarCacheKeyInput,
  resolveNodeSidecarRuntimeDefinition,
} from './materialize-node-sidecar-runtime.ts';
import {
  buildNodeSidecarPackageJson,
  buildNodeSidecarPkgConfig,
} from './node-backend-packaging.ts';

test('buildDesktopRuntimeMetadata records the Nest sidecar manifest fields', () => {
  assert.deepEqual(
    buildDesktopRuntimeMetadata({
      backendKind: 'nest-node',
      profile: 'windows-x64',
      sidecarName: 'nest-backend',
    }),
    {
      backendKind: 'nest-node',
      databaseFileName: 'database.sqlite3',
      desktopTarget: 'windows-x64',
      logFileName: 'backend-runtime.log',
      runtimeMode: 'sidecar',
      sidecarName: 'nest-backend',
    },
  );
});

test('buildDesktopRuntimeMetadata records the Express sidecar manifest fields', () => {
  assert.deepEqual(
    buildDesktopRuntimeMetadata({
      backendKind: 'express-node',
      profile: 'linux-x64',
      sidecarName: 'express-backend',
    }),
    {
      backendKind: 'express-node',
      databaseFileName: 'database.sqlite3',
      desktopTarget: 'linux-x64',
      logFileName: 'backend-runtime.log',
      runtimeMode: 'sidecar',
      sidecarName: 'express-backend',
    },
  );
});

test('resolveNodeSidecarRuntimeDefinition maps Nest to the default sidecar name', () => {
  assert.equal(resolveNodeSidecarRuntimeDefinition('nest').sidecarName, 'nest-backend');
});

test('resolveNodeSidecarRuntimeDefinition maps Express to the alternate sidecar name', () => {
  assert.equal(
    resolveNodeSidecarRuntimeDefinition('express').sidecarName,
    'express-backend',
  );
});

test('buildNodeSidecarCacheKey is deterministic for object key order', () => {
  const input = buildCacheKeyInput();

  assert.equal(
    buildNodeSidecarCacheKey({
      ...input,
      installEnvironment: {
        npm_config_node_linker: 'hoisted',
        CI: 'true',
        npm_config_confirm_modules_purge: 'false',
      },
    }),
    buildNodeSidecarCacheKey(input),
  );
});

test('buildNodeSidecarCacheKey changes when lockfile hash changes', () => {
  const input = buildCacheKeyInput();

  assert.notEqual(
    buildNodeSidecarCacheKey({
      ...input,
      pnpmLockHash: 'next-lock-hash',
    }),
    buildNodeSidecarCacheKey(input),
  );
});

test('buildNodeSidecarCacheKey changes when backend dist hash changes', () => {
  const input = buildCacheKeyInput();

  assert.notEqual(
    buildNodeSidecarCacheKey({
      ...input,
      backendDistHash: 'next-backend-dist-hash',
    }),
    buildNodeSidecarCacheKey(input),
  );
});

test('buildNodeSidecarCacheKey changes when generated package json changes', () => {
  const input = buildCacheKeyInput();

  assert.notEqual(
    buildNodeSidecarCacheKey({
      ...input,
      packagedPackageJson: {
        ...(input.packagedPackageJson as Record<string, unknown>),
        dependencies: {
          sqlite3: '5.1.7',
          typeorm: '0.3.29',
        },
      },
    }),
    buildNodeSidecarCacheKey(input),
  );
});

test('buildNodeSidecarCacheKey changes when install environment changes', () => {
  const input = buildCacheKeyInput();

  assert.notEqual(
    buildNodeSidecarCacheKey({
      ...input,
      installEnvironment: {
        ...input.installEnvironment,
        npm_config_node_linker: 'isolated',
      },
    }),
    buildNodeSidecarCacheKey(input),
  );
});

test('buildNodeSidecarCacheKey changes when package environment changes', () => {
  const input = buildCacheKeyInput();

  assert.notEqual(
    buildNodeSidecarCacheKey({
      ...input,
      pkgEnvironment: {
        ...input.pkgEnvironment,
        CI: 'false',
      },
    }),
    buildNodeSidecarCacheKey(input),
  );
});

test('buildNodeSidecarCacheKey changes when target or tooling inputs change', () => {
  const input = buildCacheKeyInput();
  const baselineKey = buildNodeSidecarCacheKey(input);

  for (const changedInput of [
    { ...input, cacheSchemaVersion: 2 },
    { ...input, pkgVersion: '6.18.3' },
    { ...input, processArch: 'arm64' },
    { ...input, processPlatform: 'darwin' },
    { ...input, profile: 'darwin-arm64' },
    { ...input, rustTarget: 'aarch64-apple-darwin' },
  ]) {
    assert.notEqual(buildNodeSidecarCacheKey(changedInput), baselineKey);
  }
});

test('buildNodeSidecarCacheManifest records the cache key and executable path', () => {
  assert.deepEqual(
    buildNodeSidecarCacheManifest({
      cacheKey: 'cache-key',
      packagedSidecarPath: 'stage/sidecar-build/nest-backend.exe',
    }),
    {
      cacheKey: 'cache-key',
      packagedSidecarPath: 'stage/sidecar-build/nest-backend.exe',
      schemaVersion: 1,
    },
  );
});

test('buildNodeSidecarPackageJson adds pkg metadata and sqlite3 to the runtime package', () => {
  const packagedJson = buildNodeSidecarPackageJson({
    backendPackageJson: {
      dependencies: {
        typeorm: '0.3.28',
      },
      main: 'main.js',
      version: '0.0.1',
    },
    packageManager: 'pnpm@10.28.2',
    sidecarName: 'nest-backend',
    sqliteVersion: '5.1.7',
  });

  assert.equal(packagedJson.bin, 'main.js');
  assert.equal(packagedJson.name, 'nest-backend');
  assert.equal(packagedJson.private, true);
  assert.equal(packagedJson.packageManager, 'pnpm@10.28.2');
  assert.deepEqual(packagedJson.dependencies, {
    sqlite3: '5.1.7',
    typeorm: '0.3.28',
  });
  assert.deepEqual(packagedJson.pkg, buildNodeSidecarPkgConfig());
});

test('buildNodeSidecarPkgConfig includes scripts, json assets, and native addons', () => {
  assert.deepEqual(buildNodeSidecarPkgConfig(), {
    assets: ['assets/**/*', 'node_modules/**/*.json', 'node_modules/**/*.node'],
    ignore: [
      'node_modules/.bin/**/*',
      'node_modules/**/.eslintrc*',
      'node_modules/**/bench/**/*',
      'node_modules/**/benchmark/**/*',
      'node_modules/**/CHANGELOG*',
      'node_modules/**/docs/**/*',
      'node_modules/**/example/**/*',
      'node_modules/**/examples/**/*',
      'node_modules/**/LICENSE*',
      'node_modules/**/README*',
      'node_modules/**/test/**/*',
      'node_modules/**/tests/**/*',
      'node_modules/**/*.d.ts',
      'sidecar-build/**/*',
    ],
    scripts: ['node_modules/**/*.js'],
  });
});

function buildCacheKeyInput(): NodeSidecarCacheKeyInput {
  return {
    backendDistHash: 'backend-dist-hash',
    backendKind: 'nest-node',
    cacheSchemaVersion: 1,
    installEnvironment: {
      CI: 'true',
      npm_config_confirm_modules_purge: 'false',
      npm_config_node_linker: 'hoisted',
    },
    packageManager: 'pnpm@10.28.2',
    packagedPackageJson: {
      bin: 'main.js',
      dependencies: {
        sqlite3: '5.1.7',
        typeorm: '0.3.28',
      },
      name: 'nest-backend',
    },
    pkgEnvironment: {
      CI: 'true',
    },
    pkgVersion: '6.18.2',
    pnpmLockHash: 'lock-hash',
    processArch: 'x64',
    processPlatform: 'win32',
    processVersion: 'v24.11.1',
    profile: 'windows-x64',
    rustTarget: 'x86_64-pc-windows-msvc',
    sidecarName: 'nest-backend',
  };
}
