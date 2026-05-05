import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { sleep } from '../shared/time.ts';
import { logStep, runCommand } from './common.ts';

/**
 * Detect and terminate any stale packaged backend processes that may block
 * resource cleanup during materialization.
 */
export async function stopStaleTauriBackendProcesses() {
  const staleProcesses =
    process.platform === 'win32'
      ? inspectWindowsStaleBackendProcesses()
      : inspectPosixStaleBackendProcesses();

  if (staleProcesses.length === 0) return;

  logStep(
    `Stopping ${staleProcesses.length} stale packaged backend process(es) before materializing the Tauri runtime`,
  );

  for (const { pid, commandLine } of staleProcesses) {
    logStep(`Stopping stale packaged backend process ${pid}: ${commandLine}`);
    try {
      if (process.platform === 'win32') {
        await runCommand('taskkill', ['/PID', pid, '/T', '/F']);
      } else {
        await terminatePosixProcess(Number(pid));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStep(
        `Ignoring stale backend shutdown failure for pid ${pid}: ${message}`,
      );
    }
  }

  await sleep(500);
}

// ---- Windows stale-process detection ----

function runWindowsPowerShell(script: string) {
  const shellArgs = ['-NoProfile', '-NonInteractive', '-Command', script];
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const shellCandidates = [
    join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    join(
      systemRoot,
      'Sysnative',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
    'powershell.exe',
    'powershell',
    'pwsh.exe',
    'pwsh',
  ];
  let lastError: NodeJS.ErrnoException | undefined;

  for (const shellCandidate of shellCandidates) {
    const result = spawnSync(shellCandidate, shellArgs, {
      encoding: 'utf8',
    });
    const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      lastError = result.error as NodeJS.ErrnoException;
      continue;
    }

    return result;
  }

  throw (
    lastError ?? new Error('Could not find a PowerShell executable on PATH.')
  );
}

function inspectWindowsStaleBackendProcesses() {
  const probe = runWindowsPowerShell(
    [
      "$legacyNodeSuffix = '\\dist\\tauri-shell\\resources\\backend-runtime\\main.js'",
      "$springSidecarSuffix = '\\apps\\tauri-shell\\src-tauri\\binaries\\spring-backend-'",
      "$nestSidecarSuffix = '\\apps\\tauri-shell\\src-tauri\\binaries\\nest-backend-'",
      "$expressSidecarSuffix = '\\apps\\tauri-shell\\src-tauri\\binaries\\express-backend-'",
      '$processes = Get-CimInstance Win32_Process | Where-Object { ' +
        '($_.Name -ieq \'node.exe\' -and $null -ne $_.CommandLine -and $_.CommandLine -like "*$legacyNodeSuffix*") -or ' +
        '($_.Name -like \'spring-backend-*.exe\' -and $null -ne $_.CommandLine -and $_.CommandLine -like "*$springSidecarSuffix*") -or ' +
        '($_.Name -like \'nest-backend-*.exe\' -and $null -ne $_.CommandLine -and $_.CommandLine -like "*$nestSidecarSuffix*") -or ' +
        '($_.Name -like \'express-backend-*.exe\' -and $null -ne $_.CommandLine -and $_.CommandLine -like "*$expressSidecarSuffix*") }',
      '$processes | ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }',
    ].join('; '),
  );

  if (probe.error) {
    throw probe.error;
  }

  if (probe.status !== 0) {
    const stderr = probe.stderr.trim();
    const stdout = probe.stdout.trim();
    throw new Error(
      `Failed to inspect stale Tauri backend processes.${stderr ? ` ${stderr}` : ''}${stdout ? ` ${stdout}` : ''}`,
    );
  }

  return probe.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, commandLine = ''] = line.split('\t');
      return {
        pid,
        commandLine,
      };
    });
}

// ---- POSIX stale-process detection ----

function inspectPosixStaleBackendProcesses() {
  const probe = spawnSync('ps', ['-ax', '-o', 'pid=', '-o', 'command='], {
    encoding: 'utf8',
  });

  if (probe.error) {
    throw probe.error;
  }

  if (probe.status !== 0) {
    const stderr = probe.stderr.trim();
    throw new Error(
      `Failed to inspect stale Tauri backend processes.${stderr ? ` ${stderr}` : ''}`,
    );
  }

  return probe.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/u);
      if (!match) {
        return null;
      }

      const [, pid, commandLine] = match;
      return { pid, commandLine };
    })
    .filter(
      (entry): entry is { pid: string; commandLine: string } =>
        entry !== null &&
        (entry.commandLine.includes(
          '/dist/tauri-shell/resources/backend-runtime/main.js',
        ) ||
          entry.commandLine.includes(
            '/apps/tauri-shell/src-tauri/binaries/spring-backend-',
          ) ||
          entry.commandLine.includes(
            '/apps/tauri-shell/src-tauri/binaries/nest-backend-',
          ) ||
          entry.commandLine.includes(
            '/apps/tauri-shell/src-tauri/binaries/express-backend-',
          )),
    );
}

// ---- POSIX process termination ----

async function terminatePosixProcess(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid process id ${String(pid)}.`);
  }

  if (!isProcessRunning(pid)) return;

  process.kill(pid, 'SIGTERM');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!isProcessRunning(pid)) {
      return;
    }

    await sleep(200);
  }

  if (isProcessRunning(pid)) {
    process.kill(pid, 'SIGKILL');
  }
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code !== 'ESRCH';
  }
}
