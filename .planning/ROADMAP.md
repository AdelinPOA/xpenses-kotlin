# Roadmap: Xpenses

## Milestone 1: Financial FX Reliability

Validate and complete the locked BNR-plus-margin policy across the existing backend and frontend, with migration-safe handling of historical rates.

### Phase 1: FX Policy Validation and Hardening

**Goal:** The implemented FX behavior matches ADR-0001 across expenses, advances, mileage, settings, fallback dates, and historical records.

**Requirements:** FX-01, FX-02, FX-03, FX-04, FX-05

**Exit criteria:**

- Focused tests cover EUR, RON, configured currencies, default margins, fallback currencies, weekends/holidays, and manual overrides.
- FX settings API/UI validation prevents invalid margins and preserves existing configuration semantics.
- Cache persistence records the actual source date or otherwise avoids misrepresenting fallback data.
- Existing posted rates are demonstrated to remain unchanged.

## Future Backlog

The reviewed backlog in `todo.md` contains security, concurrency, storage, performance, export, OCR, email, and frontend UX work. Promote items into new phases only after validating current behavior and choosing a coherent vertical slice.

## Phase Status

| Phase | Status | Requirements |
|-------|--------|--------------|
| 1 | Complete | FX-01–FX-05 |
