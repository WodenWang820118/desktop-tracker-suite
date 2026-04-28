import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { WORKSPACE_ROOT } from '../shared/workspace.ts';

type TauriConfig = {
  bundle?: {
    resources?: unknown;
  };
};

const SRC_TAURI_ROOT = join(WORKSPACE_ROOT, 'apps', 'tauri-shell', 'src-tauri');

const SIDECAR_RESOURCE_MAPPINGS = [
  {
    configFile: 'tauri.nest-sidecar.conf.json',
    expectedResources: {
      '../../../dist/tauri-shell-nest-sidecar/resources/metadata': 'metadata',
    },
  },
  {
    configFile: 'tauri.express-sidecar.conf.json',
    expectedResources: {
      '../../../dist/tauri-shell-express-sidecar/resources/metadata': 'metadata',
    },
  },
  {
    configFile: 'tauri.spring-native.conf.json',
    expectedResources: {
      '../../../dist/tauri-shell-spring-native/resources/spring-native': 'spring-native',
      '../../../dist/tauri-shell-spring-native/resources/metadata': 'metadata',
    },
  },
  {
    configFile: 'tauri.release.conf.json',
    expectedResources: {
      '../../../dist/tauri-shell-nest-sidecar/resources/metadata': 'metadata',
    },
  },
] as const;

test('sidecar Tauri configs map bundled resources to runtime-relative directories', async () => {
  for (const { configFile, expectedResources } of SIDECAR_RESOURCE_MAPPINGS) {
    const config = await readTauriConfig(configFile);

    assert.deepEqual(
      config.bundle?.resources,
      expectedResources,
      `${configFile} must use source-to-target resource mapping so NSIS installs files where the Tauri runtime reads them`,
    );
  }
});

async function readTauriConfig(configFile: string): Promise<TauriConfig> {
  return JSON.parse(
    await readFile(join(SRC_TAURI_ROOT, configFile), 'utf8'),
  ) as TauriConfig;
}
