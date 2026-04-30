import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDesktopRuntimeMetadata,
  buildPackagedBackendPackageJson,
} from './materialize-backend-runtime.ts';

test('buildPackagedBackendPackageJson adds sqlite3 and preserves existing dependencies', () => {
  const packagedJson = buildPackagedBackendPackageJson({
    backendPackageJson: {
      dependencies: {
        '@nestjs/common': '11.1.12',
      },
    },
    packageManager: 'pnpm@11.0.1',
    sqliteVersion: '5.1.7',
  });

  assert.deepEqual(packagedJson, {
    dependencies: {
      '@nestjs/common': '11.1.12',
      sqlite3: '5.1.7',
    },
    packageManager: 'pnpm@11.0.1',
  });
});

test('buildPackagedBackendPackageJson handles missing dependencies object', () => {
  const packagedJson = buildPackagedBackendPackageJson({
    backendPackageJson: {},
    packageManager: 'pnpm@11.0.1',
    sqliteVersion: '5.1.7',
  });

  assert.deepEqual(packagedJson, {
    dependencies: {
      sqlite3: '5.1.7',
    },
    packageManager: 'pnpm@11.0.1',
  });
});

test('buildPackagedBackendPackageJson trims sqlite3 versions', () => {
  const packagedJson = buildPackagedBackendPackageJson({
    backendPackageJson: {},
    packageManager: 'pnpm@11.0.1',
    sqliteVersion: '  5.1.7  ',
  });

  assert.equal(packagedJson.dependencies.sqlite3, '5.1.7');
});

test('buildPackagedBackendPackageJson rejects missing sqlite3 versions', () => {
  assert.throws(
    () =>
      buildPackagedBackendPackageJson({
        backendPackageJson: {},
        packageManager: 'pnpm@11.0.1',
        sqliteVersion: '   ',
      }),
    /sqlite3 is missing from the installed workspace dependencies\./u,
  );
});

test('buildDesktopRuntimeMetadata records the packaged runtime target fields', () => {
  assert.deepEqual(
    buildDesktopRuntimeMetadata({
      profile: 'darwin-arm64',
      nodeBinaryName: 'node',
    }),
    {
      backendDirectory: 'backend-runtime',
      backendKind: 'nest-node',
      databaseFileName: 'database.sqlite3',
      desktopTarget: 'darwin-arm64',
      entryFile: 'main.js',
      logFileName: 'backend-runtime.log',
      nodeBinaryName: 'node',
      runtimeMode: 'resource',
    },
  );
});

test('buildDesktopRuntimeMetadata records the Windows node executable name', () => {
  assert.equal(
    buildDesktopRuntimeMetadata({
      profile: 'windows-x64',
      nodeBinaryName: 'node.exe',
    }).nodeBinaryName,
    'node.exe',
  );
});
