---
phase: 01-fx-policy-validation-and-hardening
plan: "06"
subsystem: migrations
tags: [kotlin, flyway, postgresql, testcontainers, historical-data, fx]

requires:
  - phase: 01-fx-policy-validation-and-hardening
    provides: "V30/V31 migration path and frozen FX workflow persistence from plans 01-01 through 01-05."
provides:
  - "Standalone V29 fixture migration regression through V30 and V31."
  - "Fresh-connection proof that historical rates, EUR amounts, statuses, and report aggregates remain unchanged."
affects: [phase-1-complete, release-verification]

actuals:
  tokens: 9000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Use a dedicated PostgreSQL container and Flyway target 29 to test migrations over pre-existing rows."
    - "Capture immutable JDBC snapshots before migration and reload by primary key after migration."

key-files:
  created:
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/migrations/HistoricalFxMigrationRegressionTest.kt
  modified: []

key-decisions:
  - "Enable Flyway clean only inside this isolated test so each test starts from a fresh V29 schema."
  - "Compare persisted financial values and SQL aggregates from captured pre-migration snapshots, never from mutated rows."

requirements-completed: [FX-01, FX-05]

coverage:
  - id: D6
    description: "V30/V31 preserve historical financial data, add mileage identity attribution, and remove only reconstructible FX cache rows."
    requirement: FX-05
    verification:
      - kind: migration-integration
        ref: "HistoricalFxMigrationRegressionTest — both V29→latest scenarios"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-08-04
status: complete
---

# Phase 1 Plan 06 Summary

**Historical FX migration safety is now executable and verified.**

## Performance

- **Verification:** `./gradlew test --tests eu.nt.xpenses.migrations.HistoricalFxMigrationRegressionTest`
- **Result:** BUILD SUCCESSFUL; both migration regression tests passed.

## Accomplishments

- Migrated a real V29 PostgreSQL fixture through V30 and V31 using the project migration location.
- Verified the stale FX cache row is removed while expense, advance, mileage, and report rows remain.
- Verified mileage backfill sets native amount, EUR currency, and identity rate without changing existing `amount_eur`.
- Reloaded through a new JDBC connection and compared frozen rates, EUR amounts, statuses, report total, and component/combined aggregates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test isolation] Flyway clean was disabled by the project test configuration**
- **Found during:** Task 1 verification
- **Issue:** The standalone test could not reset its dedicated container between the two scenarios.
- **Fix:** Enabled `cleanDisabled(false)` only on the test-local Flyway configuration.
- **Verification:** Both tests pass against isolated V29→V31 runs.

**Total deviations:** 1 auto-fixed

## Next Phase Readiness

Phase 1 implementation and migration verification are complete. Proceed to the phase-level verification/audit workflow.

---
*Phase: 01-fx-policy-validation-and-hardening*
*Plan: 06*
*Completed: 2026-08-04*
