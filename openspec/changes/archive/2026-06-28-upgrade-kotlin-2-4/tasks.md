## 1. Branch setup

- [x] 1.1 Create branch `chore/upgrade-kotlin-2.4` off `main`

## 2. Bump Kotlin version

- [x] 2.1 Update `backend-kotlin-jpa/build.gradle.kts`: bump `kotlin("jvm")`, `kotlin("plugin.spring")`, `kotlin("plugin.jpa")` from `2.1.0` to `2.4.0`
- [x] 2.2 Check Kotlin 2.4.0 release notes for a minimum required Gradle version; bump `gradle/wrapper/gradle-wrapper.properties` if the current `9.5.1` distribution is below the minimum — confirmed minimum is Gradle 7.6.3, current wrapper (9.5.1) is well above it, no change needed
- [x] 2.3 Run `cd backend-kotlin-jpa && ./gradlew compileKotlin --no-daemon` to isolate any compile-only breakage from the version bump before running the full suite — BUILD SUCCESSFUL, only new K2 nullability warnings (Elvis-always-left-operand, unnecessary `!!`), no errors

## 3. Fix any K2 compiler breakage

- [x] 3.1 If `compileKotlin` fails, consult the Kotlin 2.2/2.3/2.4 compatibility guides for the specific error and fix the affected source file(s) — N/A, `compileKotlin` succeeded with no errors
- [x] 3.2 Re-run `./gradlew compileKotlin --no-daemon` until clean — already clean (BUILD SUCCESSFUL)
- [x] 3.3 Run `./gradlew compileTestKotlin --no-daemon` to catch test-source compile breakage separately — BUILD SUCCESSFUL, no errors

## 4. Verify full test suite and build

- [x] 4.1 Run `make test` (full JUnit/Testcontainers suite, requires Docker) — confirm all existing test classes pass — BUILD SUCCESSFUL, 12 test classes / 63 test cases pass
- [x] 4.2 Run `make build` (`./gradlew bootJar`) — confirm the jar builds successfully — BUILD SUCCESSFUL, `backend-kotlin-jpa-1.0.0-SNAPSHOT.jar` produced
- [x] 4.3 Run `make test-health` and `make test-login` against a locally running container to smoke-test the built artifact — the dev hot-swap mount in the long-running `xpenses-backend` container turned out to be stale/empty, so instead ran the freshly-built jar standalone on port 8081 against the same dev Postgres; health and login both succeeded, app started cleanly in ~18s including a pre-existing pending Flyway migration (V24, unrelated to this change)

## 5. Relax the JDK toolchain ceiling

- [x] 5.1 Update the Makefile's `check-java-version` target: change the check from "must be exactly 21 or 22" to "must be ≥ 21" — kept the guard (clearer error message than a raw Gradle toolchain failure) but loosened the upper bound
- [x] 5.2 Manually verify a build succeeds on a JDK 23+ host (or via the `eclipse-temurin` Docker compile container already used for the hot-swap workflow) to confirm Kotlin 2.4.0 actually lifts the ceiling — verified in an `eclipse-temurin:25-jdk-alpine` container with the toolchain temporarily pointed at JDK 25: `compileKotlin` BUILD SUCCESSFUL, confirming Kotlin 2.4.0 compiles cleanly on JDK 25 (the project's actual toolchain pin stays at 21, see 5.3)
- [x] 5.3 Confirm `java.toolchain.languageVersion` in `build.gradle.kts` stays at `21` (floor, matching CI and the runtime image) — confirmed unchanged, no problem revealed by 5.2

## 6. Update documentation

- [x] 6.1 Update `CLAUDE.md`: Kotlin Backend Stack table (`Language | Kotlin 2.1.0 / Java 21` → `2.4.0`), the JDK constraint bullet in "Build & Development Optimization" — other JDK 21 references (Build row, CI section) already correctly describe it as the floor/CI version, unchanged
- [x] 6.2 Apply the equivalent updates to `AGENTS.md` and `GEMINI.md` to keep all three instruction files consistent — updated `AGENTS.md`'s "JDK constraint" section, `make build` table row, hot-swap step, and removed the now-obsolete "Pre-hot-swap compile" quirk bullet (JDK 23+ no longer needs a container workaround); `GEMINI.md` has no Kotlin-version/JDK-constraint section, nothing to change there
- [x] 6.3 Update `README.md`'s JDK version section ("Local Development Requirements") if it restates the same 21/22 constraint — updated the JDK Version section, Backend Hot-Swapping section (removed the now-unneeded JDK 23+ container workaround), Tech Stack table, project-structure tree comment, and Backend Architecture intro sentence — all stale `Kotlin 2.1`/`JDK 21 or 22` references replaced

## 7. CI and PR

- [x] 7.1 Push the branch and open a PR — pushed `chore/upgrade-kotlin-2.4`, opened [#18](https://github.com/AdelinPOA/xpenses-kotlin/pull/18); CI jobs (`build-kotlin`, `build-docker`) pending confirmation on the PR
- [x] 7.2 Note in the PR description that `Dockerfile.native` (GraalVM, not the active build path) was not validated against the new Kotlin version, per the design doc's stated non-goal — included in the PR body's "Not validated" note
