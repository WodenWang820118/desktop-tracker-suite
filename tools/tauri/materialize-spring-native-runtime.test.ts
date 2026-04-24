import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDesktopRuntimeMetadata,
  buildSpringNativeExecutableFileName,
  listSpringNativeCompanionFiles,
} from './materialize-spring-native-runtime.ts';
import { getTauriSidecarBinaryFileName } from './common.ts';
import { resolveDesktopTargetInfo } from './runtime-target.ts';

test('buildDesktopRuntimeMetadata records the Spring sidecar manifest fields', () => {
  assert.deepEqual(buildDesktopRuntimeMetadata({ profile: 'windows-x64' }), {
    backendDirectory: 'spring-native',
    backendKind: 'spring-native',
    databaseFileName: 'database.sqlite3',
    desktopTarget: 'windows-x64',
    logFileName: 'backend-runtime.log',
    runtimeMode: 'sidecar',
    sidecarName: 'spring-backend',
  });
});

test('getTauriSidecarBinaryFileName adds the target triple suffix for Windows builds', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'windows-x64',
  });

  assert.equal(
    getTauriSidecarBinaryFileName('spring-backend', target),
    'spring-backend-x86_64-pc-windows-msvc.exe',
  );
});

test('buildSpringNativeExecutableFileName keeps the Windows source executable extension', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'windows-x64',
  });

  assert.equal(buildSpringNativeExecutableFileName(target), 'spring-backend.exe');
});

test('buildSpringNativeExecutableFileName omits the executable extension on Linux', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'linux-x64',
  });

  assert.equal(buildSpringNativeExecutableFileName(target), 'spring-backend');
});

test('buildSpringNativeExecutableFileName omits the executable extension on macOS', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'darwin-arm64',
  });

  assert.equal(buildSpringNativeExecutableFileName(target), 'spring-backend');
});

test('getTauriSidecarBinaryFileName omits the extension for Linux sidecars', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'linux-x64',
  });

  assert.equal(
    getTauriSidecarBinaryFileName('spring-backend', target),
    'spring-backend-x86_64-unknown-linux-gnu',
  );
});

test('getTauriSidecarBinaryFileName omits the extension for macOS sidecars', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'darwin-arm64',
  });

  assert.equal(
    getTauriSidecarBinaryFileName('spring-backend', target),
    'spring-backend-aarch64-apple-darwin',
  );
});

test('listSpringNativeCompanionFiles ignores directories and excludes the executable itself', () => {
  assert.deepEqual(
    listSpringNativeCompanionFiles(
      [
        {
          name: 'spring-backend.exe',
          isFile: () => true,
        },
        {
          name: 'sqlitejdbc.dll',
          isFile: () => true,
        },
        {
          name: 'nested',
          isFile: () => false,
        },
      ],
      'spring-backend.exe',
    ),
    ['sqlitejdbc.dll'],
  );
});
