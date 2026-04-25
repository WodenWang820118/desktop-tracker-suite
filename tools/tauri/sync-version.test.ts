import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  syncDesktopVersionFiles,
  updateCargoPackageVersion,
} from './sync-version.ts';

test('updateCargoPackageVersion only updates the package section version', () => {
  const cargoManifest = [
    '[package]',
    'name = "tauri-shell"',
    'version = "0.1.0"',
    '',
    '[dependencies]',
    'some-crate = { version = "1" }',
    '',
  ].join('\n');

  const nextManifest = updateCargoPackageVersion(cargoManifest, '1.4.2');
  assert.match(nextManifest, /^\[package\][\s\S]*?version = "1\.4\.2"/mu);
  assert.doesNotMatch(nextManifest, /version = "0\.1\.0"/u);
  assert.match(nextManifest, /some-crate = \{ version = "1" \}/u);
});

test('updateCargoPackageVersion preserves CRLF line endings', () => {
  const cargoManifest = '[package]\r\nname = "tauri-shell"\r\nversion = "0.1.0"\r\n';

  const nextManifest = updateCargoPackageVersion(cargoManifest, '1.4.2');

  assert.match(nextManifest, /\r\n/u);
  assert.ok(!nextManifest.replace(/\r\n/gu, '').includes('\n'));
  assert.match(nextManifest, /version = "1\.4\.2"/u);
  assert.doesNotMatch(nextManifest, /version = "0\.1\.0"/u);
});

test('updateCargoPackageVersion preserves indentation on the version line', () => {
  const cargoManifest = '[package]\nname = "tauri-shell"\n  version = "0.1.0"\n';

  const nextManifest = updateCargoPackageVersion(cargoManifest, '1.4.2');

  assert.match(nextManifest, /\n {2}version = "1\.4\.2"\n/u);
  assert.doesNotMatch(nextManifest, /version = "0\.1\.0"/u);
});

test('updateCargoPackageVersion handles a package section that appears after other sections', () => {
  const cargoManifest = [
    '[workspace]',
    'members = ["apps/tauri-shell"]',
    '',
    '[package]',
    'name = "tauri-shell"',
    'version = "0.1.0"',
    '',
  ].join('\n');

  const nextManifest = updateCargoPackageVersion(cargoManifest, '1.4.2');

  assert.match(nextManifest, /\[package\][\s\S]*version = "1\.4\.2"/u);
  assert.doesNotMatch(nextManifest, /version = "0\.1\.0"/u);
});

test('updateCargoPackageVersion throws when the Cargo package section is missing a version', () => {
  assert.throws(
    () => updateCargoPackageVersion('[dependencies]\nanyhow = "1"\n', '1.4.2'),
    /missing a version field inside the \[package\] section/u,
  );
});

test('updateCargoPackageVersion throws when the package section has no version line', () => {
  assert.throws(
    () =>
      updateCargoPackageVersion(
        '[package]\nname = "tauri-shell"\n\n[dependencies]\nanyhow = "1"\n',
        '1.4.2',
      ),
    /missing a version field inside the \[package\] section/u,
  );
});

test('syncDesktopVersionFiles aligns tauri.conf.json and Cargo.toml to the workspace version', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ version: '9.8.7' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite', version: '0.0.1' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "0.0.1"', ''].join('\n'),
      'utf8',
    );

    const result = await syncDesktopVersionFiles({
      workspaceRoot,
      tauriSrcRoot,
    });

    assert.equal(result.version, '9.8.7');
    assert.deepEqual(result.changedFiles.sort(), [
      join(tauriSrcRoot, 'Cargo.toml'),
      join(tauriSrcRoot, 'tauri.conf.json'),
    ]);

    const syncedConfig = JSON.parse(
      await readFile(join(tauriSrcRoot, 'tauri.conf.json'), 'utf8'),
    ) as { version: string; productName: string };
    const syncedCargoManifest = await readFile(join(tauriSrcRoot, 'Cargo.toml'), 'utf8');

    assert.equal(syncedConfig.version, '9.8.7');
    assert.equal(syncedConfig.productName, 'Desktop Tracker Suite');
    assert.match(syncedCargoManifest, /version = "9\.8\.7"/u);
    assert.doesNotMatch(syncedCargoManifest, /version = "0\.0\.1"/u);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles is a no-op when versions are already aligned', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-noop-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ version: '1.4.2' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite', version: '1.4.2' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "1.4.2"', ''].join('\n'),
      'utf8',
    );

    const result = await syncDesktopVersionFiles({
      workspaceRoot,
      tauriSrcRoot,
    });

    assert.equal(result.version, '1.4.2');
    assert.deepEqual(result.changedFiles, []);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles reports only the stale file when a partial sync is needed', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-partial-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ version: '2.3.4' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite', version: '0.0.1' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "2.3.4"', ''].join('\n'),
      'utf8',
    );

    const result = await syncDesktopVersionFiles({
      workspaceRoot,
      tauriSrcRoot,
    });
    const syncedConfig = JSON.parse(
      await readFile(join(tauriSrcRoot, 'tauri.conf.json'), 'utf8'),
    ) as { version: string; productName: string };
    const syncedCargoManifest = await readFile(join(tauriSrcRoot, 'Cargo.toml'), 'utf8');

    assert.equal(result.version, '2.3.4');
    assert.deepEqual(result.changedFiles, [join(tauriSrcRoot, 'tauri.conf.json')]);
    assert.equal(syncedConfig.version, '2.3.4');
    assert.equal(syncedConfig.productName, 'Desktop Tracker Suite');
    assert.match(syncedCargoManifest, /version = "2\.3\.4"/u);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles reports only Cargo.toml when that is the stale file', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-partial-cargo-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ version: '3.4.5' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite', version: '3.4.5' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "0.0.1"', ''].join('\n'),
      'utf8',
    );

    const result = await syncDesktopVersionFiles({
      workspaceRoot,
      tauriSrcRoot,
    });
    const syncedConfig = JSON.parse(
      await readFile(join(tauriSrcRoot, 'tauri.conf.json'), 'utf8'),
    ) as { version: string; productName: string };
    const syncedCargoManifest = await readFile(join(tauriSrcRoot, 'Cargo.toml'), 'utf8');

    assert.equal(result.version, '3.4.5');
    assert.deepEqual(result.changedFiles, [join(tauriSrcRoot, 'Cargo.toml')]);
    assert.equal(syncedConfig.version, '3.4.5');
    assert.equal(syncedConfig.productName, 'Desktop Tracker Suite');
    assert.match(syncedCargoManifest, /version = "3\.4\.5"/u);
    assert.doesNotMatch(syncedCargoManifest, /version = "0\.0\.1"/u);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles adds the tauri.conf.json version field when it is missing', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-tauri-missing-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ version: '4.5.6' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "4.5.6"', ''].join('\n'),
      'utf8',
    );

    const result = await syncDesktopVersionFiles({
      workspaceRoot,
      tauriSrcRoot,
    });
    const syncedConfig = JSON.parse(
      await readFile(join(tauriSrcRoot, 'tauri.conf.json'), 'utf8'),
    ) as { version: string; productName: string };

    assert.equal(result.version, '4.5.6');
    assert.deepEqual(result.changedFiles, [join(tauriSrcRoot, 'tauri.conf.json')]);
    assert.equal(syncedConfig.version, '4.5.6');
    assert.equal(syncedConfig.productName, 'Desktop Tracker Suite');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles throws when package.json is missing a version field', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-error-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(join(workspaceRoot, 'package.json'), JSON.stringify({}, null, 2), 'utf8');
    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "1.0.0"', ''].join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        syncDesktopVersionFiles({
          workspaceRoot,
          tauriSrcRoot,
        }),
      /root package\.json is missing a version field/u,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles rejects when the workspace package.json is missing', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-root-missing-file-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "1.0.0"', ''].join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        syncDesktopVersionFiles({
          workspaceRoot,
          tauriSrcRoot,
        }),
      /Workspace package\.json is missing/u,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles rejects when the workspace package.json contains invalid JSON', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-root-invalid-json-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(join(workspaceRoot, 'package.json'), '{ invalid json', 'utf8');
    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "1.0.0"', ''].join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        syncDesktopVersionFiles({
          workspaceRoot,
          tauriSrcRoot,
        }),
      /SyntaxError/u,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles rejects when Cargo.toml is missing a package version', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-cargo-error-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      '[package]\nname = "tauri-shell"\n',
      'utf8',
    );

    await assert.rejects(
      () =>
        syncDesktopVersionFiles({
          workspaceRoot,
          tauriSrcRoot,
        }),
      /missing a version field inside the \[package\] section/u,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles rejects when tauri.conf.json is missing', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-tauri-missing-file-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "1.0.0"', ''].join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        syncDesktopVersionFiles({
          workspaceRoot,
          tauriSrcRoot,
        }),
      /Tauri desktop config is missing/u,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles rejects when tauri.conf.json contains invalid JSON', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-tauri-invalid-json-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(join(tauriSrcRoot, 'tauri.conf.json'), '{ invalid json', 'utf8');
    await writeFile(
      join(tauriSrcRoot, 'Cargo.toml'),
      ['[package]', 'name = "tauri-shell"', 'version = "1.0.0"', ''].join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        syncDesktopVersionFiles({
          workspaceRoot,
          tauriSrcRoot,
        }),
      /SyntaxError/u,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('syncDesktopVersionFiles rejects when Cargo.toml is missing', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tauri-version-sync-cargo-missing-file-'));
  const tauriSrcRoot = join(workspaceRoot, 'apps', 'tauri-shell', 'src-tauri');
  try {
    await mkdir(tauriSrcRoot, { recursive: true });

    await writeFile(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(
      join(tauriSrcRoot, 'tauri.conf.json'),
      JSON.stringify({ productName: 'Desktop Tracker Suite', version: '1.0.0' }, null, 2),
      'utf8',
    );

    await assert.rejects(
      () =>
        syncDesktopVersionFiles({
          workspaceRoot,
          tauriSrcRoot,
        }),
      /Tauri Cargo manifest is missing/u,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
