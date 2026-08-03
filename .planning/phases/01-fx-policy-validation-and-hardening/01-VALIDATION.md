---
phase: 01
slug: fx-policy-validation-and-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-03
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for FX-01 through FX-05 and Plans 01-01 through 01-06.

---

## Test Infrastructure

| Property | Value |
|---|---|
| **Backend framework** | JUnit Platform, Spring Boot Test, Mockito, Testcontainers PostgreSQL, and Flyway via the existing Gradle build |
| **Backend config** | `backend-kotlin-jpa/build.gradle.kts`, `backend-kotlin-jpa/src/test/resources/application-test.yml` |
| **Frontend framework** | Playwright plus ESLint and the repository i18n parity check |
| **Frontend config** | `frontend/playwright.config.ts`, `frontend/eslint.config.mjs`, `frontend/package.json` |
| **Quick backend run** | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.services.FxServiceTest` |
| **Quick frontend run** | `cd frontend && npx playwright test tests/admin/settings.spec.ts` |
| **Full phase run** | `cd backend-kotlin-jpa && ./gradlew test && cd ../frontend && npm run lint && npm run i18n:check && npx playwright test` |
| **Estimated runtime** | Not yet measured; record focused and full durations on first execution instead of inventing a baseline |

## Automated Command Catalog

| Command ID | Scope | Automated command |
|---|---|---|
| `P01-STRUCTURE` | Plan 01-01 one-way gate | `node .codex/gsd-core/bin/gsd-tools.cjs query verify.plan-structure .planning/phases/01-fx-policy-validation-and-hardening/01-01-PLAN.md` |
| `P05-STRUCTURE` | Plan 01-05 one-way gate | `node .codex/gsd-core/bin/gsd-tools.cjs query verify.plan-structure .planning/phases/01-fx-policy-validation-and-hardening/01-05-PLAN.md` |
| `FX-CORE` | Dated provider and shared policy matrix | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.services.fx.FxRateProviderTest --tests eu.nt.xpenses.services.FxServiceTest` |
| `FX-SERVICE` | Shared matrix expansion | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.services.FxServiceTest` |
| `FX-MARGINS` | Atomic settings API | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.controllers.FxMarginsControllerTest` |
| `FX-UI-SERVER` | Browser server-error tracer | `cd frontend && npx playwright test tests/admin/settings.spec.ts --grep "FX margin server validation"` |
| `FX-UI` | Complete settings browser behavior | `cd frontend && npx playwright test tests/admin/settings.spec.ts` |
| `FX-ADVANCE` | Paid-advance workflow | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.controllers.AdvanceControllerTest` |
| `FX-EXPENSE` | Expense/manual-rate workflow | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.services.ExpenseServiceTest` |
| `FX-MILEAGE` | D-05 mileage identity/snapshot workflow | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.controllers.MileageControllerTest` |
| `FX-HISTORY-MIGRATE` | V29 fixtures through V30/V31 and cache cleanup | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.migrations.HistoricalFxMigrationRegressionTest.migrateV29FixturesThroughV31PurgesOnlyFxCache` |
| `FX-HISTORY-RELOAD` | Fresh-connection financial/report invariants | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.migrations.HistoricalFxMigrationRegressionTest.reloadedFinancialRowsAndReportTotalsRemainExact` |
| `BACKEND-FULL` | Full backend regression | `cd backend-kotlin-jpa && ./gradlew test` |
| `FRONTEND-FULL` | Full frontend static/browser regression | `cd frontend && npm run lint && npm run i18n:check && npx playwright test` |
| `PHASE-FULL` | All Phase 1 regression surfaces | `cd backend-kotlin-jpa && ./gradlew test && cd ../frontend && npm run lint && npm run i18n:check && npx playwright test` |

## Sampling Rate

- **After every task commit:** Run the task's focused command from the map below.
- **After Wave 1:** Run `FX-CORE`, `FX-MARGINS`, then `BACKEND-FULL`.
- **After Wave 2:** Run `FX-ADVANCE`, `FX-EXPENSE`, `FX-MILEAGE`, `FX-UI`, then both `BACKEND-FULL` and `FRONTEND-FULL`.
- **After Wave 3:** Run `FX-HISTORY-MIGRATE`, `FX-HISTORY-RELOAD`, then `PHASE-FULL`.
- **Before `$gsd-verify-work`:** `PHASE-FULL` must be green.
- **Max feedback latency:** Focused commands target less than 60 seconds on a warmed Gradle/browser environment. The required historical migration regression may exceed that only for PostgreSQL container startup; it must not be replaced with a shallower check.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure/Financial Behavior | Test Type | Focused Command | Full Command | File Exists | Status |
|---|---|---:|---|---|---|---|---|---|---|---|
| `01-01-01` | 01-01 | 1 | FX-05 | T-01-03 | V30 one-way decision gate is structurally blocking before migration work | plan gate | `P01-STRUCTURE` | `BACKEND-FULL` | ✅ | ⬜ pending |
| `01-01-02` | 01-01 | 1 | FX-04, FX-05 | T-01-01, T-01-03 | Requested/source dates are attributable and cache cleanup is business-row safe | integration/unit | `FX-CORE` | `BACKEND-FULL` | ❌ W0 provider test | ⬜ pending |
| `01-01-03` | 01-01 | 1 | FX-02, FX-03, FX-04 | T-01-01, T-01-02 | Complete ADR matrix, deterministic cache, no current quote for history | unit | `FX-SERVICE` | `BACKEND-FULL` | ✅ | ⬜ pending |
| `01-02-01` | 01-02 | 1 | FX-03 | T-01-04 | Mixed-invalid settings payload saves nothing and returns all fields | integration | `FX-MARGINS` | `BACKEND-FULL` | ✅ | ⬜ pending |
| `01-02-02` | 01-02 | 1 | FX-03 | T-01-04 | Key normalization, boundaries, wildcard, RON, and authorization hold | integration | `FX-MARGINS` | `BACKEND-FULL` | ✅ | ⬜ pending |
| `01-03-01` | 01-03 | 2 | FX-03 | T-01-08 | Server field error reaches the matching accessible input without data loss | browser | `FX-UI-SERVER` | `FRONTEND-FULL` | ✅ | ⬜ pending |
| `01-03-02` | 01-03 | 2 | FX-03 | T-01-07, T-01-09 | Invalid form sends zero PATCH requests; valid form sends one complete request | browser/static | `FX-UI` | `FRONTEND-FULL` | ✅ | ⬜ pending |
| `01-04-01` | 01-04 | 2 | FX-01, FX-02, FX-04, FX-05 | T-01-11, T-01-12 | Paid-advance resolver inputs and frozen stored values remain exact | integration | `FX-ADVANCE` | `BACKEND-FULL` | ✅ | ⬜ pending |
| `01-04-02` | 01-04 | 2 | FX-01, FX-04, FX-05 | T-01-10, T-01-12 | Manual expense rate precedence and edit preservation remain exact | unit | `FX-EXPENSE` | `BACKEND-FULL` | ✅ | ⬜ pending |
| `01-05-01` | 01-05 | 2 | FX-05 | T-01-14 | V31 one-way decision gate is structurally blocking before backfill work | plan gate | `P05-STRUCTURE` | `BACKEND-FULL` | ✅ | ⬜ pending |
| `01-05-02` | 01-05 | 2 | FX-01, FX-02, FX-04, FX-05 | T-01-13, T-01-14 | D-05 EUR identity snapshot uses UTC `start_time` date and leaves old totals intact | integration | `FX-MILEAGE` | `BACKEND-FULL` | ✅ | ⬜ pending |
| `01-05-03` | 01-05 | 2 | FX-01, FX-04, FX-05 | T-01-13, T-01-15 | Reads/unrelated edits reuse stored mileage snapshot; date changes re-resolve once | integration | `FX-MILEAGE` | `BACKEND-FULL` | ✅ | ⬜ pending |
| `01-06-01` | 01-06 | 3 | FX-01, FX-05 | T-01-16 | Posted fixtures survive actual V30/V31 execution while only FX cache is purged | migration integration | `FX-HISTORY-MIGRATE` | `BACKEND-FULL` | ❌ W0 | ⬜ pending |
| `01-06-02` | 01-06 | 3 | FX-05 | T-01-17, T-01-18 | Fresh reload preserves rates, EUR values, and stored/derived report totals | migration integration | `FX-HISTORY-RELOAD` | `BACKEND-FULL` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Requirement Coverage

| Requirement | Plans | Focused evidence | Full regression |
|---|---|---|---|
| FX-01 | 01-04, 01-05, 01-06 | `FX-ADVANCE`, `FX-EXPENSE`, `FX-MILEAGE`, `FX-HISTORY-MIGRATE` | `PHASE-FULL` |
| FX-02 | 01-01, 01-04, 01-05 | `FX-CORE`, `FX-SERVICE`, `FX-ADVANCE`, `FX-MILEAGE` | `PHASE-FULL` |
| FX-03 | 01-01, 01-02, 01-03 | `FX-SERVICE`, `FX-MARGINS`, `FX-UI-SERVER`, `FX-UI` | `PHASE-FULL` |
| FX-04 | 01-01, 01-04, 01-05 | `FX-CORE`, `FX-SERVICE`, `FX-ADVANCE`, `FX-EXPENSE`, `FX-MILEAGE` | `PHASE-FULL` |
| FX-05 | 01-01, 01-04, 01-05, 01-06 | `FX-CORE`, `FX-ADVANCE`, `FX-EXPENSE`, `FX-MILEAGE`, `FX-HISTORY-MIGRATE`, `FX-HISTORY-RELOAD` | `PHASE-FULL` |

## Wave 0 Requirements

- [ ] `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/fx/FxRateProviderTest.kt` — deterministic BNR/Frankfurter date fixtures created by 01-01 Task 2.
- [ ] `frontend/tests/shared/mocks.ts` — stateful FX margin GET/PATCH behavior added by 01-03 Task 1.
- [ ] `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt` — D-05 identity/snapshot cases added by 01-05 Tasks 2-3.
- [ ] `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/migrations/HistoricalFxMigrationRegressionTest.kt` — V29 fixtures, V30/V31 execution, reload assertions, and report-total invariants created by 01-06.

Existing Gradle/JUnit/Testcontainers/Flyway and Playwright infrastructure covers all phase requirements; no package installation is needed.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Authorize V30 cache-schema migration | FX-04, FX-05 | One-way data deletion requires the Plan 01-01 blocking decision checkpoint | Review the V30 scope in 01-01 Task 1 and resume with `proceed-v30` only if cache-only deletion is accepted. |
| Authorize V31 mileage snapshot migration | FX-01, FX-05 | One-way audited-column backfill requires the Plan 01-05 blocking decision checkpoint | Review the V31 scope in 01-05 Task 1 and resume with `proceed-v31` only if additive snapshot retention is accepted. |

All product behavior, including historical migration safety, has automated verification; only authorization to cross the two one-way migration doors is manual.

## Validation Sign-Off

- [x] Every implementation task has a focused automated command and a mapped full-suite command.
- [x] Both checkpoint tasks have deterministic structure checks and mapped post-gate full suites.
- [x] Sampling continuity has no three consecutive tasks without automated verification.
- [ ] Wave 0 planned test artifacts exist and pass.
- [x] No watch-mode flags are used.
- [ ] Focused and full command durations are measured during execution.
- [ ] `nyquist_compliant: true` is set after Wave 0 files exist and every mapped command is green.

**Approval:** pending
