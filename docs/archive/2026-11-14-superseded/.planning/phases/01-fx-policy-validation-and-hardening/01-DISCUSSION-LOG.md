# Phase 1: FX Policy Validation and Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-03
**Phase:** 1-FX Policy Validation and Hardening
**Areas discussed:** Fallback-date cache semantics, FX settings validation, cross-workflow verification, historical and manual-rate safeguards

---

## Fallback-date cache semantics

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Store the actual provider/source date | ✓ |
| 2 | Do not cache fallback results as date-specific | |
| 3 | Cache under requested date with explicit metadata | |

**User's choice:** Option 1
**Notes:** Fallback rates must be persisted with the actual provider/source date.

## FX settings validation behavior

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Reject the entire update atomically | ✓ |
| 2 | Apply valid entries and report invalid ones | |
| 3 | Clamp invalid values to an allowed range | |

**User's choice:** Option 1
**Notes:** The recommendation was accepted: invalid financial configuration must not produce partial or silently normalized state.

## Cross-workflow verification

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Shared-service matrix tests plus targeted workflow tests | ✓ |
| 2 | Full matrix repeated in every workflow | |
| 3 | Shared-service tests only | |

**User's choice:** Option 1
**Notes:** Comprehensive policy coverage belongs in `FxService`; each workflow still needs focused wiring and persistence tests.

## Historical and manual-rate safeguards

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Regression tests plus migration-safety checks | ✓ |
| 2 | Database snapshot comparison | |
| 3 | Manual verification only | |

**User's choice:** Option 1
**Notes:** Historical financial correctness requires repeatable automated evidence, and manual overrides must remain authoritative.

## the agent's Discretion

- Exact test fixture builders, assertion organization, error-message wording, and source-date persistence mechanism.

## Deferred Ideas

None.
