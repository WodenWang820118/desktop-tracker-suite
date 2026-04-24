/*
  Build a minimal Java runtime image for the Spring backend.

  Why:
  - Shipping a full JDK inside a desktop bundle is huge and OS-specific.
  - In CI we can install JDK 25, then generate a small runtime image via jdeps+jlink.

  Output:
  - dist/java-runtime/<image>/bin/java (folder name is stable: "runtime")
  - The desktop bundler should include ./dist/java-runtime as an extra resource (it becomes resources/java-runtime).

  Notes:
  - Requires a JDK (not just a JRE) because it uses jdeps and jlink.
  - Requires the Spring fat jar to exist at dist/spring-backend/app.jar.
*/

//#region Imports
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
//#endregion

//#region Helpers
function run(bin: string, args: string[], cwd?: string): string {
  const out = execFileSync(bin, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  return out.toString('utf8').trim();
}

function getJavaHome(): string {
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) {
    return '';
  }
  return javaHome;
}

function getBin(javaHome: string, toolName: 'jdeps' | 'jlink'): string {
  const exe = process.platform === 'win32' ? `${toolName}.exe` : toolName;
  return join(javaHome, 'bin', exe);
}

function hasJlinkTools(javaHome: string): boolean {
  if (!javaHome) return false;
  return (
    existsSync(getBin(javaHome, 'jdeps')) &&
    existsSync(getBin(javaHome, 'jlink'))
  );
}

function ensureJarExists(jarPath: string): void {
  if (!existsSync(jarPath)) {
    throw new Error(
      `Spring jar not found at ${jarPath}. Build it first (e.g. mvn package + tools/prepare-spring-dist.ts).`,
    );
  }
}

function normalizeModuleDeps(raw: string): string {
  const deps = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const set = new Set(deps);

  // A small baseline of commonly required modules for Spring Boot desktop packaging.
  // This makes the runtime slightly larger but avoids "missing module" surprises.
  const safeBaseline: string[] = [
    'java.base',
    'java.logging',
    'java.management',
    'java.naming',
    'java.sql',
    'java.xml',
    'java.instrument',
    // If any HTTPS / TLS stack needs EC crypto providers.
    'jdk.crypto.ec',
    // Occasionally required by libraries using sun.misc.Unsafe / internal APIs.
    'jdk.unsupported',
    // Useful for reading JARs as a filesystem in some frameworks/tools.
    'jdk.zipfs',
  ];
  for (const m of safeBaseline) set.add(m);

  // If jdeps couldn't determine dependencies (rare, but can happen), keep baseline.
  if (set.size === 0) {
    for (const m of safeBaseline) set.add(m);
  }

  return Array.from(set).sort().join(',');
}

function tryResolveExistingJavaHome(baseDir: string): string | undefined {
  if (!existsSync(baseDir)) return undefined;

  const hasTools = (javaHome: string) => hasJlinkTools(javaHome);

  try {
    const level1 = readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(baseDir, d.name));

    for (const p1 of level1) {
      if (hasTools(p1)) return p1;
      try {
        const level2 = readdirSync(p1, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => join(p1, d.name));
        for (const p2 of level2) {
          if (hasTools(p2)) return p2;
        }
      } catch {
        // ignore per-folder read errors
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveToolJavaHome(): string {
  const envJavaHome = getJavaHome();
  if (hasJlinkTools(envJavaHome)) return envJavaHome;

  const repoJavaRuntimeRoot = resolve('java-runtime');
  const repoJavaHome = tryResolveExistingJavaHome(repoJavaRuntimeRoot);
  if (repoJavaHome && hasJlinkTools(repoJavaHome)) return repoJavaHome;

  throw new Error(
    'Unable to locate jdeps/jlink toolchain. ' +
      'Set JAVA_HOME to a JDK 25 installation, or place a JDK 25 under ./java-runtime/ (ignored by git).',
  );
}
//#endregion

//#region Main
export function main(): void {
  const jarPath = resolve('dist/spring-backend/app.jar');
  ensureJarExists(jarPath);

  // Unified behavior for CI and local:
  // always generate a minimal runtime image using jdeps + jlink.
  const javaHome = resolveToolJavaHome();

  const outRoot = resolve('dist/java-runtime');
  const outImage = join(outRoot, 'runtime');

  if (existsSync(outRoot)) {
    rmSync(outRoot, { recursive: true, force: true });
  }
  mkdirSync(outRoot, { recursive: true });

  const jdeps = getBin(javaHome, 'jdeps');
  const jlink = getBin(javaHome, 'jlink');

  // Compute module deps from the fat jar.
  // --ignore-missing-deps avoids failing on optional/reflective uses.
  const rawDeps = run(jdeps, [
    '--multi-release',
    '25',
    '--ignore-missing-deps',
    '--recursive',
    '--print-module-deps',
    jarPath,
  ]);
  const moduleDeps = normalizeModuleDeps(rawDeps);

  // Build runtime image.
  // --strip-debug / --no-man-pages / --no-header-files reduce size.
  run(jlink, [
    '--add-modules',
    moduleDeps,
    '--strip-debug',
    '--no-man-pages',
    '--no-header-files',
    '--compress=2',
    '--output',
    outImage,
  ]);

  console.log(`Java runtime image created at: ${outImage}`);
  console.log(`Modules: ${moduleDeps}`);
}

main();
//#endregion
