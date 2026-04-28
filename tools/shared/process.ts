import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

import { WORKSPACE_ROOT } from './workspace.ts';

type LogFunction = (message: string) => void;

export interface LoggedSpawnOptions extends SpawnOptions {
  log: LogFunction;
}

export interface RunCommandOptions extends SpawnOptions {
  log: LogFunction;
}

export interface RunCommandResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}

export class RunCommandError extends Error {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;

  constructor(input: {
    command: string;
    args: string[];
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
    stdout: string;
  }) {
    super(
      `${input.command} ${input.args.join(' ')} exited with code ${String(
        input.exitCode,
      )} and signal ${String(input.signal)}`,
    );
    this.name = 'RunCommandError';
    this.exitCode = input.exitCode;
    this.signal = input.signal;
    this.stderr = input.stderr;
    this.stdout = input.stdout;
  }
}

function shouldUseWindowsCmdShell(command: string): boolean {
  return process.platform === 'win32' && command.endsWith('.cmd');
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  const { log, ...spawnOptions } = options;
  log(`> ${command} ${args.join(' ')}`);

  return await new Promise<RunCommandResult>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: WORKSPACE_ROOT,
      shell: shouldUseWindowsCmdShell(command),
      ...spawnOptions,
    });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => stdoutChunks.push(chunk));
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => stderrChunks.push(chunk));

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      const stdout = stdoutChunks.join('');
      const stderr = stderrChunks.join('');

      if (code === 0) {
        resolvePromise({
          exitCode: code,
          signal,
          stderr,
          stdout,
        });
        return;
      }

      rejectPromise(
        new RunCommandError({
          args,
          command,
          exitCode: code,
          signal,
          stderr,
          stdout,
        }),
      );
    });
  });
}

export function spawnLogged(
  command: string,
  args: string[],
  options: LoggedSpawnOptions,
): ChildProcess {
  const { log, ...spawnOptions } = options;
  log(`> ${command} ${args.join(' ')}`);

  return spawn(command, args, {
    stdio: 'inherit',
    cwd: WORKSPACE_ROOT,
    shell: shouldUseWindowsCmdShell(command),
    ...spawnOptions,
  });
}

export async function terminateChildProcess(
  child: ChildProcess | undefined,
  label: string,
  options: RunCommandOptions,
): Promise<void> {
  if (!child || !child.pid || child.exitCode !== null) {
    return;
  }

  options.log(`stopping ${label} (pid ${child.pid})`);
  child.kill();

  const exited = await waitForExit(child, 5000);
  if (exited) {
    return;
  }

  if (process.platform === 'win32') {
    await runCommand('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      ...options,
      stdio: 'ignore',
      shell: true,
    });
    await waitForExit(child, 2000);
    return;
  }

  child.kill('SIGKILL');
  await waitForExit(child, 2000);
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) {
    return true;
  }

  return await new Promise<boolean>((resolvePromise) => {
    const timeout = setTimeout(() => resolvePromise(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise(true);
    });
  });
}
