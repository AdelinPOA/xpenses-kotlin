---
phase: 01-fx-policy-validation-and-hardening
plan: "01"
subsystem: api
tags: [kotlin, spring, fx, bnr, frankfurter, flyway, postgres]

requires: []
provides:
  - Dated BNR and ECB/Frankfurter FX provider boundary with source attribution.
  - Requested-date FX cache identity with durable source date and source.
  - Shared FX policy arithmetic, margin lookup, conversion, and cache-race handling.
affects: [01-02, 01-03, 01-04, 01-05, 01-06]

actuals:
  tokens: 15000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Provider boundary returns rateToEur, actual sourceDate, and stable source attribution."
    - "Requested rate date remains cache identity; provider source date is audit metadata."

key-files:
  created:
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fx/FxRateProvider.kt
    - backend-kotlin-jpa/src/main/resources/db/migration/V30__persist_fx_source_date_and_reset_cache.sql
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/fx/FxRateProviderTest.kt
  modified:
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/FxRate.kt
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt

key-decisions:
  - "Proceed with V30: clear only reconstructible fx_rates cache rows and preserve all posted financial records."
  - "BNR is preferred; ECB/Frankfurter fallback must return an attributable date and never use a current/latest quote for historical requests."
  - "RON receives no margin; conversion multiplies source-to-EUR rates."

patterns-established:
  - "Use LocalDate source attribution independently from the requested String cache date."
  - "Treat duplicate cache insertion as a race and reload the committed winner."

requirements-completed: [FX-02, FX-03, FX-04, FX-05]

coverage:
  - id: D1
    description: "Historical FX provider responses preserve actual source dates and source attribution."
    requirement: FX-04
    verification:
      - kind: unit
        ref: "eu.nt.xpenses.services.fx.FxRateProviderTest — dated BNR parsing and year boundary"
        status: pass
    human_judgment: false
  - id: D2
    description: "FX cache persists requested-date identity, source metadata, margins, and reuses cache winners."
    requirement: FX-05
    verification:
      - kind: unit
        ref: "eu.nt.xpenses.services.FxServiceTest — focused Gradle test run"
        status: pass
    human_judgment: false
  - id: D3
    description: "V30 changes only fx_rates and invalidates reconstructible cache state."
    requirement: FX-05
    verification:
      - kind: other
        ref: "rg migration target inspection: ALTER/DELETE statements target only fx_rates"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-04
status: complete
---

# Phase 1 Plan 01 Summary

**Dated FX resolution now persists provider attribution while preserving requested-date cache identity and historical financial values.**

## Performance

- **Tasks:** 3, including the approved V30 decision checkpoint
- **Focused verification:** `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.services.FxServiceTest --tests eu.nt.xpenses.services.fx.FxRateProviderTest`
- **Result:** BUILD SUCCESSFUL

## Accomplishments

- Added BNR XML parsing with prior banking-day and year-boundary selection.
- Added dated ECB/Frankfurter fallback with response-date validation and no latest/current fallback.
- Added `source_date` and `source` attribution to `fx_rates`, while V30 deletes only reconstructible cache rows.
- Hardened `FxService` with ADR-0001 margins, source-date persistence, correct multiplication conversion, and duplicate-insert recovery.
- Added deterministic unit coverage for cache attribution, policy margins, provider failure, RON inversion, year boundaries, and conversion direction.

## Task Commits

1. **Task 2: Persist one dated fallback quote end to end** - `4b9ab16`
2. **Task 3: Complete the shared ADR-0001 matrix and cache hardening** - `4b9ab16`
3. **Provider parser coverage** - `a017b3a`

## Decisions Made

- Approved the one-way V30 cache cleanup after confirming it affects only reconstructible FX cache data.
- Kept the requested business date as the cache key and stored the actual provider date separately.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added cross-year provider lookup and secure XML parsing**
- **Found during:** Task 2 acceptance review
- **Issue:** A year-boundary request could not consult the previous annual BNR document, and remote XML parsing lacked explicit XXE hardening.
- **Fix:** Added previous-year lookup fallback and disabled external entities/DTDs in the parser.
- **Files modified:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fx/FxRateProvider.kt`
- **Verification:** Focused provider tests pass.
- **Committed in:** `4b9ab16`

**Total deviations:** 1 auto-fixed (missing critical historical-date/security handling)
**Impact on plan:** Necessary correctness and security hardening; no scope expansion.

## Issues Encountered

- The repository had a mixed staged working tree during reset recovery. The Phase 1 implementation files were isolated and committed, while pre-existing working changes were preserved. The first plan commit also contained already-staged unrelated changes from that recovery; their content was preserved, and the recovery branch remains available at `backup/phase1-reset-20260804`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for plan `01-02` (atomic FX margin API validation). The shared FX provider seam and cache attribution contract are available for dependent plans.

---
*Phase: 01-fx-policy-validation-and-hardening*
*Plan: 01*
*Completed: 2026-08-04*
