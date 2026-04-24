type PackageJson = {
  bin?: string;
  dependencies?: Record<string, string>;
  main?: string;
  name?: string;
  packageManager?: string;
  pkg?: NodeSidecarPkgConfig;
  private?: boolean;
  version?: string;
};

export type NodeSidecarPkgConfig = {
  assets?: string[];
  ignore?: string[];
  scripts?: string[];
};

export const NODE_BACKEND_INSTALL_NPMRC =
  [
    'node-linker=hoisted',
    'only-built-dependencies[]=@nestjs/core',
    'only-built-dependencies[]=sqlite3',
  ].join('\n') + '\n';

export function buildPackagedNodeBackendPackageJson(input: {
  backendPackageJson: PackageJson;
  packageManager?: string;
  sqliteVersion?: string;
  overrides?: Omit<PackageJson, 'dependencies' | 'packageManager'>;
}) {
  const sqliteVersion = input.sqliteVersion?.trim();
  if (!sqliteVersion) {
    throw new Error('sqlite3 is missing from the installed workspace dependencies.');
  }

  return {
    ...input.backendPackageJson,
    ...(input.overrides ?? {}),
    dependencies: {
      ...(input.backendPackageJson.dependencies ?? {}),
      sqlite3: sqliteVersion,
    },
    packageManager: input.packageManager,
  };
}

export function buildNodeSidecarPkgConfig(): NodeSidecarPkgConfig {
  return {
    assets: ['assets/**/*', 'node_modules/**/*.json', 'node_modules/**/*.node'],
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
    scripts: ['node_modules/**/*.js'],
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
      pkg: buildNodeSidecarPkgConfig(),
      private: true,
    },
  });
}
