## Why

The backend is pinned to Kotlin 2.1.0 (released Nov 2024); current stable is Kotlin 2.4.0. This gap forces a hard JDK 21/22 toolchain ceiling (`check-java-version` in the Makefile fails the build on JDK 23+), documented as a known annoyance in `CLAUDE.md`. Newer Kotlin releases have steadily extended host-JDK support (2.3.0 added Java 25, 2.4.0 added Java 26), so upgrading removes that ceiling, picks up K2 compiler fixes/perf improvements accumulated across three releases, and lets contributors build on a modern JDK without the Docker workaround.

## What Changes

- Bump the Kotlin Gradle plugin versions (`kotlin("jvm")`, `kotlin("plugin.spring")`, `kotlin("plugin.jpa")`) in `backend-kotlin-jpa/build.gradle.kts` from `2.1.0` to `2.4.0`.
- Relax the `java.toolchain.languageVersion` pin (currently locked to `21`) to allow a newer JDK (target: 21 as the floor, no upper ceiling forced by Kotlin) and update/relax the `check-java-version` Makefile guard accordingly.
- Re-run the full JUnit/Testcontainers suite and `bootJar` build to catch any K2-compiler strictness changes introduced between 2.2–2.4 (stricter null-safety/inference checks, deprecated API removals) and fix any resulting compile errors or warnings.
- Update the JDK/Kotlin version references in `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` (Kotlin Backend Stack table, JDK constraint notes) to reflect the new version once verified.
- Spring Boot stays at `3.4.5` — this change does not touch the Spring Boot or any other dependency version, only the Kotlin compiler/plugin version.

No API behavior, database schema, or user-facing functionality changes as part of this change.

## Capabilities

### New Capabilities
None — this is a build-toolchain/dependency upgrade, not a new product capability.

### Modified Capabilities
None — no spec-level (user-facing requirement) behavior changes. Existing specs under `openspec/specs/` are unaffected.

## Impact

- **Affected files**: `backend-kotlin-jpa/build.gradle.kts` (plugin versions, toolchain config), `Makefile` (`check-java-version` target), `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` (documented JDK/Kotlin version constraints).
- **Affected systems**: Local dev builds, CI (`build-kotlin` job in `.github/workflows/ci.yml`, currently pinned to JDK 21 via `actions/setup-java`), Docker image build (`eclipse-temurin:21-jre-alpine` runtime — unaffected since it's the *runtime* JRE, not the build JDK).
- **Risk**: Low-to-moderate. Kotlin 2.x releases are generally backward compatible, but K2 compiler strictness has tightened over time (e.g., changed inference for some generic/variance cases) — full test suite + build verification is required before merging.
- **Branch**: `chore/upgrade-kotlin-2.4`, per the project's branch policy (no direct commits to `main`).
