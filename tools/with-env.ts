// with-env (TypeScript)
//#region Imports
import { spawn } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import { isAbsolute, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
//#endregion Imports

type ProfileName = 'dev' | 'prod';

interface ParsedArgs {
  profile?: ProfileName | string;
  backend?: string;
  extraFiles: string[];
  dryRun: boolean;
  command: string[];
}

//#region Configuration
const PROFILE_FILES: Record<string, string[]> = {
  dev: ['envs/.env.dev'],
  prod: ['envs/.env.prod'],
};

const BACKEND_NAMES: Record<string, string> = {
  nest: 'nest-backend',
  express: 'express-backend',
  spring: 'spring-backend',
};
//#endregion Configuration

//#region Small utilities
function printHelp(exitCode = 0): never {
  console.log(`with-env: run a command with layered env files (via env-cmd)

Usage:
  bun run --silent with-env --profile <dev|prod> [--be <nest|express|spring>] [--file <path> ...] -- <command> [args...]

Profiles:
  dev          -> envs/.env.dev (+ envs/.env.dev.local if present)
  prod         -> envs/.env.prod (+ envs/.env.prod.local if present)

Notes:
  - Prefer using APP_PROFILE (e.g. ng-nest / vue-spring) as the single source of truth.
  - --be is only an override; it injects BACKEND into the spawned command.

Options:
  --dry-run    Print resolved env files and command
  --help       Show this help
`);
  process.exit(exitCode);
}

function die(message: string): never {
  console.error(`with-env: ${message}`);
  process.exit(1);
}

function fileExists(filePath: string): boolean {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveRepoPath(maybeRelativePath?: string): string | undefined {
  if (!maybeRelativePath) return maybeRelativePath;
  if (isAbsolute(maybeRelativePath)) return maybeRelativePath;
  return resolve(process.cwd(), maybeRelativePath);
}

function appendIfExists(files: string[], filePath?: string) {
  if (!filePath) return;
  const abs = resolveRepoPath(filePath);
  if (abs && fileExists(abs)) {
    files.push(filePath);
  }
}

//#endregion Small utilities

//#region env-cmd integration
function resolveEnvCmdBin(): string {
  let pkgJsonPath: string | undefined;
  try {
    pkgJsonPath = require.resolve('env-cmd/package.json', {
      paths: [process.cwd()],
    });
  } catch {
    die('Missing dependency "env-cmd". Run: bun install');
  }

  const pkgDir = dirname(pkgJsonPath as string);
  const pkg = JSON.parse(readFileSync(pkgJsonPath as string, 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const binField = pkg.bin;

  let relativeBinPath: string | undefined;
  if (typeof binField === 'string') {
    relativeBinPath = binField;
  } else if (binField && typeof binField === 'object') {
    relativeBinPath = binField['env-cmd'] ?? Object.values(binField)[0];
  }

  if (!relativeBinPath) {
    die('Could not locate env-cmd binary from env-cmd/package.json');
  }

  const absBinPath = resolve(pkgDir, relativeBinPath);
  if (!fileExists(absBinPath)) {
    die(`env-cmd binary not found at ${absBinPath}`);
  }

  return absBinPath;
}

//#endregion env-cmd integration

//#region Argument parsing
function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    profile: undefined,
    backend: undefined,
    extraFiles: [],
    dryRun: false,
    command: [],
  };

  const args = [...argv];
  let i = 0;

  const nextValue = (flag: string) => {
    const value = args[i + 1];
    if (!value) {
      die(`Missing value for ${flag}`);
    }
    i += 2;
    return value;
  };

  const handlers: Record<string, () => void> = {
    '--help': () => printHelp(0),
    '-h': () => printHelp(0),
    '--dry-run': () => {
      result.dryRun = true;
      i += 1;
    },
    '--profile': () => {
      result.profile = nextValue('--profile');
    },
    '--be': () => {
      result.backend = nextValue('--be');
    },
    '--backend': () => {
      result.backend = nextValue('--backend');
    },
    '--file': () => {
      result.extraFiles.push(nextValue('--file'));
    },
    '-f': () => {
      result.extraFiles.push(nextValue('-f'));
    },
  };

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--') {
      result.command = args.slice(i + 1);
      break;
    }

    const handler = handlers[arg];
    if (!handler) {
      die(`Unknown argument: ${arg}`);
    }

    handler();
  }

  return result;
}
//#endregion Argument parsing

// --- Main
//#region Main
const parsed = parseArgs(process.argv.slice(2));

if (!parsed.profile) {
  die('Required: --profile <name>');
}

const baseFiles = PROFILE_FILES[parsed.profile as string];
if (!baseFiles) {
  die(
    `Unknown profile: ${parsed.profile}. Run: bun run --silent with-env --help`,
  );
}

const envFiles: string[] = [...baseFiles];

appendIfExists(envFiles, `envs/.env.${parsed.profile}.local`);
appendIfExists(envFiles, 'envs/.env.local');

if (parsed.backend) {
  const backendName = BACKEND_NAMES[parsed.backend];
  if (!backendName) {
    die(
      `Unknown backend: ${parsed.backend} (expected: ${Object.keys(BACKEND_NAMES).join(', ')})`,
    );
  }
  process.env.BACKEND = backendName;
}

for (const f of parsed.extraFiles) {
  envFiles.push(f);
}

const resolvedFiles = envFiles.map(resolveRepoPath).filter(Boolean) as string[];
for (const filePath of resolvedFiles) {
  if (!fileExists(filePath)) {
    die(`Env file not found: ${filePath}`);
  }
}

if (!parsed.command.length) {
  die('Missing command. Use: -- <command> [args...]');
}

const envCmdBin = resolveEnvCmdBin();

const envCmdArgs: string[] = [];
for (const f of resolvedFiles) {
  envCmdArgs.push('-f', f);
}

envCmdArgs.push('--', ...parsed.command);

if (parsed.dryRun) {
  console.log(
    JSON.stringify(
      { envFiles: resolvedFiles, command: parsed.command },
      null,
      2,
    ),
  );
  process.exit(0);
}

const child = spawn(process.execPath, [envCmdBin, ...envCmdArgs], {
  stdio: 'inherit',
  env: process.env,
});

type ExitListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;
interface ChildWithOn {
  on(event: 'exit', listener: ExitListener): void;
}

(child as unknown as ChildWithOn).on(
  'exit',
  (code: number | null, signal: NodeJS.Signals | null) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  },
);

//#endregion Main
