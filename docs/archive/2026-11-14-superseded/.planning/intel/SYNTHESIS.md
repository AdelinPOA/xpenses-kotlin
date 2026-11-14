# Ingest Synthesis

## Sources

- 1 document ingested: `docs/adr/0001-bnr-fx-rates-with-margin.md` (ADR, locked, high confidence)
- No PRD, SPEC, RFC, or generic DOC sources were discovered.

## Project Scope

Maintain and evolve the existing Xpenses application, with the current planning baseline centered on reliable expense/report FX conversion and preserving financial history.

## Locked Decisions

The BNR FX policy, per-currency source-leg margins, expense-date locking, fallback behavior, manual override, and historical-rate preservation are locked by ADR-0001.

## Planning Implications

The first implementation phase should validate the existing FX implementation against the ADR, add missing settings and fallback/cache tests, and protect already-posted financial records. Later work can address the broader backlog in `docs/archive/root-md-2026-10-18/todo.md` (historical; recheck against `README.md` and GitHub Issues) through independently verifiable vertical slices.
