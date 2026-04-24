import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import { NODE_VERSION } from './common.ts';
import {
  assertHostCanBuildDesktopTarget,
  type DesktopTargetProfile,
  getHostDesktopTargetProfile,
  resolveDesktopTargetInfo,
} from './runtime-target.ts';

function getCurrentHostDesktopTargetProfileOrSkip(
  testContext: TestContext,
): DesktopTargetProfile | undefined {
  try {
    return getHostDesktopTargetProfile();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    testContext.skip(`Current host is outside the supported desktop matrix: ${message}`);
    return undefined;
  }
}

test('resolveDesktopTargetInfo uses TAURI_DESKTOP_TARGET when provided', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'linux-x64',
  });

  assert.equal(target.profile, 'linux-x64');
  assert.equal(target.rustTarget, 'x86_64-unknown-linux-gnu');
  assert.equal(target.hostPlatform, 'linux');
  assert.equal(target.hostArch, 'x64');
  assert.equal(target.nodeBinaryName, 'node');
  assert.equal(target.nodeDistributionPath, `node-v${NODE_VERSION}-linux-x64.tar.gz`);
  assert.equal(target.nodeArchiveFileName, `node-v${NODE_VERSION}-linux-x64.tar.gz`);
  assert.equal(target.nodeArchiveEntryPath, `node-v${NODE_VERSION}-linux-x64/bin/node`);
  assert.equal(target.nodeCacheFileName, `node-v${NODE_VERSION}-linux-x64`);
});

test('resolveDesktopTargetInfo maps Rust target triples back to desktop profiles', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_BUILD_TARGET: 'aarch64-apple-darwin',
  });

  assert.equal(target.profile, 'darwin-arm64');
  assert.equal(target.rustTarget, 'aarch64-apple-darwin');
  assert.equal(target.hostPlatform, 'darwin');
  assert.equal(target.hostArch, 'arm64');
  assert.equal(target.nodeBinaryName, 'node');
  assert.equal(target.nodeDistributionPath, `node-v${NODE_VERSION}-darwin-arm64.tar.gz`);
  assert.equal(target.nodeArchiveFileName, `node-v${NODE_VERSION}-darwin-arm64.tar.gz`);
  assert.equal(target.nodeArchiveEntryPath, `node-v${NODE_VERSION}-darwin-arm64/bin/node`);
  assert.equal(target.nodeCacheFileName, `node-v${NODE_VERSION}-darwin-arm64`);
});

test('resolveDesktopTargetInfo resolves the full darwin-arm64 target record from TAURI_DESKTOP_TARGET', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'darwin-arm64',
  });

  assert.equal(target.profile, 'darwin-arm64');
  assert.equal(target.rustTarget, 'aarch64-apple-darwin');
  assert.equal(target.hostPlatform, 'darwin');
  assert.equal(target.hostArch, 'arm64');
  assert.equal(target.nodeBinaryName, 'node');
  assert.equal(target.nodeDistributionPath, `node-v${NODE_VERSION}-darwin-arm64.tar.gz`);
  assert.equal(target.nodeArchiveFileName, `node-v${NODE_VERSION}-darwin-arm64.tar.gz`);
  assert.equal(target.nodeArchiveEntryPath, `node-v${NODE_VERSION}-darwin-arm64/bin/node`);
  assert.equal(target.nodeCacheFileName, `node-v${NODE_VERSION}-darwin-arm64`);
});

test('resolveDesktopTargetInfo resolves the full windows-x64 target record', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'windows-x64',
  });

  assert.equal(target.profile, 'windows-x64');
  assert.equal(target.rustTarget, 'x86_64-pc-windows-msvc');
  assert.equal(target.hostPlatform, 'win32');
  assert.equal(target.hostArch, 'x64');
  assert.equal(target.nodeBinaryName, 'node.exe');
  assert.equal(target.nodeDistributionPath, 'win-x64/node.exe');
  assert.equal(target.nodeArchiveFileName, null);
  assert.equal(target.nodeArchiveEntryPath, null);
  assert.equal(target.nodeCacheFileName, `node-v${NODE_VERSION}-win-x64.exe`);
});

test('resolveDesktopTargetInfo falls back to the current host profile when no env overrides are set', (t) => {
  const currentHostProfile = getCurrentHostDesktopTargetProfileOrSkip(t);
  if (!currentHostProfile) {
    return;
  }
  const target = resolveDesktopTargetInfo({});
  const explicitHostTarget = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: currentHostProfile,
  });

  assert.equal(target.profile, currentHostProfile);
  assert.equal(target.rustTarget, explicitHostTarget.rustTarget);
  assert.equal(target.nodeBinaryName, explicitHostTarget.nodeBinaryName);
});

test('resolveDesktopTargetInfo rejects mismatched profile and Rust target inputs', () => {
  assert.throws(
    () =>
      resolveDesktopTargetInfo({
        TAURI_DESKTOP_TARGET: 'windows-x64',
        TAURI_BUILD_TARGET: 'x86_64-unknown-linux-gnu',
      }),
    /TAURI_DESKTOP_TARGET \(windows-x64\) does not match the requested Rust target \(x86_64-unknown-linux-gnu\)/u,
  );
});

test('resolveDesktopTargetInfo rejects mismatched profile and TAURI_RUST_TARGET inputs', () => {
  assert.throws(
    () =>
      resolveDesktopTargetInfo({
        TAURI_DESKTOP_TARGET: 'windows-x64',
        TAURI_RUST_TARGET: 'x86_64-unknown-linux-gnu',
      }),
    /TAURI_DESKTOP_TARGET \(windows-x64\) does not match the requested Rust target \(x86_64-unknown-linux-gnu\)/u,
  );
});

test('resolveDesktopTargetInfo rejects mismatched profile and CARGO_BUILD_TARGET inputs', () => {
  assert.throws(
    () =>
      resolveDesktopTargetInfo({
        TAURI_DESKTOP_TARGET: 'windows-x64',
        CARGO_BUILD_TARGET: 'x86_64-unknown-linux-gnu',
      }),
    /TAURI_DESKTOP_TARGET \(windows-x64\) does not match the requested Rust target \(x86_64-unknown-linux-gnu\)/u,
  );
});

test('resolveDesktopTargetInfo accepts consistent profile and Rust target inputs', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'windows-x64',
    TAURI_BUILD_TARGET: 'x86_64-pc-windows-msvc',
  });

  assert.equal(target.profile, 'windows-x64');
});

test('resolveDesktopTargetInfo accepts consistent profile and TAURI_RUST_TARGET inputs', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'linux-x64',
    TAURI_RUST_TARGET: 'x86_64-unknown-linux-gnu',
  });

  assert.equal(target.profile, 'linux-x64');
});

test('resolveDesktopTargetInfo accepts consistent profile and CARGO_BUILD_TARGET inputs', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'darwin-arm64',
    CARGO_BUILD_TARGET: 'aarch64-apple-darwin',
  });

  assert.equal(target.profile, 'darwin-arm64');
});

test('resolveDesktopTargetInfo rejects unsupported Rust target triples', () => {
  assert.throws(
    () =>
      resolveDesktopTargetInfo({
        TAURI_BUILD_TARGET: 'wasm32-unknown-unknown',
      }),
    /Unsupported Rust target triple/u,
  );
});

test('resolveDesktopTargetInfo rejects unsupported desktop target values', () => {
  assert.throws(
    () =>
      resolveDesktopTargetInfo({
        TAURI_DESKTOP_TARGET: 'linux-arm64',
      }),
    /Unsupported TAURI_DESKTOP_TARGET/u,
  );
});

test('resolveDesktopTargetInfo honors TAURI_RUST_TARGET aliases', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_RUST_TARGET: 'x86_64-unknown-linux-gnu',
  });

  assert.equal(target.profile, 'linux-x64');
});

test('resolveDesktopTargetInfo treats whitespace Rust target aliases as unset', (t) => {
  const currentHostProfile = getCurrentHostDesktopTargetProfileOrSkip(t);
  if (!currentHostProfile) {
    return;
  }
  const target = resolveDesktopTargetInfo({
    TAURI_BUILD_TARGET: '   ',
  });

  assert.equal(target.profile, currentHostProfile);
});

test('resolveDesktopTargetInfo honors CARGO_BUILD_TARGET aliases', () => {
  const target = resolveDesktopTargetInfo({
    CARGO_BUILD_TARGET: 'x86_64-pc-windows-msvc',
  });

  assert.equal(target.profile, 'windows-x64');
});

test('resolveDesktopTargetInfo treats whitespace TAURI_RUST_TARGET values as unset', (t) => {
  const currentHostProfile = getCurrentHostDesktopTargetProfileOrSkip(t);
  if (!currentHostProfile) {
    return;
  }
  const target = resolveDesktopTargetInfo({
    TAURI_RUST_TARGET: '   ',
  });

  assert.equal(target.profile, currentHostProfile);
});

test('resolveDesktopTargetInfo treats whitespace CARGO_BUILD_TARGET values as unset', (t) => {
  const currentHostProfile = getCurrentHostDesktopTargetProfileOrSkip(t);
  if (!currentHostProfile) {
    return;
  }
  const target = resolveDesktopTargetInfo({
    CARGO_BUILD_TARGET: '   ',
  });

  assert.equal(target.profile, currentHostProfile);
});

test('resolveDesktopTargetInfo prefers TAURI_BUILD_TARGET over TAURI_RUST_TARGET', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_BUILD_TARGET: 'x86_64-unknown-linux-gnu',
    TAURI_RUST_TARGET: 'aarch64-apple-darwin',
  });

  assert.equal(target.profile, 'linux-x64');
});

test('resolveDesktopTargetInfo ignores whitespace TAURI_BUILD_TARGET and falls back to TAURI_RUST_TARGET', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_BUILD_TARGET: '   ',
    TAURI_RUST_TARGET: 'aarch64-apple-darwin',
  });

  assert.equal(target.profile, 'darwin-arm64');
});

test('resolveDesktopTargetInfo ignores whitespace TAURI_BUILD_TARGET and TAURI_RUST_TARGET before using CARGO_BUILD_TARGET', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_BUILD_TARGET: '   ',
    TAURI_RUST_TARGET: '   ',
    CARGO_BUILD_TARGET: 'x86_64-pc-windows-msvc',
  });

  assert.equal(target.profile, 'windows-x64');
});

test('resolveDesktopTargetInfo prefers TAURI_RUST_TARGET over CARGO_BUILD_TARGET', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_RUST_TARGET: 'aarch64-apple-darwin',
    CARGO_BUILD_TARGET: 'x86_64-pc-windows-msvc',
  });

  assert.equal(target.profile, 'darwin-arm64');
});

test('resolveDesktopTargetInfo prefers TAURI_BUILD_TARGET over CARGO_BUILD_TARGET', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_BUILD_TARGET: 'x86_64-unknown-linux-gnu',
    CARGO_BUILD_TARGET: 'x86_64-pc-windows-msvc',
  });

  assert.equal(target.profile, 'linux-x64');
});

test('resolveDesktopTargetInfo prefers TAURI_BUILD_TARGET when all Rust target env vars are set', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_BUILD_TARGET: 'x86_64-unknown-linux-gnu',
    TAURI_RUST_TARGET: 'aarch64-apple-darwin',
    CARGO_BUILD_TARGET: 'x86_64-pc-windows-msvc',
  });

  assert.equal(target.profile, 'linux-x64');
});

test('resolveDesktopTargetInfo accepts case-insensitive desktop target values', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'Windows-X64',
  });

  assert.equal(target.profile, 'windows-x64');
});

test('resolveDesktopTargetInfo trims surrounding whitespace from desktop target values', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: '  linux-x64  ',
  });

  assert.equal(target.profile, 'linux-x64');
});

test('resolveDesktopTargetInfo treats whitespace desktop targets as unset before honoring Rust targets', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: '   ',
    TAURI_BUILD_TARGET: 'aarch64-apple-darwin',
  });

  assert.equal(target.profile, 'darwin-arm64');
});

test('resolveDesktopTargetInfo treats uppercase Rust target triples as unsupported', () => {
  assert.throws(
    () =>
      resolveDesktopTargetInfo({
        TAURI_BUILD_TARGET: 'X86_64-UNKNOWN-LINUX-GNU',
      }),
    /Unsupported Rust target triple/u,
  );
});

test('resolveDesktopTargetInfo trims surrounding whitespace from Rust target values', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_BUILD_TARGET: '  aarch64-apple-darwin  ',
  });

  assert.equal(target.profile, 'darwin-arm64');
});

test('resolveDesktopTargetInfo treats whitespace desktop target values as unset', (t) => {
  const currentHostProfile = getCurrentHostDesktopTargetProfileOrSkip(t);
  if (!currentHostProfile) {
    return;
  }
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: '   ',
  });

  assert.equal(target.profile, currentHostProfile);
});

test('assertHostCanBuildDesktopTarget allows matching native hosts', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'linux-x64',
  });

  assert.doesNotThrow(() =>
    assertHostCanBuildDesktopTarget(target, 'linux', 'x64'),
  );
});

test('assertHostCanBuildDesktopTarget rejects mismatched native hosts', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'darwin-arm64',
  });

  assert.throws(
    () => assertHostCanBuildDesktopTarget(target, 'win32', 'x64'),
    /must be built on a matching native runner/u,
  );
});

test('assertHostCanBuildDesktopTarget allows matching darwin hosts', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'darwin-arm64',
  });

  assert.doesNotThrow(() =>
    assertHostCanBuildDesktopTarget(target, 'darwin', 'arm64'),
  );
});

test('assertHostCanBuildDesktopTarget allows matching windows hosts', () => {
  const target = resolveDesktopTargetInfo({
    TAURI_DESKTOP_TARGET: 'windows-x64',
  });

  assert.doesNotThrow(() =>
    assertHostCanBuildDesktopTarget(target, 'win32', 'x64'),
  );
});

test('getHostDesktopTargetProfile rejects unsupported hosts', () => {
  assert.throws(
    () => getHostDesktopTargetProfile('darwin', 'x64'),
    /Unsupported host platform/u,
  );
});

test('getHostDesktopTargetProfile resolves the supported windows host', () => {
  assert.equal(getHostDesktopTargetProfile('win32', 'x64'), 'windows-x64');
});

test('getHostDesktopTargetProfile resolves the supported linux host', () => {
  assert.equal(getHostDesktopTargetProfile('linux', 'x64'), 'linux-x64');
});

test('getHostDesktopTargetProfile resolves the supported darwin host', () => {
  assert.equal(getHostDesktopTargetProfile('darwin', 'arm64'), 'darwin-arm64');
});

test('getHostDesktopTargetProfile rejects unsupported windows arm64 hosts', () => {
  assert.throws(
    () => getHostDesktopTargetProfile('win32', 'arm64'),
    /Unsupported host platform/u,
  );
});

test('getHostDesktopTargetProfile rejects unsupported linux arm64 hosts', () => {
  assert.throws(
    () => getHostDesktopTargetProfile('linux', 'arm64'),
    /Unsupported host platform/u,
  );
});
