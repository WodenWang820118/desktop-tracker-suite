import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  BACKEND_RUNTIME_DIR,
  CACHED_NODE_EXE,
  NEST_DIST_DIR,
  NODE_RUNTIME_DIR,
  PACKAGED_NODE_EXE,
  PNPM_COMMAND,
  TAURI_DIST_ROOT,
  copyDirectory,
  copyFileEnsured,
  ensureCleanDir,
  ensureNodeBinaryDownloaded,
  fileExists,
  logStep,
  readJson,
  runCommand,
  stopStaleTauriBackendProcesses,
  writeJson,
  writeTextFile,
  WORKSPACE_ROOT,
} from './common.ts';

type PackageJson = {
  dependencies?: Record<string, string>;
  packageManager?: string;
};

async function main() {
  const rootPackageJson = await readJson<PackageJson>(join(WORKSPACE_ROOT, 'package.json'));
  const distPackageJsonPath = join(NEST_DIST_DIR, 'package.json');

  if (!(await fileExists(distPackageJsonPath))) {
    throw new Error(
      `Nest backend build output is missing at ${distPackageJsonPath}. Run nx build nest-backend first.`,
    );
  }

  await stopStaleTauriBackendProcesses();

  logStep('Preparing Tauri runtime resources');
  await ensureCleanDir(TAURI_DIST_ROOT);
  await ensureCleanDir(BACKEND_RUNTIME_DIR);
  await ensureCleanDir(NODE_RUNTIME_DIR);

  logStep('Copying the built Nest backend into the packaged runtime folder');
  await copyDirectory(NEST_DIST_DIR, BACKEND_RUNTIME_DIR);
  await rm(join(BACKEND_RUNTIME_DIR, 'pnpm-lock.yaml'), { force: true });

  const backendPackageJson = await readJson<PackageJson>(distPackageJsonPath);
  const sqliteVersion = rootPackageJson.dependencies?.sqlite3;
  if (!sqliteVersion) {
    throw new Error('sqlite3 is missing from the root package.json dependencies.');
  }

  await writeJson(join(BACKEND_RUNTIME_DIR, 'package.json'), {
    ...backendPackageJson,
    dependencies: {
      ...(backendPackageJson.dependencies ?? {}),
      sqlite3: sqliteVersion,
    },
    packageManager: rootPackageJson.packageManager,
  });
  await writeTextFile(
    join(BACKEND_RUNTIME_DIR, '.npmrc'),
    ['node-linker=hoisted', 'only-built-dependencies[]=@nestjs/core', 'only-built-dependencies[]=sqlite3'].join(
      '\n',
    ) + '\n',
    'utf8',
  );

  logStep('Installing production dependencies for the packaged Nest runtime');
  await runCommand(
    PNPM_COMMAND,
    ['install', '--prod', '--ignore-workspace', '--no-frozen-lockfile'],
    {
      cwd: BACKEND_RUNTIME_DIR,
      env: {
        ...process.env,
        npm_config_node_linker: 'hoisted',
      },
    },
  );
  const sqliteBindingPath = join(
    BACKEND_RUNTIME_DIR,
    'node_modules',
    'sqlite3',
    'build',
    'Release',
    'node_sqlite3.node',
  );
  if (!(await fileExists(sqliteBindingPath))) {
    throw new Error(
      `sqlite3 native binding was not built correctly. Expected ${sqliteBindingPath} to exist.`,
    );
  }

  logStep('Fetching and verifying the pinned Windows Node runtime');
  await ensureNodeBinaryDownloaded();
  await copyFileEnsured(CACHED_NODE_EXE, PACKAGED_NODE_EXE);

  logStep(`Tauri backend runtime materialized at ${TAURI_DIST_ROOT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
