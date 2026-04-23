# GraalVM Desktop Feasibility PoC

## Outcome

Windows-only execution is complete for all three comparison points:

1. Current Tauri desktop runtime with packaged Nest + Node
2. Standalone Spring Boot native executable built with GraalVM
3. Tauri desktop runtime packaged with the Spring native executable

The PoC is a mixed result:

- `spring-backend` now builds and boots as a GraalVM native Windows executable.
- The Tauri shell can launch either the existing Nest+Node packaged runtime or the Spring native runtime from additive packaging paths.
- Unpacked desktop runtime resources got materially smaller with Spring native.
- The packaged Windows installer got materially larger with Spring native.

Recommendation: do **not** migrate the desktop shell from Nest+Node to Spring+GraalVM based on the current Windows packaging result. Keep this work as a feasibility branch and, if desired, reuse the GraalVM path only for standalone Spring distribution experiments.

## What Changed

### Spring native path

- Reworked `apps/spring-backend` away from the JPA/Hibernate path used by the jar build and onto a JDBC-based runtime path that is compatible with Spring AOT/native image generation.
- Added a `native` Maven profile using `org.graalvm.buildtools:native-maven-plugin`.
- Added runtime descriptor/configuration code so the backend can consistently choose packaged SQLite or fallback H2 without depending on JVM-only assumptions.
- Added focused tests around runtime resolution, startup diagnostics, and SQLite persistence.

### Desktop PoC path

- Added an additive Spring-native Tauri resource layout under `dist/tauri-shell-spring-native/resources`.
- Added Rust-side packaged runtime metadata handling so the Tauri shell can launch either:
  - `node main.js` for the existing packaged Nest runtime
  - `spring-backend.exe` directly for the native PoC runtime
- Added Windows feasibility scripts for:
  - baseline packaged-runtime measurement
  - standalone Spring-native smoke/measurement
  - packaged Spring-native runtime measurement
  - bundle artifact measurement

### Packaging blocker isolated

The repo's existing baseline Tauri package flow was blocked by updater bundle configuration requiring a `pubkey`. To keep the evaluation additive and avoid changing dev/build behavior, the PoC adds `apps/tauri-shell/src-tauri/tauri.package.conf.json` for baseline packaging only. It disables updater artifact generation during the feasibility package run.

## Measured Results

Metrics snapshots:

- `dist/feasibility/graalvm-desktop/windows/desktop-baseline.json`
- `dist/feasibility/graalvm-desktop/windows/spring-native-standalone.json`
- `dist/feasibility/graalvm-desktop/windows/desktop-spring-native.json`
- `dist/feasibility/graalvm-desktop/windows/desktop-baseline-package.json`
- `dist/feasibility/graalvm-desktop/windows/desktop-spring-native-package.json`

### Comparison Matrix

| Scenario | Runtime payload | Windows installer | Health-ready | CRUD smoke | Result |
| --- | ---: | ---: | ---: | --- | --- |
| Nest + Node packaged runtime | 153.41 MB | 35.73 MB | 1043 ms | Pass | Baseline |
| Spring native standalone | 100.15 MB | n/a | 1068 ms | Pass | Works |
| Spring native packaged in Tauri | 100.15 MB | 66.20 MB | 1036 ms | Pass | Works, but installer larger |

### Delta Summary

- Packaged runtime payload dropped from `153,409,033` bytes to `100,151,419` bytes.
  - Improvement: `-53,257,614` bytes (`-34.7%`)
- Standalone Spring native payload (`exe + companion dll`) is `100,147,072` bytes.
  - Effectively the same payload size as the Tauri Spring-native packaged runtime
- Windows installer size increased from `35,729,485` bytes to `66,196,249` bytes.
  - Regression: `+30,466,764` bytes (`+85.3%`)
- Health-ready time was effectively flat across all runs.
  - Baseline Nest + Node: `1043 ms`
  - Standalone Spring native: `1068 ms`
  - Packaged Spring native: `1036 ms`

### Interpretation

The current PoC clears the "can it work?" bar but fails the "should we migrate desktop for size?" bar.

- If the goal is **unpacked runtime footprint**, Spring native is clearly better on Windows.
- If the goal is **downloaded installer size**, Spring native is worse in the current setup.
- If the goal is **cold-start improvement**, there is no meaningful win in this repo's current desktop shape.

Inference from the measured outputs: the Nest+Node resource tree compresses much better inside the NSIS installer than the large native executable + companion libraries do, so the installer result reverses the raw payload win.

## Go / No-Go

Default threshold from the plan:

- require at least `20%` Windows packaged-size reduction
- keep smoke behavior stable
- find no unacceptable three-platform blocker

Result:

- Smoke stability: **pass**
- Windows packaged-size reduction: **fail**
  - installer became `85.3%` larger instead of shrinking
- Three-platform risk: **medium to high**

Decision: **No-go for desktop migration right now.**

## Cross-Platform Analysis

This section is design/risk analysis only. It was not executed in this PoC.

### Windows

- Native Image builds are platform-specific and default to the host OS/architecture pair, which matches the repo assumption that Windows binaries should be built on Windows runners.
- GraalVM Native Image on Windows requires the local MSVC toolchain.
- Tauri Windows installers are produced as `.msi` or NSIS `-setup.exe`; this PoC used NSIS output.

Implication for CI:

- Keep a native Windows runner for the Spring native image build and Tauri packaging step.

### macOS

- GraalVM Native Image is available on macOS and still follows the host-architecture model, so the safest assumption is one native macOS build per macOS target.
- Tauri distribution outside the App Store requires code signing and notarization.
- Tauri's macOS signing flow requires:
  - an Apple Developer account
  - an Apple device/running macOS for signing
  - signing identity / certificate handling
  - notarization credentials for Developer ID distribution
- The current repo target mapping only models `darwin-arm64`, so Intel macOS output would need additional target support if that distribution still matters.

Implication for CI:

- Use native macOS runners.
- Budget for Apple certificate management and notarization secrets.
- Expect higher operational complexity than the current Windows PoC.

### Linux

- GraalVM Native Image on Linux depends on the local C toolchain and system headers.
- Tauri Linux packaging requires distro-specific system dependencies such as `webkit2gtk`, OpenSSL, and related desktop libraries.
- Tauri's Debian/AppImage guidance warns that glibc compatibility is tied to the build environment, so Linux bundles should be built on the oldest base system the app intends to support.
- Because of that glibc constraint, Linux needs deliberate runner/container selection rather than a casual "latest Ubuntu" default.

Implication for CI:

- Use a Linux runner or container pinned to the oldest supported distro baseline.
- Expect separate effort to line up GraalVM prerequisites and Tauri desktop package prerequisites on that image.

## Risks And Follow-Up

### Observed technical risks

- The packaged Spring native executable logs a runtime warning from SQLite native loading:
  - `System::load` was called and the process warns to use `--enable-native-access=ALL-UNNAMED`
- Native Image build output reported Java deserialization in the produced binary.
- Native Image builds are heavy:
  - observed peak RSS during Windows builds was roughly `6.5 GB` to `8.0 GB`
  - build time was roughly `2` to `2.5` minutes for the Spring backend native image alone

### If this work continues

- Investigate whether the SQLite warning should be addressed via explicit native-access settings for future JDK/GraalVM compatibility.
- Validate whether size can be improved with profile-guided optimization or different bundle/compression strategies, but do not assume that will recover the `85%` installer regression.
- Only consider a broader desktop migration if a later iteration improves the actual installer artifact, not just the unpacked runtime payload.

## Verification Run List

- `mvn -f pom.xml test`
- `pnpm run build-spring-native`
- `pnpm run smoke-spring-native`
- `pnpm run desktop:materialize-runtime`
- `pnpm run desktop:measure-baseline`
- `pnpm run desktop:materialize-spring-native-runtime`
- `pnpm run desktop:measure-spring-native`
- `pnpm run desktop:build:spring-native`
- `pnpm run desktop:package`
- `pnpm run desktop:measure-package`
- `pnpm run desktop:package:spring-native`
- `pnpm run desktop:measure-package:spring-native`

## References

- GraalVM Native Image docs: https://www.graalvm.org/latest/reference-manual/native-image/
- GraalVM Native Image build options: https://www.graalvm.org/dev/reference-manual/native-image/overview/BuildOptions/
- Tauri distribute overview: https://v2.tauri.app/distribute/
- Tauri Windows installer docs: https://v2.tauri.app/distribute/windows-installer/
- Tauri macOS signing/notarization docs: https://v2.tauri.app/ko/distribute/sign/macos/
- Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
- Tauri Debian packaging docs: https://v2.tauri.app/distribute/debian/
