type PackageJson = {
  bin?: string;
  dependencies?: Record<string, string>;
  main?: string;
  name?: string;
  packageManager?: string;
  pkg?: NodeSidecarPkgConfig;
  private?: boolean;
  trustedDependencies?: string[];
  version?: string;
};

export type NodeSidecarPkgConfig = {
  assets?: string[];
  ignore?: string[];
  patches?: Record<string, string[]>;
};

export const NODE_BACKEND_TRUSTED_DEPENDENCIES = [
  '@nestjs/core',
  'sqlite3',
] as const;

export const NODE_BACKEND_INSTALL_POLICY =
  ['trustedDependencies:', '  - @nestjs/core', '  - sqlite3'].join('\n') + '\n';

export function buildNodeSidecarInstallEnvironment(
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  // sqlite3 6's Linux prebuild needs glibc 2.38; compile against the host
  // instead so Ubuntu 22.04 and other supported older hosts remain usable.
  return platform === 'linux' ? { npm_config_build_from_source: 'true' } : {};
}

export function buildPackagedNodeBackendPackageJson(input: {
  backendPackageJson: PackageJson;
  packageManager?: string;
  sqliteVersion?: string;
  overrides?: Omit<PackageJson, 'dependencies' | 'packageManager'>;
}) {
  const sqliteVersion = input.sqliteVersion?.trim();
  if (!sqliteVersion) {
    throw new Error(
      'sqlite3 is missing from the installed workspace dependencies.',
    );
  }

  return {
    ...input.backendPackageJson,
    ...(input.overrides ?? {}),
    dependencies: {
      ...(input.backendPackageJson.dependencies ?? {}),
      sqlite3: sqliteVersion,
    },
    packageManager: input.packageManager,
    trustedDependencies: [...NODE_BACKEND_TRUSTED_DEPENDENCIES],
  };
}

export function buildNodeSidecarPkgConfig(
  includeNestAdapterPatch = false,
): NodeSidecarPkgConfig {
  return {
    assets: ['assets/**/*', 'node_modules/**/*.json', 'node_modules/**/*.node'],
    // pkg's VM cannot execute Nest 12's dynamic import. Preserve the async
    // adapter load using the snapshot-aware CommonJS loader in the executable.
    ...(includeNestAdapterPatch
      ? {
          patches: {
            'node_modules/@nestjs/core/nest-factory.js': [
              "() => import('@nestjs/platform-express')",
              "() => Promise.resolve().then(() => require('@nestjs/platform-express'))",
            ],
          },
        }
      : {}),
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
  };
}

export function buildNodeSidecarPackageJson(input: {
  backendPackageJson: PackageJson;
  packageManager?: string;
  sidecarName: string;
  sqliteVersion?: string;
}) {
  return buildPackagedNodeBackendPackageJson({
    backendPackageJson: input.backendPackageJson,
    packageManager: input.packageManager,
    sqliteVersion: input.sqliteVersion,
    overrides: {
      bin: 'main.js',
      name: input.sidecarName,
      pkg: buildNodeSidecarPkgConfig(
        Boolean(input.backendPackageJson.dependencies?.['@nestjs/core']),
      ),
      private: true,
    },
  });
}
