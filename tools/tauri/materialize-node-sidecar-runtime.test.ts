import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDesktopRuntimeMetadata,
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
