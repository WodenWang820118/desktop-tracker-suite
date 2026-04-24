export type DesktopTargetProfile = 'windows-x64' | 'linux-x64' | 'darwin-arm64';

export interface DesktopTargetInfo {
  profile: DesktopTargetProfile;
  rustTarget: string;
  hostPlatform: NodeJS.Platform;
  hostArch: NodeJS.Architecture;
  nodeBinaryName: string;
  nodeDistributionPath: string;
  nodeArchiveFileName: string | null;
  nodeArchiveEntryPath: string | null;
  nodeCacheFileName: string;
}

const TARGETS: Record<DesktopTargetProfile, DesktopTargetInfo> = {
  'windows-x64': {
    profile: 'windows-x64',
    rustTarget: 'x86_64-pc-windows-msvc',
    hostPlatform: 'win32',
    hostArch: 'x64',
    nodeBinaryName: 'node.exe',
    nodeDistributionPath: 'win-x64/node.exe',
    nodeArchiveFileName: null,
    nodeArchiveEntryPath: null,
    nodeCacheFileName: 'node-v24.11.1-win-x64.exe',
  },
  'linux-x64': {
    profile: 'linux-x64',
    rustTarget: 'x86_64-unknown-linux-gnu',
    hostPlatform: 'linux',
    hostArch: 'x64',
    nodeBinaryName: 'node',
    nodeDistributionPath: 'node-v24.11.1-linux-x64.tar.gz',
    nodeArchiveFileName: 'node-v24.11.1-linux-x64.tar.gz',
    nodeArchiveEntryPath: 'node-v24.11.1-linux-x64/bin/node',
    nodeCacheFileName: 'node-v24.11.1-linux-x64',
  },
  'darwin-arm64': {
    profile: 'darwin-arm64',
    rustTarget: 'aarch64-apple-darwin',
    hostPlatform: 'darwin',
    hostArch: 'arm64',
    nodeBinaryName: 'node',
    nodeDistributionPath: 'node-v24.11.1-darwin-arm64.tar.gz',
    nodeArchiveFileName: 'node-v24.11.1-darwin-arm64.tar.gz',
    nodeArchiveEntryPath: 'node-v24.11.1-darwin-arm64/bin/node',
    nodeCacheFileName: 'node-v24.11.1-darwin-arm64',
  },
};

const RUST_TARGET_TO_PROFILE: Record<string, DesktopTargetProfile> = Object.values(TARGETS).reduce(
  (accumulator, target) => {
    accumulator[target.rustTarget] = target.profile;
    return accumulator;
  },
  {} as Record<string, DesktopTargetProfile>,
);

export function getHostDesktopTargetProfile(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): DesktopTargetProfile {
  if (platform === 'win32' && arch === 'x64') {
    return 'windows-x64';
  }

  if (platform === 'linux' && arch === 'x64') {
    return 'linux-x64';
  }

  if (platform === 'darwin' && arch === 'arm64') {
    return 'darwin-arm64';
  }

  throw new Error(
    `Unsupported host platform for the Tauri desktop shell: ${platform}-${arch}. Supported hosts are win32-x64, linux-x64, and darwin-arm64.`,
  );
}

export function resolveDesktopTargetInfo(
  env: NodeJS.ProcessEnv = process.env,
): DesktopTargetInfo {
  const requestedProfile = parseDesktopTargetProfile(env.TAURI_DESKTOP_TARGET);
  const requestedRustTargetValue = resolveRequestedRustTargetValue(env);
  const requestedRustTarget = parseRustTargetProfile(requestedRustTargetValue);

  if (requestedProfile && requestedRustTarget && requestedProfile !== requestedRustTarget) {
    throw new Error(
      `TAURI_DESKTOP_TARGET (${requestedProfile}) does not match the requested Rust target (${requestedRustTargetValue}).`,
    );
  }

  const resolvedProfile =
    requestedProfile ?? requestedRustTarget ?? getHostDesktopTargetProfile();
  return TARGETS[resolvedProfile];
}

function resolveRequestedRustTargetValue(env: NodeJS.ProcessEnv) {
  const candidates = [
    env.TAURI_BUILD_TARGET,
    env.TAURI_RUST_TARGET,
    env.CARGO_BUILD_TARGET,
  ];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

export function assertHostCanBuildDesktopTarget(
  target: DesktopTargetInfo,
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
) {
  if (platform !== target.hostPlatform || arch !== target.hostArch) {
    throw new Error(
      `The ${target.profile} desktop target must be built on a matching native runner. Current host: ${platform}-${arch}. Expected host: ${target.hostPlatform}-${target.hostArch}.`,
    );
  }
}

export function parseDesktopTargetProfile(
  value: string | undefined,
): DesktopTargetProfile | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized in TARGETS) {
    return normalized as DesktopTargetProfile;
  }

  throw new Error(
    `Unsupported TAURI_DESKTOP_TARGET "${value}". Expected one of: windows-x64, linux-x64, darwin-arm64.`,
  );
}

export function parseRustTargetProfile(
  value: string | undefined,
): DesktopTargetProfile | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const resolvedProfile = RUST_TARGET_TO_PROFILE[normalized];
  if (resolvedProfile) {
    return resolvedProfile;
  }

  throw new Error(
    `Unsupported Rust target triple "${value}". Expected one of: ${Object.keys(
      RUST_TARGET_TO_PROFILE,
    ).join(', ')}.`,
  );
}
