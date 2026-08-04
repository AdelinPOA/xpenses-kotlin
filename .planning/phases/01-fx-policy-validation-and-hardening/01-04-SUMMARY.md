---
phase: 01-fx-policy-validation-and-hardening
plan: "04"
subsystem: workflow
tags: [kotlin, spring, fx, expenses, advances, rounding, validation]

requires:
  - phase: 01-fx-policy-validation-and-hardening
    provides: "Shared dated FX resolver and atomic margin API from plans 01-01 and 01-02."
provides:
  - "Advance create/pay/update tracer coverage proving exact resolver dates, persisted rates, and rounded EUR amounts."
  - "Expense manual-rate precedence and update semantics retaining rates when currency/date are unchanged."
  - "Positive manual FX-rate validation on expense create/update DTOs."
affects: [01-05, 01-06, expense-workflows, advance-workflows]

actuals:
  tokens: 9000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Select expense rate by override, unchanged-basis retention, then shared policy resolution."
    - "Verify stored monetary values and resolver call counts at workflow boundaries."

key-files:
  created: []
  modified:
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/expense/ExpenseCreate.kt
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/expense/ExpenseUpdate.kt
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AdvanceControllerTest.kt
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/ExpenseControllerTest.kt
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/ExpenseServiceTest.kt

key-decisions:
  - "Amount/tax-only expense edits retain the existing automatic or manual rate and provenance."
  - "Currency/date basis changes without an override resolve a fresh policy rate and clear manual provenance."
  - "Existing advance controller wiring was already compliant; focused tests were added without unnecessary production refactoring."

requirements-completed: [FX-01, FX-02, FX-04, FX-05]

coverage:
  - id: D3
    description: "Expense and advance writes use the shared resolver with the correct business currency/date and persist exact rounded values."
    requirement: FX-01
    verification:
      - kind: integration
        ref: "AdvanceControllerTest and ExpenseServiceTest focused suites"
        status: pass
    human_judgment: false
  - id: D4
    description: "Manual expense overrides win, survive unrelated edits, and are replaced only when currency/date changes."
    requirement: FX-04
    verification:
      - kind: unit
        ref: "ExpenseServiceTest precedence table and resolver interaction assertions"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-08-04
status: complete
---

# Phase 1 Plan 04 Summary

**Expense and advance write workflows now have explicit FX precedence and persistence proof.**

## Performance

- **Verification:** `./gradlew test --tests eu.nt.xpenses.services.ExpenseServiceTest --tests eu.nt.xpenses.controllers.AdvanceControllerTest` and `./gradlew test --tests eu.nt.xpenses.controllers.ExpenseControllerTest`
- **Result:** BUILD SUCCESSFUL

## Accomplishments

- Proved paid advance creation, request-to-pay, and paid-update paths call `FxService` with exact resulting currency/date values.
- Proved advance GET returns stored rate and EUR amount without re-resolving.
- Refactored expense updates to use override → retained existing basis → fresh policy resolution precedence.
- Added positive manual FX-rate validation and controller coverage proving invalid rates do not persist.
- Preserved scale-2 HALF_UP monetary calculations and manual provenance flags.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Regression] Amount/tax-only expense edits discarded existing rate provenance**
- **Found during:** Task 2 implementation
- **Issue:** Any FX-relevant edit without an override fetched a new policy rate, including amount/tax-only edits.
- **Fix:** Retain the stored rate and `fxRateManual` flag when currency and date are unchanged.
- **Files modified:** `ExpenseService.kt`, `ExpenseServiceTest.kt`
- **Verification:** Focused unit suite passes.

**Total deviations:** 1 auto-fixed

## Issues Encountered

- Spring/Testcontainers integration suites are slow in this workspace, taking several minutes per context startup; all focused runs completed successfully.

## Next Phase Readiness

Ready for plan `01-05`.

---
*Phase: 01-fx-policy-validation-and-hardening*
*Plan: 04*
*Completed: 2026-08-04*
