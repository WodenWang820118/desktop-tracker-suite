import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  isSpringNativeRuntimeArtifact,
  pickNativeExecutable,
  stageSpringNativeRuntimeArtifacts,
} from '../prepare-spring-native-dist.ts';

test('isSpringNativeRuntimeArtifact keeps the executable and native companion libraries', () => {
  const executablePath = '/workspace/apps/spring-backend/target/spring-backend';

  assert.equal(
    isSpringNativeRuntimeArtifact(executablePath, executablePath),
    true,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/sqlitejdbc.dll',
      executablePath,
    ),
    true,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so',
      executablePath,
    ),
    true,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so.1',
      executablePath,
    ),
    true,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/LIBSQLITEJDBC.SO.1',
      executablePath,
    ),
    true,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      'C:\\workspace\\target\\libsqlitejdbc.so.12',
      executablePath,
    ),
    true,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so.1.2',
      executablePath,
    ),
    true,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so.1.2.3',
      executablePath,
    ),
    true,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.dylib',
      executablePath,
    ),
    true,
  );
});

test('isSpringNativeRuntimeArtifact matches Windows executable paths case-insensitively', () => {
  const executablePath = 'C:\\workspace\\target\\spring-backend.exe';

  assert.equal(
    isSpringNativeRuntimeArtifact(
      'C:\\workspace\\target\\SPRING-BACKEND.EXE',
      executablePath,
    ),
    true,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      'C:\\workspace\\target\\helper.exe',
      executablePath,
    ),
    false,
  );
});

test('isSpringNativeRuntimeArtifact excludes non-runtime build artifacts', () => {
  const executablePath = '/workspace/apps/spring-backend/target/spring-backend';

  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/spring-backend-0.0.1-SNAPSHOT.jar',
      executablePath,
    ),
    false,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/spring-backend.exe.original',
      executablePath,
    ),
    false,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/sqlitejdbc.dll.original',
      executablePath,
    ),
    false,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so.original',
      executablePath,
    ),
    false,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so.1.original',
      executablePath,
    ),
    false,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so.12.original',
      executablePath,
    ),
    false,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so.1.2.original',
      executablePath,
    ),
    false,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so.1.2.3.original',
      executablePath,
    ),
    false,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.so.alpha',
      executablePath,
    ),
    false,
  );
  assert.equal(
    isSpringNativeRuntimeArtifact(
      '/workspace/apps/spring-backend/target/libsqlitejdbc.dylib.original',
      executablePath,
    ),
    false,
  );
});

test('pickNativeExecutable selects the newest non-test Unix executable by filename', async () => {
  await withTempDirectory(async (root) => {
    const targetDir = join(root, 'workspace.with.dot', 'target');
    await mkdir(targetDir, { recursive: true });
    const olderExecutable = join(targetDir, 'spring-backend-old');
    const newerExecutable = join(targetDir, 'spring-backend');
    const newestTestExecutable = join(targetDir, 'spring-backend-test');
    const dotTestExecutable = join(targetDir, 'spring-backend.test');
    const underscoreTestExecutable = join(targetDir, 'spring_test');
    await writeFile(olderExecutable, '');
    await writeFile(newerExecutable, '');
    await writeFile(newestTestExecutable, '');
    await writeFile(dotTestExecutable, '');
    await writeFile(underscoreTestExecutable, '');
    await writeFile(join(targetDir, 'spring-backend.jar'), '');
    await setMtime(olderExecutable, 10);
    await setMtime(newerExecutable, 20);
    await setMtime(newestTestExecutable, 30);
    await setMtime(dotTestExecutable, 40);
    await setMtime(underscoreTestExecutable, 50);

    assert.equal(pickNativeExecutable([targetDir], 'linux'), newerExecutable);
  });
});

test('pickNativeExecutable allows executable names that merely contain test', async () => {
  await withTempDirectory(async (root) => {
    const targetDir = join(root, 'target');
    await mkdir(targetDir, { recursive: true });
    const olderExecutable = join(targetDir, 'spring-backend');
    const newerExecutable = join(targetDir, 'latest-spring-backend');
    const newestTestExecutable = join(targetDir, 'spring-backend-test');
    await writeFile(olderExecutable, '');
    await writeFile(newerExecutable, '');
    await writeFile(newestTestExecutable, '');
    await setMtime(olderExecutable, 10);
    await setMtime(newerExecutable, 20);
    await setMtime(newestTestExecutable, 30);

    assert.equal(pickNativeExecutable([targetDir], 'linux'), newerExecutable);
  });
});

test('pickNativeExecutable selects Windows .exe outputs', async () => {
  await withTempDirectory(async (root) => {
    const targetDir = join(root, 'target');
    await mkdir(targetDir, { recursive: true });
    const executable = join(targetDir, 'spring-backend.exe');
    const testExecutable = join(targetDir, 'spring-backend-test.exe');
    await writeFile(executable, '');
    await writeFile(testExecutable, '');
    await writeFile(join(targetDir, 'spring-backend'), '');
    await setMtime(executable, 10);
    await setMtime(testExecutable, 20);

    assert.equal(pickNativeExecutable([targetDir], 'win32'), executable);
  });
});

test('pickNativeExecutable returns null when no executable candidates exist', async () => {
  await withTempDirectory(async (root) => {
    const targetDir = join(root, 'target');
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, 'spring-backend.jar'), '');

    assert.equal(pickNativeExecutable([targetDir], 'linux'), null);
  });
});

test('pickNativeExecutable returns null for an empty candidate directory list', () => {
  assert.equal(pickNativeExecutable([], 'linux'), null);
});

test('pickNativeExecutable returns null when every candidate is test-named', async () => {
  await withTempDirectory(async (root) => {
    const targetDir = join(root, 'target');
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, 'spring-backend-test'), '');
    await writeFile(join(targetDir, 'spring_test'), '');

    assert.equal(pickNativeExecutable([targetDir], 'linux'), null);
  });
});

test('pickNativeExecutable searches later candidate directories', async () => {
  await withTempDirectory(async (root) => {
    const missingTargetDir = join(root, 'missing-target');
    const fallbackTargetDir = join(root, 'fallback-target');
    await mkdir(fallbackTargetDir, { recursive: true });
    const executable = join(fallbackTargetDir, 'spring-backend');
    await writeFile(executable, '');

    assert.equal(
      pickNativeExecutable([missingTargetDir, fallbackTargetDir], 'linux'),
      executable,
    );
  });
});

test('pickNativeExecutable chooses the newest executable across candidate directories', async () => {
  await withTempDirectory(async (root) => {
    const firstTargetDir = join(root, 'apps-target');
    const secondTargetDir = join(root, 'root-target');
    await mkdir(firstTargetDir, { recursive: true });
    await mkdir(secondTargetDir, { recursive: true });
    const olderExecutable = join(firstTargetDir, 'spring-backend');
    const newerExecutable = join(secondTargetDir, 'spring-backend');
    await writeFile(olderExecutable, '');
    await writeFile(newerExecutable, '');
    await setMtime(olderExecutable, 10);
    await setMtime(newerExecutable, 20);

    assert.equal(
      pickNativeExecutable([firstTargetDir, secondTargetDir], 'linux'),
      newerExecutable,
    );
  });
});

test('stageSpringNativeRuntimeArtifacts copies only executable and native libraries', async () => {
  await withTempDirectory(async (root) => {
    const sourceDir = join(root, 'target');
    const distDir = join(root, 'dist');
    await mkdir(sourceDir, { recursive: true });
    await mkdir(distDir, { recursive: true });
    const executable = join(sourceDir, 'spring-backend');
    await writeFile(executable, 'exe');
    if (process.platform !== 'win32') {
      await chmod(executable, 0o755);
    }
    await writeFile(join(sourceDir, 'sqlitejdbc.dll'), 'dll');
    await writeFile(join(sourceDir, 'sqlitejdbc.dll.original'), 'original');
    await writeFile(join(sourceDir, 'libsqlitejdbc.so'), 'so');
    await writeFile(join(sourceDir, 'libsqlitejdbc.so.1'), 'so-versioned');
    await writeFile(join(sourceDir, 'libsqlitejdbc.so.1.2'), 'so-multi-versioned');
    await writeFile(join(sourceDir, 'libsqlitejdbc.so.1.2.3'), 'so-three-versioned');
    await writeFile(join(sourceDir, 'libsqlitejdbc.so.original'), 'original');
    await writeFile(join(sourceDir, 'libsqlitejdbc.so.1.original'), 'original');
    await writeFile(join(sourceDir, 'libsqlitejdbc.so.1.2.original'), 'original');
    await writeFile(join(sourceDir, 'libsqlitejdbc.so.1.2.3.original'), 'original');
    await writeFile(join(sourceDir, 'libsqlitejdbc.so.12.original'), 'original');
    await writeFile(join(sourceDir, 'libsqlitejdbc.dylib'), 'dylib');
    await writeFile(join(sourceDir, 'libsqlitejdbc.dylib.original'), 'original');
    await writeFile(join(sourceDir, 'spring-backend.jar'), 'jar');
    await writeFile(join(distDir, 'stale.txt'), 'stale');

    stageSpringNativeRuntimeArtifacts({ distDir, executable, sourceDir });

    assert.deepEqual(await listDirectoryFileNames(distDir), [
      'libsqlitejdbc.dylib',
      'libsqlitejdbc.so',
      'libsqlitejdbc.so.1',
      'libsqlitejdbc.so.1.2',
      'libsqlitejdbc.so.1.2.3',
      'spring-backend',
      'sqlitejdbc.dll',
    ]);
    assert.equal(await readFile(join(distDir, 'spring-backend'), 'utf8'), 'exe');
    assert.equal(await readFile(join(distDir, 'sqlitejdbc.dll'), 'utf8'), 'dll');
    assert.equal(await readFile(join(distDir, 'libsqlitejdbc.so'), 'utf8'), 'so');
    assert.equal(
      await readFile(join(distDir, 'libsqlitejdbc.so.1'), 'utf8'),
      'so-versioned',
    );
    assert.equal(
      await readFile(join(distDir, 'libsqlitejdbc.so.1.2'), 'utf8'),
      'so-multi-versioned',
    );
    assert.equal(
      await readFile(join(distDir, 'libsqlitejdbc.so.1.2.3'), 'utf8'),
      'so-three-versioned',
    );
    assert.equal(
      await readFile(join(distDir, 'libsqlitejdbc.dylib'), 'utf8'),
      'dylib',
    );
    if (process.platform !== 'win32') {
      const stagedExecutable = await stat(join(distDir, 'spring-backend'));
      assert.notEqual(stagedExecutable.mode & 0o111, 0);
    }
  });
});

test('stageSpringNativeRuntimeArtifacts creates a missing dist directory', async () => {
  await withTempDirectory(async (root) => {
    const sourceDir = join(root, 'target');
    const distDir = join(root, 'missing-dist');
    await mkdir(sourceDir, { recursive: true });
    const executable = join(sourceDir, 'spring-backend.exe');
    await writeFile(executable, 'exe');
    await writeFile(join(sourceDir, 'sqlitejdbc.dll'), 'dll');

    stageSpringNativeRuntimeArtifacts({ distDir, executable, sourceDir });

    assert.deepEqual(await listDirectoryFileNames(distDir), [
      'spring-backend.exe',
      'sqlitejdbc.dll',
    ]);
  });
});

test('stageSpringNativeRuntimeArtifacts rejects a missing source directory', async () => {
  await withTempDirectory(async (root) => {
    const distDir = join(root, 'dist');
    const sentinelFile = join(distDir, 'sentinel.txt');
    await mkdir(distDir, { recursive: true });
    await writeFile(sentinelFile, 'keep');

    assert.throws(
      () =>
        stageSpringNativeRuntimeArtifacts({
          distDir,
          executable: join(root, 'missing-source', 'spring-backend'),
          sourceDir: join(root, 'missing-source'),
        }),
      /Spring native artifact source directory is missing:/u,
    );
    assert.equal(await readFile(sentinelFile, 'utf8'), 'keep');
  });
});

test('stageSpringNativeRuntimeArtifacts rejects a source directory without runtime artifacts', async () => {
  await withTempDirectory(async (root) => {
    const sourceDir = join(root, 'target');
    const distDir = join(root, 'dist');
    const sentinelFile = join(distDir, 'sentinel.txt');
    await mkdir(sourceDir, { recursive: true });
    await mkdir(distDir, { recursive: true });
    await writeFile(join(sourceDir, 'spring-backend.jar'), 'jar');
    await writeFile(sentinelFile, 'keep');

    assert.throws(
      () =>
        stageSpringNativeRuntimeArtifacts({
          distDir,
          executable: join(sourceDir, 'spring-backend'),
          sourceDir,
        }),
      /No Spring native runtime artifacts found in:/u,
    );
    assert.equal(await readFile(sentinelFile, 'utf8'), 'keep');
  });
});

async function withTempDirectory(callback: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'prepare-spring-native-dist-test-'));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function setMtime(filePath: string, seconds: number) {
  const date = new Date(seconds * 1000);
  await utimes(filePath, date, date);
}

async function listDirectoryFileNames(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}
