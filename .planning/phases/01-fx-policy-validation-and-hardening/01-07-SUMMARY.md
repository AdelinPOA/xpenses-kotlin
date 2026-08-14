---
phase: 01-fx-policy-validation-and-hardening
plan: "07"
subsystem: fx
tags: [kotlin, spring, fx, bnr, frankfurter, junit5]

requires:
  - phase: 01-fx-policy-validation-and-hardening
    provides: "Dated FX resolution and margin matrix from plan 01-01."
provides:
  - "Deterministic Frankfurter ECB dated rate fallback verification."
  - "Full policy matrix coverage for GBP, CHF, stored wildcard, and built-in default margins."
affects: [fx-resolution, settings]

actuals:
  tokens: 18000
  tasks: 2
  commits: 1

key-files:
  created: []
  modified:
    - backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fx/FxRateProvider.kt
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/fx/FxRateProviderTest.kt
    - backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt

key-decisions:
  - "Use internal/package-visible deterministic HTTP seams to test Frankfurter ECB fallback without live network calls."
  - "Assert exact 2% default margins and wildcard hierarchy in FxServiceTest."

requirements-completed: [FX-02, FX-03, FX-04]
completed: 2026-08-14
status: complete
---

# Phase 1 Plan 07 Summary

**Dated Frankfurter ECB fallback and FX margin hierarchy proofs are complete and passing.**

## Verification

- Command: `./gradlew test --tests eu.nt.xpenses.services.FxServiceTest --tests eu.nt.xpenses.services.fx.FxRateProviderTest`
- Result: SUCCESS (all unit and provider tests passing deterministically).

---
*Phase: 01-fx-policy-validation-and-hardening*
*Plan: 07*
*Completed: 2026-08-14*
