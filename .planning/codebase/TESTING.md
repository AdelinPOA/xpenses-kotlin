# Testing

**Analysis Date:** 2026-08-04

## Frontend Test Stack

- Playwright is configured in `frontend/playwright.config.ts`.
- Tests live in `frontend/tests/` and cover auth, navigation, dashboard, expenses, reports, approvals, payments, inventory, insurance, categories, i18n, and profile flows.
- Projects exercise mobile, tablet, and desktop viewports; screenshots are stored under `frontend/tests/__snapshots__/`.
- CI enables retries and one worker; local runs use parallel workers and reuse an existing server.
- Frontend lint/build commands are defined in `frontend/package.json`.

## Backend Test Stack

- Gradle uses JUnit Platform through `tasks.withType<Test> { useJUnitPlatform() }`.
- Spring Boot starter test, Spring Security test, Testcontainers JUnit, and Testcontainers PostgreSQL are configured in `backend-kotlin-jpa/build.gradle.kts`.
- Existing tests are under `backend-kotlin-jpa/src/test/kotlin/`, including FX service and FX margins controller coverage.
- Current FX provider behavior is covered by `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/fx/FxRateProviderTest.kt`, while policy orchestration is covered by `FxServiceTest.kt`.
- Testcontainers is pinned through a BOM and Docker API compatibility is set by the Gradle test task.

## Repository Checks

- `frontend` provides `npm run lint`, `npm run build`, and `npm run i18n:check`.
- `scripts/check-i18n-parity.test.mjs` and related scripts validate repository-level behavior.
- Pre-commit runs whitespace/end-of-file cleanup and Ruff; the Ruff hook is legacy-oriented and should be checked before relying on it for Kotlin/TypeScript.

## Test Guidance

- For backend domain changes, add focused service/controller tests and use PostgreSQL Testcontainers where SQL/JPA behavior matters.
- For frontend route behavior, prefer Playwright tests with existing shared mocks in `frontend/tests/shared/mocks.ts`.
- For responsive changes, update the relevant screenshot spec deliberately and review generated snapshots.
- For translation changes, update both locale files and run the parity check.
- Do not treat a passing lint or unit test as coverage of concurrency, storage, security, or external-provider behavior; those areas need focused reproduction tests.

*Mapped from current repository state on 2026-08-04.*
