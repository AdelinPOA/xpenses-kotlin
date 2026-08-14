---
phase: 01-fx-policy-validation-and-hardening
verified: 2026-08-04T18:15:55Z
status: gaps_found
score: 2/21 must-haves verified
behavior_unverified: 13
overrides_applied: 0
gaps:
  - truth: "Mileage uses the same EUR identity FxService policy and UTC business date as the shared FX contract."
    status: failed
    reason: "New mileage writes persist a controller constant rate of 1 and resolve only RON for fuel calculation; the required FxService.getRate(\"EUR\", UTC-date) path is not invoked."
    artifacts:
      - path: "backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt"
        issue: "createMileage and ordinary date changes do not call resolveFxRate; they set fxRate = BigDecimal.ONE directly."
      - path: "backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt"
        issue: "Tests assert only getRate(\"RON\", ...) and therefore codify the wrong link."
    missing:
      - "Resolve and persist the EUR identity rate through FxService on creation and when the UTC business date changes."
      - "Replace the RON-only expectations with exact EUR/UTC resolver assertions while retaining any independent fuel-rate behavior."
  - truth: "A valid FX-margin save refreshes canonical API values in the administrator UI."
    status: failed
    reason: "PATCH success reads data.defaultMargin even though the backend and mock return default_margin; the input becomes the string 'undefined'."
    artifacts:
      - path: "frontend/app/admin/settings/SettingsClient.tsx"
        issue: "GET maps default_margin to defaultMargin, but the mutation response is not mapped before onSuccess."
      - path: "frontend/tests/admin/settings.spec.ts"
        issue: "The valid-save test checks request count and a success message, not the refreshed input value."
    missing:
      - "Map PATCH response default_margin to the UI model (or use the wire-format property consistently)."
      - "Add a browser assertion that the returned canonical margin values are rendered after save."
  - truth: "V30/V31 historical-fixture regression proves frozen financial values and report totals remain unchanged."
    status: failed
    reason: "The regression migrates to latest but asserts Flyway version 31. The repository now contains V32, so each test will observe version 32 and fail before providing the claimed proof."
    artifacts:
      - path: "backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/migrations/HistoricalFxMigrationRegressionTest.kt"
        issue: "migrateToLatest() has no target while currentFlywayVersion() asserts exactly '31'."
    missing:
      - "Target the regression explicitly at V31, or update its version contract and fixture assertions to account for later migrations without weakening the V30/V31 proof."
      - "Run both named migration tests against the current migration set."
  - truth: "Focused tests cover the ADR currency and date matrix."
    status: failed
    reason: "Current shared-service tests exercise EUR, RON, one configured USD margin, and a mocked fallback, but contain no GBP, CHF, or wildcard/default-margin assertions; provider tests do not exercise Frankfurter's dated fallback."
    artifacts:
      - path: "backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt"
        issue: "No GBP, CHF, or default/wildcard policy test exists."
      - path: "backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/fx/FxRateProviderTest.kt"
        issue: "Only BNR parser fixtures are tested; dated ECB/Frankfurter fallback is not exercised."
    missing:
      - "Add exact ADR matrix tests for GBP, CHF, wildcard/default margin, and dated Frankfurter fallback attribution."
behavior_unverified_items:
  - truth: "FX resolver follows ADR-0001 for all provider and margin paths."
    test: "Run the focused FxRateProviderTest and FxServiceTest after completing the missing matrix cases."
    expected: "All exact EUR/RON/configured/default/fallback/date/rounding assertions pass."
    why_human: "The verifier's focused Gradle run remained in configuration for over six minutes and produced no current XML results."
  - truth: "Fallback cache preserves requested and actual source dates and is reused."
    test: "Run the cache attribution test with a dated fallback fixture."
    expected: "One provider call/save; repeat lookup returns the stored requested-date record and source attribution."
    why_human: "This is a cache state transition; source inspection alone cannot prove the repository behavior."
  - truth: "Historical provider requests never use a latest quote."
    test: "Exercise BNR failure followed by the dated Frankfurter fallback for a historical date."
    expected: "The request includes that date and providers=ECB; no latest/current request occurs."
    why_human: "The concrete HTTP fallback branch has no executing test in the current evidence."
  - truth: "The settings API performs an atomic validation-and-save transaction."
    test: "Run FxMarginsControllerTest."
    expected: "Mixed-invalid input returns all field errors and leaves fx_margins byte-for-byte unchanged."
    why_human: "It asserts persistence behavior and the current focused Gradle command did not complete."
  - truth: "The UI shows all client/server errors and sends no invalid PATCH request."
    test: "Run the three FX settings Playwright tests against a running frontend."
    expected: "Errors remain beside inputs, invalid edits issue zero PATCHes, and valid save shows canonical returned values."
    why_human: "Browser behavior requires a runnable frontend; static inspection also found a valid-save defect."
  - truth: "Advance create/pay/update persist frozen FX values and reads do not recalculate them."
    test: "Run AdvanceControllerTest."
    expected: "Exact FxService currency/date arguments, rounded stored values, and zero read-time resolver calls."
    why_human: "These are workflow state transitions not proven by source presence."
  - truth: "Expense manual-rate precedence and change-of-basis behavior hold at runtime."
    test: "Run ExpenseServiceTest."
    expected: "Manual rates win and survive amount/tax edits; changed currency/date resolves once and clears manual provenance."
    why_human: "These are update-state invariants not proven by source presence."
  - truth: "V31 backfills existing mileage without changing amount_eur or report totals."
    test: "Run the two named HistoricalFxMigrationRegressionTest tests after fixing their migration target."
    expected: "Only the added snapshot columns change; historical amounts and aggregates match the captured snapshot."
    why_human: "This requires an actual migration and fresh database reload."
  - truth: "Unrelated mileage reads and edits retain the stored snapshot."
    test: "Run MileageControllerTest after correcting EUR resolver wiring."
    expected: "Read/unrelated edit has zero FX calls; UTC business-date change has one EUR identity call."
    why_human: "This is a runtime call-order invariant; the existing test asserts the wrong RON link."
  - truth: "V30 removes only reconstructible FX cache rows."
    test: "Run migrateV29FixturesThroughV31PurgesOnlyFxCache with an explicit V31 target."
    expected: "fx_rates is cleared while paid expense, advance, mileage, and report rows remain."
    why_human: "The current regression's latest-version assertion is stale."
  - truth: "Fresh reload preserves historical expense and advance values."
    test: "Run reloadedFinancialRowsAndReportTotalsRemainExact with an explicit V31 target."
    expected: "All captured financial fields and statuses compare exactly after a new JDBC connection."
    why_human: "The current regression is broken by V32 before it can certify the invariant."
  - truth: "Stored report totals and component aggregates remain invariant through V30/V31."
    test: "Run the repaired fresh-reload migration test."
    expected: "Stored total and all captured SQL aggregates are numerically identical."
    why_human: "The assertion path currently fails its version contract."
  - truth: "The full targeted backend phase suite is runnable on the current checkout."
    test: "Run the focused Gradle classes individually or after resolving the configuration stall."
    expected: "Fresh XML reports show each selected class passing."
    why_human: "The verifier stopped its own single aggregate Gradle invocation after it stalled during task-graph configuration."
---

# Phase 1: FX Policy Validation and Hardening Verification Report

**Phase Goal:** The implemented FX behavior matches ADR-0001 across expenses, advances, mileage, settings, fallback dates, and historical records.
**Verified:** 2026-08-04T18:15:55Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | ADR formulas cover EUR, RON, configured, and fallback currencies | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `FxService` applies a source-leg margin and skips it for RON; the required complete executed matrix is absent. |
| 2 | Fallback cache retains requested and provider source dates | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `FxRate` persists `rateDate`, `sourceDate`, and `source`; cache behavior was not executed in this verification. |
| 3 | Historical requests never substitute current quotes and cache values stay stable | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The only Frankfurter URI is dated and no `latest` URI exists, but no end-to-end fallback test runs it. |
| 4 | ADR default margins are defined | ✓ VERIFIED | `FxService.defaultMargins` and `DataInitializer` define EUR 2%, USD 2.5%, GBP/CHF/* 2%; EUR and RON bypass margin application. |
| 5 | Admin can read and replace margins through the API | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | GET/PATCH routes, validation, and one post-validation save are present in `AppSettingsController`. |
| 6 | Invalid API payloads produce all errors and no partial write | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Errors are accumulated before the candidate map/save, but the integration test did not complete. |
| 7 | API canonicalizes keys, supports `*`, and rejects nonzero RON margin | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Static validation implements these checks; no current passing integration result exists. |
| 8 | UI shows all invalid fields and preserves edits | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Local error state and `aria-describedby` wiring exist; browser behavior was not run. |
| 9 | Invalid UI submission sends no PATCH; server errors map to inputs | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Client returns before mutation on errors and maps `errors` by field path; browser proof is absent. |
| 10 | Valid UI save refreshes canonical values and reports success in both locales | ✗ FAILED | PATCH response uses `default_margin`, but `onSuccess` reads `data.defaultMargin`, rendering `undefined`. |
| 11 | Paid advances resolve via `FxService` with business currency/date | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Controller calls `getRate` on paid create/pay/update; no current passing integration test. |
| 12 | Expense manual rates win and survive amount/tax-only edits | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `ExpenseService.updateExpense` retains the stored rate when currency/date are unchanged; runtime transition unexecuted. |
| 13 | Expense currency/date changes resolve a fresh policy rate and clear manual provenance | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The changed-basis branch calls `fxService` and sets manual false; runtime transition unexecuted. |
| 14 | Expense/advance values persist once and do not recompute on read | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Write paths calculate `amountEur` with `HALF_UP`; read stability requires the focused tests. |
| 15 | Mileage uses the EUR identity FxService entry point | ✗ FAILED | `createMileage` calls the RON fuel converter and writes `fxRate = BigDecimal.ONE`; required `getRate("EUR", UTC-date)` is not used. |
| 16 | Mileage UTC business date produces an attributable persisted snapshot | ✗ FAILED | UTC helper exists, but the snapshot rate is embedded rather than resolved through the required EUR identity path. |
| 17 | V31 backfills native EUR snapshot values without rewriting `amount_eur` | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | SQL updates only the three added columns; actual migration proof is currently broken. |
| 18 | Mileage reads/unrelated edits do not re-resolve stored rate | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The code generally preserves the snapshot, but its test currently verifies the wrong RON behavior. |
| 19 | V30/V31 delete only FX cache rows over posted fixtures | ✗ FAILED | The regression calls migrate-to-latest but asserts schema version `31`; V32 is now present. |
| 20 | Fresh connection reloads every historical financial row unchanged | ✗ FAILED | The intended regression cannot pass its current Flyway version assertion. |
| 21 | Report totals and aggregates remain invariant across migration | ✗ FAILED | This assertion is in the same stale migration regression and is not current executable evidence. |

**Score:** 2/21 truths verified (13 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `FxRateProvider.kt` | Dated BNR/Frankfurter provider | ✓ VERIFIED | Substantive provider boundary, dated URI, source attribution. |
| `V30__persist_fx_source_date_and_reset_cache.sql` | Cache-only attribution migration | ✓ VERIFIED | Alters/deletes only `fx_rates`. |
| `FxServiceTest.kt` | Complete shared ADR matrix | ✗ STUB/PARTIAL | Substantive test file, but omits GBP, CHF, wildcard/default, and concrete Frankfurter fallback coverage. |
| `AppSettingsController.kt` / handler / API test | Atomic FX margin API | ⚠️ PRESENT | Implementation and test exist; no current executed integration proof. |
| `SettingsClient.tsx` / browser test / mocks | Validated, canonical UI | ✗ HOLLOW | Wired GET/PATCH data flow has a PATCH snake/camel response mismatch. |
| `AdvanceControllerTest.kt` / `ExpenseService.kt` | Workflow FX persistence | ⚠️ PRESENT | Code and focused tests exist; behavior not executed here. |
| `V31__add_mileage_fx_snapshot.sql` | Stable native EUR snapshot | ⚠️ PARTIAL | Migration is scoped correctly, but controller wiring violates the required EUR `FxService` link. |
| `MileageController.kt` / test | Shared EUR identity FX workflow | ✗ NOT_WIRED | Direct constant and RON-only test expectation bypass the planned entry point. |
| `HistoricalFxMigrationRegressionTest.kt` | V29→V31 fixture/reload proof | ✗ STUB/PARTIAL | Substantive test code, but it is invalidated by the current V32 migration. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `FxService.getRate` | `FxRateProvider.resolve` | cache miss | ✓ WIRED | Constructor-injected provider called after requested-date cache miss. |
| `FxService.getRate` | `FxRateRepository` | lookup/save/reload | ✓ WIRED | Requested-date lookup, source-date candidate, duplicate winner reload. |
| `HttpFxRateProvider` | BNR and dated Frankfurter | dated provider result | ⚠️ PRESENT | URI contains requested date and `providers=ECB`; the fallback branch lacks executed evidence. |
| settings PATCH | `AppSettingRepository.save` | fully validated candidate | ✓ WIRED | Save appears only after the aggregate error check. |
| `FxMarginsValidationException` | handler | `errors` response map | ✓ WIRED | Dedicated 400 handler returns `detail` plus `errors`. |
| Settings form | settings PATCH | validated payload | ✗ PARTIAL | Request is wired, but response values are not mapped into the UI model. |
| Mileage create/update | `FxService.getRate("EUR", UTC-date)` | EUR identity snapshot | ✗ NOT_WIRED | Create and normal update paths use RON fuel resolution and a direct `BigDecimal.ONE`. |
| migration regression | V30/V31 | V29 fixture then V31 migration | ✗ NOT_WIRED | Test migrates to unbounded latest and asserts obsolete version 31. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `SettingsClient.tsx` | `fxDefaultMargin` after PATCH | raw `response.data.default_margin` | No — read as `data.defaultMargin` | ✗ HOLLOW |
| `MileageController.kt` | `MileageRecord.fxRate` | controller constant on create/typical re-calculation | No shared EUR resolver value | ✗ HOLLOW |
| `FxService.kt` | cached `FxRate` | repository/provider | Yes, structurally | ⚠️ behavior unexecuted |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Targeted backend FX classes | `./gradlew test --tests ...FxRateProviderTest ...HistoricalFxMigrationRegressionTest` | Stalled in Gradle task-graph configuration for >6 minutes; no fresh XML result was produced; invocation stopped. | ? SKIP |
| Frontend static check | `npm run lint -- ... && npm run i18n:check` | i18n parity passed; ESLint exited 0 but warned all five targeted files were ignored by configuration. | ⚠️ PARTIAL |
| Browser settings flow | `npx playwright test tests/admin/settings.spec.ts` | Not run: requires a frontend server and static inspection already found a deterministic response-shape defect. | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| FX-01 | 01-04, 01-05, 01-06 | One report-level policy across expenses, advances, mileage | ✗ BLOCKED | Mileage does not use the required EUR identity `FxService` path. |
| FX-02 | 01-01, 01-04, 01-05 | BNR/source margin, EUR/RON exceptions, fallback | ✗ BLOCKED | Required matrix proof is incomplete and mileage embeds its rate rather than resolving EUR identity. |
| FX-03 | 01-01, 01-02, 01-03 | Stored configurable margins with defaults | ✗ BLOCKED | API is structurally present, but valid UI save corrupts canonical default-margin rendering. |
| FX-04 | 01-01, 01-04, 01-05 | Expense date, prior banking day, manual override | ⚠️ NEEDS HUMAN | Code is structurally date-aware, but focused tests did not complete and dated Frankfurter behavior is unexecuted. |
| FX-05 | 01-01, 01-04, 01-05, 01-06 | Preserve frozen historical financial values | ✗ BLOCKED | The migration regression has an obsolete V31 assertion and does not execute successfully against current migrations. |

No requirement IDs mapped to Phase 1 are orphaned: all FX-01 through FX-05 appear in at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `MileageController.kt` | 111, 290 | Direct `BigDecimal.ONE` rate | 🛑 Blocker | Bypasses the required EUR `FxService` link. |
| `SettingsClient.tsx` | 96 | Snake/camel API shape mismatch | 🛑 Blocker | Successful persistence displays `undefined` rather than canonical default margin. |
| `HistoricalFxMigrationRegressionTest.kt` | 163, 222 | Unbounded migration plus exact V31 assertion | 🛑 Blocker | Regression fails after current V32 and cannot prove history safety. |
| `FxServiceTest.kt` | — | Missing matrix rows | 🛑 Blocker | Exit criterion's required GBP/CHF/default coverage is absent. |
| Phase artifact files | — | `TBD`/`FIXME`/`XXX` markers | ℹ️ None | No unreferenced debt markers found. |

### Gaps Summary

Phase 1 is not achieved. The two functional gaps are direct: mileage bypasses the planned EUR identity resolver, and settings PATCH success does not map the backend response. The historical-safety evidence is also invalid on the current checkout because V32 makes the V31-only migration assertion fail. Finally, the claimed shared policy matrix does not cover all required margin and fallback cases.

The incomplete runtime checks are retained above as behavior-unverified items; they are not silent passes. Repair the four structured gaps, then rerun the named backend and browser tests before re-verification.

---

_Verified: 2026-08-04T18:15:55Z_
_Verifier: the agent (gsd-verifier)_
