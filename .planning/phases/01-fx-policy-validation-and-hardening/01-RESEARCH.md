# Phase 1: FX Policy Validation and Hardening - Research

**Researched:** 2026-08-03  
**Domain:** Kotlin/Spring Boot financial FX resolution, persistence, and Next.js settings validation  
**Confidence:** HIGH for the current codebase; MEDIUM for provider/API contracts

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Fallback-date cache semantics
- **D-01:** When a fallback provider supplies a rate for a requested expense date, persist the actual provider/source date rather than representing the rate as if it came from the requested date.

### FX settings validation
- **D-02:** Validate `fx_margins` updates atomically. If any currency or margin entry is invalid, reject the entire update with clear field-specific validation errors and leave the existing configuration unchanged.

### Cross-workflow verification
- **D-03:** Build comprehensive conversion-matrix coverage in `FxService`, plus focused workflow tests for expenses, advances, and mileage proving each uses the shared policy and stores the resolved rate correctly. Do not duplicate the full matrix in every workflow.

### Historical and manual-rate safeguards
- **D-04:** Use automated regression tests and migration/cache-cleanup safety checks. Posted records must retain their frozen rate and EUR total after relevant maintenance paths, while manual rate overrides must continue to take precedence.

### Mileage FX semantics
- **D-05:** Mileage reimbursement remains EUR-denominated under the existing EUR/km product semantics. Mileage uses `FxService` through the EUR identity path, derives its business date as the UTC calendar date of `start_time`, persists an FX snapshot, and does not add a foreign-currency mileage setting.

### the agent's Discretion
- Exact test fixture builders, assertion organization, error-message wording, and the implementation mechanism used to persist the provider's actual source date remain open to the researcher and planner, provided D-01 through D-05 hold.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within the phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research support |
|---|---|---|
| FX-01 | One policy across expenses, advances, mileage | `ExpenseService` and `AdvanceController` call `FxService`; per D-05, mileage closes its compliance gap by calling the same service with `EUR` and the UTC calendar date of `start_time`, then persisting the identity-rate snapshot. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt:84-105`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AdvanceController.kt:101-130`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt:29-94`] |
| FX-02 | BNR + source-leg margin and fallback | Centralize the full matrix in `FxService`; retain its BNR calculation, repair source-date propagation, and remove the historical `latest` substitution path. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:119-145`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:189-238`] |
| FX-03 | Configurable `fx_margins` | Keep the existing authenticated PATCH/UI seam, validate the complete payload before its only save, and return structured field errors. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt:121-155`; `frontend/app/admin/settings/SettingsClient.tsx:81-115`] |
| FX-04 | Expense-date lock plus banking-day fallback | Make a resolution carry both requested and provider dates; cache by requested date while persisting the published source date. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:53-89`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:127-145`] |
| FX-05 | Frozen history | Limit cleanup/migration writes to `fx_rates`; regression-test stored financial fields through posted lifecycle paths and manual overrides. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt:61-66`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/Expense.kt:33-58`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt:55-63,166-183`] |
</phase_requirements>

## Summary

The safest implementation is a small FX-resolution result at the `FxService` boundary: retain the requested date as the cache lookup key and persist a separate actual source/publication date on each cache row. BNR parsing already identifies the selected banking-day date but returns only a number; the Frankfurter call parses only `rates.EUR` and drops provider metadata. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:127-145`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:151-183`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:195-209`] Frankfurter’s current documented v2 responses include a `date` field, making it suitable for D-01 when its supported response shape is adopted. [CITED: https://frankfurter.dev/] D-05 resolves the mileage ambiguity: mileage remains EUR/km, resolves `EUR` through `FxService` using the UTC date of `start_time`, and stores an identity-rate snapshot without introducing foreign-currency configuration.

No new dependencies are required. The backend already has Spring Validation, Flyway, JUnit, Mockito, and Testcontainers; the frontend already has TanStack Query and Playwright. [VERIFIED: `backend-kotlin-jpa/build.gradle.kts:23-43,67-95`; `frontend/package.json`] The plan should lead with deterministic unit tests by extracting/injecting the HTTP provider seam, not by relying on the current FX test that calls real endpoints. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:31-37`; `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt:81-92`]

**Primary recommendation:** Introduce a provider-backed `ResolvedFxRate(rate, sourceDate)` result, add a `source_date` cache column while retaining requested `rate_date`, purge only stale cache rows in a Flyway migration, and add narrow workflow tests around the one shared resolver.

## Architectural Responsibility Map

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| Rate policy, provider fallback, source-date selection | API / Backend | Database / Storage | `FxService` owns provider calls and the JPA cache. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:25-89`] |
| Margin configuration and all-or-nothing update | API / Backend | Browser / Client | Controller owns authorization/persistence; the client owns local numeric feedback and query invalidation. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt:121-155`; `frontend/app/admin/settings/SettingsClient.tsx:81-115`] |
| Frozen financial totals | Database / Storage | API / Backend | Expenses and advances persist original amount, EUR total, and FX rate; lifecycle transitions use stored totals. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/Expense.kt:33-58`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/AdvancePayment.kt:24-42`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt:55-63`] |
| Mileage policy compliance | API / Backend | Database / Storage | Per D-05, mileage preserves EUR/km semantics, calls the shared resolver with `EUR` and UTC `start_time` date, and persists native amount/currency/rate attribution; no foreign-currency setting belongs in this tier. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/MileageRecord.kt:24-61`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordCreate.kt:8-15`] |

## Standard Stack

Use the existing Spring Boot 3.4.5/Kotlin 2.4.0/Flyway stack and existing JUnit/Mockito/Testcontainers/Playwright test stack; install nothing. [VERIFIED: `backend-kotlin-jpa/build.gradle.kts:1-7,23-43,67-95`; `frontend/package.json`]

## Architecture Patterns

### Recommended data flow

`expense / paid advance` → `FxService.resolve(currency, requestedDate)` → cache hit **or** BNR → Frankfurter fallback → `{ rate, requestedDate, sourceDate }` → persist cache → persist frozen workflow fields. `mileage` follows the same entry point with `currency=EUR` and `requestedDate=start_time.atZone(UTC).toLocalDate()`, then persists its identity-rate snapshot alongside the EUR reimbursement amount per D-05. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:47-89`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt:71-94`]

### Pattern 1: Separate requested date from source date

**Use:** Keep `rate_date` as the requested-date cache key and add `source_date` for the provider’s actual banking/publication date. The current uniqueness constraint is exactly the requested lookup key, so replacing it with the fallback date would cause repeated weekend/holiday fetches. [VERIFIED: `backend-kotlin-jpa/src/main/resources/db/migration/V1__init.sql:75-83`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/FxRateRepository.kt:8-13`]

```kotlin
// Recommended phase-local seam; no new library.
data class ResolvedFxRate(
    val rate: BigDecimal,
    val sourceDate: LocalDate,
)
```

**Implementation:** Have BNR return the `Pair` date it already selected; consume Frankfurter’s documented response date; make the unsupported secondary fallback fail rather than call its `latest` endpoint when an attributable historical date cannot be proven. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:130-145,224-229`] [CITED: https://frankfurter.dev/]

### Pattern 2: Validate all settings before the single persistence write

`updateFxMargins` is already `@Transactional`, performs its only repository save after the loops, and throws `ResponseStatusException` for invalid values. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt:126-154`] Spring rolls a declarative transaction back by default for unchecked exceptions, which covers this exception class; preserve that order and build an error map before throwing. [CITED: https://docs.spring.io/spring-framework/reference/6.2/data-access/transaction/declarative/rolling-back.html]

Return field-specific errors from the existing `@RestControllerAdvice`, which currently serializes one `detail` string for validation and status exceptions. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/ValidationExceptionHandler.kt:19-28,56-59`]

### Pattern 3: Freeze values at workflow write time

Expense create/update multiplies the resolved rate into `amountEur` and persists the rate; a provided manual rate bypasses `FxService`. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt:84-105,177-205`] Paid advances follow the same multiplication/persistence shape. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AdvanceController.kt:101-130,161-188,263-283`]

## Don’t Hand-Roll

| Problem | Do not build | Use instead | Why |
|---|---|---|---|
| Transaction rollback | Custom compensating update/delete logic | Existing Spring `@Transactional` boundary | Runtime exceptions trigger the established rollback behavior. [CITED: https://docs.spring.io/spring-framework/reference/6.2/data-access/transaction/declarative/rolling-back.html] |
| Schema evolution | Startup-only ad-hoc SQL | Flyway migration | Flyway is the established schema mechanism. [VERIFIED: `backend-kotlin-jpa/build.gradle.kts:29,43`] |
| Provider-date cache semantics | A date guessed from the request or `latest` response | Provider response metadata plus a cache `source_date` column | D-01 requires an attributable actual source date. [CITED: https://frankfurter.dev/] |

## Common Pitfalls

1. **Dropping the fallback publication date.** `fetchBnr` selects a prior banking-day pair and then discards its date; `fetchFrankfurter` discards response metadata. Preserve the source date alongside the numeric rate. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:130-145,195-209`]

2. **Using current data for a historical receipt.** `fetchFallback` retries against a URL containing `latest`; this can violate FX-04 and can never satisfy D-01 without an independently supplied source date. Remove this path from date-locked resolution. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:212-237`]

3. **Inverting the stored conversion rate.** `getRate` documents/source-calculates source-currency→EUR and all workflows multiply it, while unused `convert` divides by it. Either correct or remove `convert` and add a direct unit test before any caller uses it. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:92-97,119-145`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt:104-105`] 

4. **False mileage compliance.** Do not treat direct EUR arithmetic or a controller constant as shared-policy use. Per D-05, call `FxService.getRate("EUR", utcStartDate)`, persist the resulting identity-rate snapshot, and keep the existing EUR/km setting unchanged. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordCreate.kt:8-15`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/MileageRecord.kt:30-49`]

5. **UI tests never resolve the FX query.** `SettingsClient` always requests `/settings/fx-margins`, but `setupAdminMocks` currently mocks mileage and allowance settings without that route. Add the GET/PATCH mock and assert the invalid-save state. [VERIFIED: `frontend/app/admin/settings/SettingsClient.tsx:32-37,81-115`; `frontend/tests/shared/mocks.ts:169-206`] 

## Code and Test Seams

- **Matrix unit tests:** extend `FxServiceTest`, but first inject/extract the HTTP provider seam because the service creates a private `RestClient`; tests must provide fixtures for BNR cube dates and Frankfurter response dates rather than call the network. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:31-37,151-183`; `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt:15-27,81-92`]
- **Expense/manual override:** extend `ExpenseServiceTest` tests that already verify a manual rate skips `getRate` and persisted values are multiplied. [VERIFIED: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/ExpenseServiceTest.kt:161-205,208-251`]
- **Advance:** extend `AdvanceControllerTest` with a paid advance and payment of a requested advance, verifying the mocked shared resolver arguments and stored response fields. Existing integration base already supplies `@MockitoBean FxService`. [VERIFIED: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AdvanceControllerTest.kt:12-83`; `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt:66-90`]
- **Mileage:** add a focused controller/integration test for D-05: EUR identity resolution, UTC `start_time` business date, persisted snapshot, and no re-resolution on reads or unrelated edits. Current tests cover CRUD and date ordering only. [VERIFIED: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt:39-137`]
- **Settings:** extend `FxMarginsControllerTest` with a mixed-valid/invalid payload and a follow-up GET proving no persisted partial update; extend the Playwright mock/spec for field feedback. [VERIFIED: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/FxMarginsControllerTest.kt:27-96`; `frontend/tests/admin/settings.spec.ts:9-35`]
- **Historical safety:** create posted expense/paid-advance fixtures with non-default rates and EUR totals, execute the cache cleanup/migration-equivalent maintenance path, then reload and compare unchanged financial columns. Lifecycle transitions only update statuses/timestamps and report totals from stored expense EUR values. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt:55-63,107-114,177-183`]

## Runtime State Inventory

| Category | Items found | Action required |
|---|---|---|
| Stored data | `fx_rates` is a standalone cache table; financial FX values reside on `expenses` and `advance_payments`. [VERIFIED: `backend-kotlin-jpa/src/main/resources/db/migration/V1__init.sql:75-83,93-112`] | Add source-date schema through Flyway; clear only `fx_rates`. |
| Live service config | `fx_margins` and the `fx_source` sentinel are `app_settings` entries. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt:56-66`; `backend-kotlin-jpa/src/main/resources/db/migration/V1__init.sql:132-136`] | Preserve `fx_margins`; supersede the one-time cache marker only through a reviewed migration/maintenance path. |
| OS-registered state | None identified; the phase changes no service registration. [VERIFIED: repository inspection of phase-relevant code paths] | None. |
| Secrets/env vars | None identified for FX providers; URLs are hard-coded service integrations. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:132-133,198,216-229`] | None. |
| Build artifacts | Testcontainers starts PostgreSQL during integration tests. [VERIFIED: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt:38-57`] | Ensure Docker daemon access before integration validation. |

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Java | Gradle backend tests | ✓ | `openjdk 21.0.11` [VERIFIED: local probe] | — |
| Node/npm | frontend lint/Playwright | ✓ | Node `v22.23.1`, npm `10.9.8` [VERIFIED: local probe] | — |
| Docker daemon | Testcontainers backend integration tests | ✓ | Docker Engine `29.6.2` [VERIFIED: local probe] | Unit tests do not need Docker. |

## Validation Architecture

| Property | Value |
|---|---|
| Backend framework | JUnit Platform with Spring Boot Test, Mockito, and Testcontainers. [VERIFIED: `backend-kotlin-jpa/build.gradle.kts:67-95`] |
| Backend focused command | `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.services.FxServiceTest --tests eu.nt.xpenses.services.ExpenseServiceTest --tests eu.nt.xpenses.controllers.FxMarginsControllerTest --tests eu.nt.xpenses.controllers.AdvanceControllerTest --tests eu.nt.xpenses.controllers.MileageControllerTest --tests eu.nt.xpenses.migrations.HistoricalFxMigrationRegressionTest` [VERIFIED: existing test class paths above; historical regression class is created by Plan 01-06] |
| Full backend command | `cd backend-kotlin-jpa && ./gradlew test` [VERIFIED: `backend-kotlin-jpa/build.gradle.kts:91-95`] |
| Frontend focused command | `cd frontend && npx playwright test tests/admin/settings.spec.ts` [VERIFIED: `frontend/playwright.config.ts:11-54`] |
| Frontend static command | `cd frontend && npm run lint && npm run i18n:check` [VERIFIED: `frontend/package.json`] |

**Wave 0 gaps:** deterministic provider fixtures/injection for `FxService`; FX settings routes in `setupAdminMocks`; the D-05 mileage FX snapshot seam; and `HistoricalFxMigrationRegressionTest` with pre-V30 posted financial fixtures. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:31-37`; `frontend/tests/shared/mocks.ts:169-206`; `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/MileageRecord.kt:24-61`]

## Security Domain

| ASVS category | Applies | Standard control |
|---|---|---|
| V2 Authentication | Yes | Existing authenticated request flow in controller tests. [VERIFIED: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt:75-90`] |
| V4 Access Control | Yes | FX-margin PATCH is restricted with `hasRole('chef_finance')`. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt:126-129`] |
| V5 Input Validation | Yes | Validate all requested currencies/margins before persistence and return field-specific 400 errors. [VERIFIED: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt:132-152`] |
| V6 Cryptography | No | No cryptographic change is in phase scope. [VERIFIED: phase scope] |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A2 | A provider abstraction is the lowest-risk test seam; an alternative may retain `FxService` structure and inject `RestClient` directly. | Code and Test Seams | Minor design divergence, not policy divergence. |

## Open Questions

None. D-05 explicitly fixes mileage as EUR-denominated, routes it through the `FxService` EUR identity path, defines the business date as the UTC calendar date of `start_time`, requires a persisted FX snapshot, and excludes a foreign-currency mileage setting.

## Sources

### Primary
- [Spring Framework 6.2 transaction rollback](https://docs.spring.io/spring-framework/reference/6.2/data-access/transaction/declarative/rolling-back.html) — unchecked-exception rollback behavior. [CITED: https://docs.spring.io/spring-framework/reference/6.2/data-access/transaction/declarative/rolling-back.html]
- [Frankfurter API documentation](https://frankfurter.dev/) — v2 rate response date field. [CITED: https://frankfurter.dev/]
- Current repository implementation and tests cited inline. [VERIFIED: source paths and line ranges inline]

## Metadata

**Confidence breakdown:** Standard stack HIGH (opened build manifests); architecture HIGH (opened services/controllers/entities/tests); provider-date contract MEDIUM (official current docs).  
**Valid until:** 2026-09-02 for codebase findings; recheck provider docs before implementation.
