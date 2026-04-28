import { join, relative } from 'node:path';

import {
  ensureDir,
  readJson,
  TAURI_SRC_TAURI_ROOT,
  writeJson,
  WORKSPACE_ROOT,
} from './common.ts';

export const GRID_FRONTENDS = ['ng', 'react', 'vue'] as const;
export type GridFrontend = (typeof GRID_FRONTENDS)[number];

export const GRID_BACKENDS = ['nest', 'express', 'spring-native'] as const;
export type GridBackend = (typeof GRID_BACKENDS)[number];

export const GRID_DESKTOP_TARGETS = [
  'windows-x64',
  'linux-x64',
  'darwin-arm64',
] as const;
export type GridDesktopTarget = (typeof GRID_DESKTOP_TARGETS)[number];

export const GENERATED_GRID_CONFIG_DIR_NAME = 'generated-grid-configs';
export const GENERATED_GRID_CONFIG_DIR = join(
  TAURI_SRC_TAURI_ROOT,
  GENERATED_GRID_CONFIG_DIR_NAME,
);

const PRODUCT_NAME = 'Desktop Tracker Suite';
const REPOSITORY_RELEASE_DOWNLOAD_BASE =
  'https://github.com/WodenWang820118/nx-electron/releases/latest/download';
const GENERATED_CONFIG_ROOT_PREFIX = '../../..';
const DEFAULT_DEV_URL =
  'http://localhost:4200/?taskApiUrl=http%3A%2F%2Flocalhost%3A3000%2Ftasks';
const DEFAULT_CSP =
  "default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' http://localhost:5000 http://ipc.localhost http://tauri.localhost https://tauri.localhost;";
const DEFAULT_DEV_CSP =
  "default-src 'self' http://localhost:4200 http://localhost:3000 ws://localhost:4200 ws://localhost:3000 data: blob:; script-src 'self' 'unsafe-eval' http://localhost:4200; style-src 'self' 'unsafe-inline' http://localhost:4200; img-src 'self' data: blob: http://localhost:4200; font-src 'self' data: http://localhost:4200; connect-src 'self' http://localhost:4200 http://localhost:3000 ws://localhost:4200 ws://localhost:3000 http://ipc.localhost http://tauri.localhost https://tauri.localhost;";

type GridFrontendDefinition = {
  buildArgs: string[];
  distPathFromGeneratedConfig: string;
  label: string;
};

type GridBackendDefinition = {
  buildArgs: string[];
  externalBin: string[];
  label: string;
  materializeArgs: string[];
  resources: Record<string, string>;
  smokeArgs: string[];
};

export type GridSelection = {
  backend: GridBackend;
  frontend: GridFrontend;
};

export type GeneratedGridConfigResult = {
  config: TauriConfig;
  configPath: string;
  projectConfigPath: string;
};

export type TauriConfig = {
  $schema: string;
  app: {
    security: {
      capabilities: string[];
      csp: string;
      devCsp: string;
    };
    windows: Array<{
      create: boolean;
      height: number;
      label: string;
      minHeight: number;
      minWidth: number;
      resizable: boolean;
      title: string;
      width: number;
    }>;
  };
  build: {
    devUrl: string;
    frontendDist: string;
  };
  bundle: {
    active: boolean;
    createUpdaterArtifacts: boolean;
    externalBin: string[];
    icon: string[];
    resources: Record<string, string>;
  };
  identifier: string;
  plugins: {
    updater: {
      endpoints: string[];
      pubkey?: string;
      windows: {
        installMode: 'passive';
      };
    };
  };
  productName: string;
  version: string;
};

const FRONTEND_DEFINITIONS: Record<GridFrontend, GridFrontendDefinition> = {
  ng: {
    buildArgs: [
      'exec',
      'nx',
      'build',
      'ng-tracker',
      '--configuration',
      'tauri',
    ],
    distPathFromGeneratedConfig: `${GENERATED_CONFIG_ROOT_PREFIX}/dist/ng-tracker/browser`,
    label: 'Angular',
  },
  react: {
    buildArgs: ['exec', 'nx', 'build', 'react-tracker'],
    distPathFromGeneratedConfig: `${GENERATED_CONFIG_ROOT_PREFIX}/dist/react-tracker`,
    label: 'React',
  },
  vue: {
    buildArgs: ['exec', 'nx', 'build', 'vue-tracker'],
    distPathFromGeneratedConfig: `${GENERATED_CONFIG_ROOT_PREFIX}/dist/vue-tracker`,
    label: 'Vue',
  },
};

const BACKEND_DEFINITIONS: Record<GridBackend, GridBackendDefinition> = {
  express: {
    buildArgs: [
      'exec',
      'nx',
      'build',
      'express-backend',
      '--configuration',
      'production',
    ],
    externalBin: ['binaries/express-backend'],
    label: 'Express',
    materializeArgs: [
      'tools/tauri/materialize-node-sidecar-runtime.ts',
      'express',
    ],
    resources: {
      [`${GENERATED_CONFIG_ROOT_PREFIX}/dist/tauri-shell-express-sidecar/resources/metadata`]:
        'metadata',
    },
    smokeArgs: ['tools/tauri/smoke-node-sidecar-runtime.ts', 'express'],
  },
  nest: {
    buildArgs: [
      'exec',
      'nx',
      'build',
      'nest-backend',
      '--configuration',
      'production',
    ],
    externalBin: ['binaries/nest-backend'],
    label: 'Nest',
    materializeArgs: [
      'tools/tauri/materialize-node-sidecar-runtime.ts',
      'nest',
    ],
    resources: {
      [`${GENERATED_CONFIG_ROOT_PREFIX}/dist/tauri-shell-nest-sidecar/resources/metadata`]:
        'metadata',
    },
    smokeArgs: ['tools/tauri/smoke-node-sidecar-runtime.ts', 'nest'],
  },
  'spring-native': {
    buildArgs: ['exec', 'nx', 'run', 'spring-backend:native-build'],
    externalBin: ['binaries/spring-backend'],
    label: 'Spring Native',
    materializeArgs: ['tools/tauri/materialize-spring-native-runtime.ts'],
    resources: {
      [`${GENERATED_CONFIG_ROOT_PREFIX}/dist/tauri-shell-spring-native/resources/spring-native`]:
        'spring-native',
      [`${GENERATED_CONFIG_ROOT_PREFIX}/dist/tauri-shell-spring-native/resources/metadata`]:
        'metadata',
    },
    smokeArgs: ['tools/tauri/smoke-spring-native-runtime.ts'],
  },
};

export function getFrontendDefinition(
  frontend: GridFrontend,
): GridFrontendDefinition {
  return FRONTEND_DEFINITIONS[frontend];
}

export function getBackendDefinition(
  backend: GridBackend,
): GridBackendDefinition {
  return BACKEND_DEFINITIONS[backend];
}

export function listGridSelections(): GridSelection[] {
  return GRID_FRONTENDS.flatMap((frontend) =>
    GRID_BACKENDS.map((backend) => ({ backend, frontend })),
  );
}

export function parseGridFrontend(value: string | undefined): GridFrontend {
  return parseGridValue(value, GRID_FRONTENDS, 'TAURI_GRID_FRONTEND');
}

export function parseGridBackend(value: string | undefined): GridBackend {
  return parseGridValue(value, GRID_BACKENDS, 'TAURI_GRID_BACKEND');
}

export function parseGridSelection(input: {
  backend?: string;
  frontend?: string;
}): GridSelection {
  return {
    backend: parseGridBackend(input.backend),
    frontend: parseGridFrontend(input.frontend),
  };
}

export function resolveGridSelectionFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GridSelection {
  return parseGridSelection({
    backend: env.TAURI_GRID_BACKEND,
    frontend: env.TAURI_GRID_FRONTEND,
  });
}

export function getGridVariantKey({
  backend,
  frontend,
}: GridSelection): string {
  return `${frontend}-${backend}`;
}

export function getGeneratedConfigProjectPath(
  selection: GridSelection,
): string {
  return `src-tauri/${GENERATED_GRID_CONFIG_DIR_NAME}/${getGridVariantKey(selection)}.conf.json`;
}

export function getGeneratedConfigPath(selection: GridSelection): string {
  return join(
    TAURI_SRC_TAURI_ROOT,
    GENERATED_GRID_CONFIG_DIR_NAME,
    `${getGridVariantKey(selection)}.conf.json`,
  );
}

export function getUpdaterManifestFileName(selection: GridSelection): string {
  return `latest-${getGridVariantKey(selection)}.json`;
}

export function getCanonicalUpdaterManifestFileName(): string {
  return 'latest.json';
}

export function isCanonicalGridSelection(selection: GridSelection): boolean {
  return selection.frontend === 'ng' && selection.backend === 'nest';
}

export function buildGeneratedTauriConfig(input: {
  backend: GridBackend;
  frontend: GridFrontend;
  updaterPubkey?: string;
  version: string;
}): TauriConfig {
  const selection = {
    backend: input.backend,
    frontend: input.frontend,
  };
  const productName = resolveProductName(selection);
  const frontend = getFrontendDefinition(input.frontend);
  const backend = getBackendDefinition(input.backend);
  const manifestFileName = isCanonicalGridSelection(selection)
    ? getCanonicalUpdaterManifestFileName()
    : getUpdaterManifestFileName(selection);
  const updaterPubkey = input.updaterPubkey?.trim();

  return {
    $schema: `${GENERATED_CONFIG_ROOT_PREFIX}/node_modules/@tauri-apps/cli/config.schema.json`,
    productName,
    version: input.version,
    identifier: resolveIdentifier(selection),
    build: {
      devUrl: DEFAULT_DEV_URL,
      frontendDist: frontend.distPathFromGeneratedConfig,
    },
    app: {
      windows: [
        {
          label: 'main',
          title: productName,
          width: 1280,
          height: 800,
          minWidth: 1024,
          minHeight: 720,
          resizable: true,
          create: false,
        },
      ],
      security: {
        csp: DEFAULT_CSP,
        devCsp: DEFAULT_DEV_CSP,
        capabilities: ['main-window'],
      },
    },
    bundle: {
      active: true,
      createUpdaterArtifacts: true,
      externalBin: backend.externalBin,
      icon: [
        'icons/32x32.png',
        'icons/128x128.png',
        'icons/128x128@2x.png',
        'icons/icon.icns',
        'icons/icon.ico',
      ],
      resources: backend.resources,
    },
    plugins: {
      updater: {
        endpoints: [`${REPOSITORY_RELEASE_DOWNLOAD_BASE}/${manifestFileName}`],
        ...(updaterPubkey ? { pubkey: updaterPubkey } : {}),
        windows: {
          installMode: 'passive',
        },
      },
    },
  };
}

export async function writeGeneratedTauriConfig(input: {
  backend: GridBackend;
  frontend: GridFrontend;
  updaterPubkey?: string;
  version: string;
}): Promise<GeneratedGridConfigResult> {
  const selection = {
    backend: input.backend,
    frontend: input.frontend,
  };
  const config = buildGeneratedTauriConfig({
    ...input,
    updaterPubkey: input.updaterPubkey ?? process.env.TAURI_UPDATER_PUBKEY,
  });
  const configPath = getGeneratedConfigPath(selection);
  await ensureDir(GENERATED_GRID_CONFIG_DIR);
  await writeJson(configPath, config);

  return {
    config,
    configPath,
    projectConfigPath: normalizePathForTauriProject(configPath),
  };
}

export async function readWorkspaceVersion(): Promise<string> {
  const packageJson = await readJson<{ version?: string }>(
    join(WORKSPACE_ROOT, 'package.json'),
  );
  const version = packageJson.version?.trim();
  if (!version) {
    throw new Error('The root package.json is missing a version field.');
  }

  return version;
}

export function resolveIdentifier(selection: GridSelection): string {
  if (isCanonicalGridSelection(selection)) {
    return 'com.wodenwang820118.tracker.tauri';
  }

  if (selection.frontend === 'ng' && selection.backend === 'spring-native') {
    return 'com.wodenwang820118.tracker.tauri.springnative';
  }

  return `com.wodenwang820118.tracker.tauri.${selection.frontend}.${normalizeBackendForIdentifier(
    selection.backend,
  )}`;
}

export function resolveProductName(selection: GridSelection): string {
  if (isCanonicalGridSelection(selection)) {
    return PRODUCT_NAME;
  }

  if (selection.frontend === 'ng' && selection.backend === 'spring-native') {
    return `${PRODUCT_NAME} Spring Native PoC`;
  }

  return `${PRODUCT_NAME} ${getFrontendDefinition(selection.frontend).label} ${
    getBackendDefinition(selection.backend).label
  }`;
}

function parseGridValue<const TValue extends readonly string[]>(
  value: string | undefined,
  allowedValues: TValue,
  envName: string,
): TValue[number] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    throw new Error(
      `${envName} is required. Expected one of: ${allowedValues.join(', ')}.`,
    );
  }

  if ((allowedValues as readonly string[]).includes(normalized)) {
    return normalized as TValue[number];
  }

  throw new Error(
    `Unsupported ${envName} "${value}". Expected one of: ${allowedValues.join(', ')}.`,
  );
}

function normalizeBackendForIdentifier(backend: GridBackend): string {
  return backend.replaceAll('-', '');
}

function normalizePathForTauriProject(path: string): string {
  return relative(join(WORKSPACE_ROOT, 'apps', 'tauri-shell'), path).replaceAll(
    '\\',
    '/',
  );
}
