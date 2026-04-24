import { existsSync } from 'node:fs';

export function resolveWindowsPowerShellPath(): string | null {
  if (process.platform !== 'win32') {
    return null;
  }

  const candidates = [
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
