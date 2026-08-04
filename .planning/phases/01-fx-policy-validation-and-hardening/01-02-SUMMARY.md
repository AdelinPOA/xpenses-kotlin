---
phase: 01-fx-policy-validation-and-hardening
plan: "02"
subsystem: api
tags: [kotlin, spring, validation, settings, fx]

requires:
  - phase: 01-fx-policy-validation-and-hardening
    provides: "Shared FX margin storage and ADR-0001 policy defaults from plan 01-01."
provides:
  - Atomic FX margin GET/PATCH API with structured field errors.
  - Canonical currency-key, wildcard, RON, percentage, and authorization validation.
affects: [01-03, frontend-settings]

actuals:
  tokens: 9000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Accumulate all validation errors before building and saving one candidate setting."
    - "Expose percentage values at HTTP boundaries and decimal fractions in persistence."

key-files:
  created:
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/FxMarginsControllerTest.kt
  modified:
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/ValidationExceptionHandler.kt

key-decisions:
  - "Reject normalized currency-key collisions rather than silently choosing one value."
  - "Allow either margins.* or default_margin for wildcard policy, but not both in one patch."
  - "Return HTTP 403 for method-level authorization denial instead of allowing the generic handler to produce HTTP 500."

patterns-established:
  - "Invalid sibling values produce one field-addressable 400 response and zero setting writes."

requirements-completed: [FX-03]

coverage:
  - id: D1
    description: "FX margin updates validate all fields atomically and preserve the stored JSON on failure."
    requirement: FX-03
    verification:
      - kind: integration
        ref: "FxMarginsControllerTest — focused Gradle integration suite"
        status: pass
    human_judgment: false
  - id: D2
    description: "FX margin API canonicalizes keys, maps percentages/fractions, enforces RON/wildcard rules, and preserves admin authorization."
    requirement: FX-03
    verification:
      - kind: integration
        ref: "FxMarginsControllerTest — boundaries, duplicate keys, empty patch, and authorization"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-04
status: complete
---

# Phase 1 Plan 02 Summary

**FX margin settings now have an atomic, canonical, field-addressable API contract.**

## Performance

- **Tasks:** 2
- **Verification:** `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.controllers.FxMarginsControllerTest`
- **Result:** BUILD SUCCESSFUL

## Accomplishments

- Added `GET /api/settings/fx-margins` and `PATCH /api/settings/fx-margins` with percentage-facing DTOs.
- Validated every sibling field before persistence and returned all errors as `errors["margins.KEY"]` or `errors.defaultMargin`.
- Normalized keys, rejected collisions and malformed currencies, enforced 0–100 percentage bounds, and prevented nonzero RON margins.
- Preserved omitted settings and made empty patches no-ops.
- Added integration coverage for valid updates, failed atomic updates, boundaries, wildcard behavior, malformed keys, and authorization.

## Task Commits

1. **Task 1: Reject a mixed-validity margin update atomically** - `0b6ff44`
2. **Task 2: Complete canonical key and percentage boundary validation** - `0b6ff44`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Method authorization denial returned HTTP 500**
- **Found during:** Task 1 verification
- **Issue:** Spring method security raised `AuthorizationDeniedException`, which the generic exception handler converted to HTTP 500.
- **Fix:** Added a dedicated HTTP 403 handler returning `{ "detail": "Access denied" }`.
- **Files modified:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/ValidationExceptionHandler.kt`
- **Verification:** Technician authorization test passes in the focused integration suite.
- **Committed in:** `0b6ff44`

**Total deviations:** 1 auto-fixed (authorization response correctness)
**Impact on plan:** Required to satisfy the stated non-admin forbidden contract.

## Issues Encountered

- Full Spring/Testcontainers verification takes several minutes because it starts PostgreSQL and the complete application context; it completed successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for plan `01-03`, which covers the frontend settings UI and client-side validation/error presentation.

---
*Phase: 01-fx-policy-validation-and-hardening*
*Plan: 02*
*Completed: 2026-08-04*
