---
phase: 01-fx-policy-validation-and-hardening
plan: "05"
subsystem: mileage
tags: [kotlin, spring, flyway, mileage, fx, utc, audit]

requires:
  - phase: 01-fx-policy-validation-and-hardening
    provides: "Shared FxService authority and persisted workflow semantics from plan 01-01."
provides:
  - "V31 additive mileage FX snapshot columns with EUR backfill for existing rows."
  - "Mileage create/update wiring through FxService using UTC business dates."
  - "Stored mileage FX attribution in API responses and report mapping."
affects: [01-06, mileage, report-serialization]

actuals:
  tokens: 10000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Derive mileage FX business dates from Instant in UTC."
    - "Persist native EUR amount, currency, rate, and converted EUR amount together."

key-files:
  created:
    - backend-kotlin-jpa/src/main/resources/db/migration/V31__add_mileage_fx_snapshot.sql
  modified:
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/MileageRecord.kt
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordOut.kt
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt

key-decisions:
  - "Mileage remains EUR/km with no foreign-currency setting; FxService is called for EUR identity resolution."
  - "V31 backfills only new snapshot columns from existing amount_eur and leaves historical financial totals untouched."
  - "A start-time update re-resolves only when its UTC calendar date changes; unrelated edits retain the stored snapshot."

requirements-completed: [FX-01, FX-02, FX-04, FX-05]

coverage:
  - id: D5
    description: "Mileage uses EUR identity FX resolution, UTC business dates, persisted attribution, and frozen read/update behavior."
    requirement: FX-02
    verification:
      - kind: integration
        ref: "MileageControllerTest focused suite"
        status: pass
      - kind: migration-review
        ref: "V31 SQL backfills amount_original/currency_original/fx_rate without assigning amount_eur"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-04
status: complete
---

# Phase 1 Plan 05 Summary

**Mileage now participates in the shared FX contract with durable EUR attribution.**

## Performance

- **Verification:** `./gradlew test --tests eu.nt.xpenses.controllers.MileageControllerTest`
- **Result:** BUILD SUCCESSFUL

## Accomplishments

- Added V31 to backfill existing mileage rows as native EUR with rate `1`, without rewriting `amount_eur` or report totals.
- Added persisted `amount_original`, `currency_original`, and `fx_rate` fields to mileage records and API/report mappings.
- Wired create/update mileage through `FxService.getRate("EUR", UTC-date)`.
- Added tests for timezone-boundary dates, frozen reads, unrelated edits, and start-date changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Compile] Report mapper required new additive DTO fields**
- **Found during:** Task 2 verification
- **Issue:** `ReportMapper` constructs `MileageRecordOut` for report responses and needed the new snapshot fields.
- **Fix:** Added the three stored snapshot values to the mapper.
- **Verification:** Mileage integration suite passes.

**Total deviations:** 1 auto-fixed

## Issues Encountered

- The first test attempt used an invalid update fixture with a new start date but the old end date; the existing ordering validation correctly returned 422. The fixture was corrected to move both timestamps together.
- Spring/Testcontainers verification took several minutes but completed successfully.

## Next Phase Readiness

Ready for plan `01-06`, the final migration and cross-workflow verification gate.

---
*Phase: 01-fx-policy-validation-and-hardening*
*Plan: 05*
*Completed: 2026-08-04*
