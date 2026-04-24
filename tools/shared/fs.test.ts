import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { fileExists, writeJson } from './fs.ts';

test('writeJson creates parent directories before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shared-fs-'));

  try {
    const filePath = join(root, 'nested', 'metrics.json');
    await writeJson(filePath, { ready: true });

    assert.equal(await readFile(filePath, 'utf8'), '{\n  "ready": true\n}\n');
    assert.equal(await fileExists(filePath), true);
    assert.equal(await fileExists(join(root, 'missing.json')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeJson rejects when a parent path segment is a file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shared-fs-failure-'));

  try {
    const blockedPath = join(root, 'blocked');
    await writeFile(blockedPath, 'not a directory', 'utf8');

    await assert.rejects(
      writeJson(join(blockedPath, 'metrics.json'), { ready: true }),
      /ENOTDIR|EEXIST/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeJson overwrites existing files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shared-fs-overwrite-'));

  try {
    const filePath = join(root, 'metrics.json');
    await writeFile(filePath, 'old value', 'utf8');

    await writeJson(filePath, { ready: false });

    assert.equal(await readFile(filePath, 'utf8'), '{\n  "ready": false\n}\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
