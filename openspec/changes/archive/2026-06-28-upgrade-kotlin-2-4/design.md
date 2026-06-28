## Context

`backend-kotlin-jpa/build.gradle.kts` pins the Kotlin Gradle plugins (`kotlin("jvm")`, `kotlin("plugin.spring")`, `kotlin("plugin.jpa")`) to `2.1.0` and the Java toolchain to `JavaLanguageVersion.of(21)`. This was set during the original FastAPI→Kotlin migration and never revisited. The JDK pin is enforced redundantly by the Makefile's `check-java-version` target (fails fast with a clear message on JDK ≠ 21/22) and documented in `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` as a hard constraint, because Kotlin 2.1.0 does not support compiling on JDK 23+. CI (`.github/workflows/ci.yml`, `build-kotlin` job) provisions JDK 21 via `actions/setup-java` for the same reason.

Current stable Kotlin is 2.4.0. Kotlin 2.3.0 added Java 25 support and 2.4.0 added Java 26 support, so the JDK ceiling that motivated the pin no longer applies once Kotlin is upgraded. Spring Boot stays at `3.4.5` — the Kotlin Gradle plugin version is independent of the Spring Boot version, so this is a narrowly-scoped dependency bump, not a Spring Boot migration.

## Goals / Non-Goals

**Goals:**
- Upgrade Kotlin JVM/Spring/JPA Gradle plugins from `2.1.0` to `2.4.0`.
- Remove (or relax to a floor-only check) the JDK 21/22 ceiling in the Makefile's `check-java-version` target, since the underlying Kotlin-compiler limitation is gone.
- Confirm `./gradlew test` and `./gradlew bootJar` succeed unchanged in behavior, with all 12 existing test classes passing.
- Update documented JDK/Kotlin version constraints in `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` to match the new reality.

**Non-Goals:**
- Upgrading Spring Boot (stays at 3.4.5).
- Upgrading other dependencies (JJWT, OpenPDF, PDFBox, Apache POI, AWS SDK, etc.) unless a Kotlin 2.4.0 incompatibility forces it.
- Adopting any new Kotlin 2.2–2.4 language features (context parameters, guard conditions, etc.) in this change — that's separate follow-up work, not required for the upgrade itself.
- Changing the GraalVM native-image Dockerfile (`Dockerfile.native`) — it is not the active build path (`Dockerfile` uses the standard JVM jar) and is out of scope.
- Changing the production runtime image (`eclipse-temurin:21-jre-alpine`) — that's the *runtime* JRE, unrelated to the *build* JDK toolchain being relaxed here.

## Decisions

**Target Kotlin version: 2.4.0 (latest stable), not an intermediate version (2.2.x/2.3.x).**
Alternative considered: step incrementally (2.1.0 → 2.2.0 → 2.3.0 → 2.4.0) to isolate which release introduces a breaking change. Rejected for a project this size — a single jump to 2.4.0 plus a full test-suite run is sufficient; if it fails, bisecting via the Kotlin compatibility guides (`compatibility-guide-22.html`, `-23.html`, `-24.html`) is cheap to do after the fact rather than running three separate upgrade cycles up front.

**JDK toolchain: drop the upper ceiling, keep JDK 21 as the floor.**
`java.toolchain.languageVersion` stays at `21` (matches the CI/runtime image and avoids forcing every contributor to install a newer JDK), but the Makefile's `check-java-version` guard changes from "must be exactly 21 or 22" to "must be ≥ 21" (or is removed if Kotlin 2.4.0 + Gradle's toolchain auto-provisioning handles this transparently — to be confirmed during implementation by testing on a JDK 23+ host). This removes the documented Docker-only fallback for newer JDKs without forcing a runtime/image change.

**No Spring Boot version change.**
Bumping the Kotlin plugin version does not require a Spring Boot bump — Spring Boot 3.4.5 has no hard pin on a specific Kotlin compiler version (it only manages the Kotlin stdlib/reflect *library* versions, which are unaffected by the *plugin* version change). Confirmed by inspecting `build.gradle.kts`: the Spring Boot Gradle plugin and `io.spring.dependency-management` are declared independently of the `kotlin(...)` plugin block.

## Risks / Trade-offs

- **[Risk]** K2 compiler strictness changes across 2.2/2.3/2.4 (tightened type inference, deprecated API removals) could surface new compile errors in `Models.kt`, `Repositories.kt`, or service classes that relied on looser 2.1.0 behavior. → **Mitigation**: run `./gradlew compileKotlin` first in isolation before running the full test suite, to get fast feedback on compile-only breakage; consult the Kotlin compatibility guides for 2.2/2.3/2.4 if errors appear.
- **[Risk]** Relaxing `check-java-version` could let contributors build on an untested JDK (e.g., JDK 26) where Kotlin 2.4.0 itself has rough edges. → **Mitigation**: keep the floor check (≥21) rather than removing the guard entirely; document the verified/tested range in `CLAUDE.md` after manual confirmation.
- **[Risk]** GraalVM native-image build (`Dockerfile.native`, not the active path) could silently break with the new Kotlin version since it isn't covered by `make test`/`make build`. → **Mitigation**: out of scope per Non-Goals; flag in the PR description that `Dockerfile.native` was not validated.
- **[Trade-off]** Jumping straight to 2.4.0 instead of incrementally means any failure requires reading three releases' compatibility notes at once instead of one at a time. Accepted given low project size and the ability to bisect after the fact if needed.

## Migration Plan

1. Branch `chore/upgrade-kotlin-2.4` off `main`.
2. Bump plugin versions in `build.gradle.kts`, run `./gradlew compileKotlin` to isolate compile-only issues.
3. Run `make test` (full Testcontainers suite) and `make build` (bootJar).
4. Relax `check-java-version` in the Makefile; manually verify a build on a JDK 23+ host (or via the `eclipse-temurin` Docker compile container already used for the hot-swap workflow) to confirm the ceiling is actually gone.
5. Update `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` version/constraint references.
6. Push branch, open PR, confirm CI (`build-kotlin`, `build-docker` jobs) passes unchanged.
7. **Rollback**: revert the version bump commit(s) on the branch; no schema/data migration involved, so rollback is a pure code revert with no other side effects.

## Open Questions

- Does Kotlin 2.4.0 require a Gradle wrapper bump beyond the current `gradle-9.5.1-bin.zip`? To be confirmed during implementation (Gradle 9.5.1 is recent enough that this is unlikely, but worth checking the Kotlin 2.4.0 release notes' minimum-Gradle-version requirement).
- Should `check-java-version` be removed entirely (rely on Gradle's own toolchain resolution/errors) or kept as a friendlier floor-only check? Leaning toward keeping a floor-only check for a clearer error message, to be finalized during implementation.
