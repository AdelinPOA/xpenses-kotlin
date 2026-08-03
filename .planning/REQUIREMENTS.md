# Requirements: Xpenses

**Defined:** 2026-08-03
**Source:** `docs/adr/0001-bnr-fx-rates-with-margin.md`

## FX Conversion Policy

### FX-01: Apply one FX policy across financial workflows

Expenses, advances, and mileage must use the same report-level FX policy.

### FX-02: Calculate conversions using BNR plus source-leg margin

EUR must remain identity. RON must use the inverted BNR EUR rate with no margin. Other currencies must apply that currency's margin only to the source leg; unsupported BNR currencies must use ECB/Frankfurter fallback with the same margin.

### FX-03: Support configurable currency margins

Margins must be stored in the `fx_margins` application setting. Defaults are EUR 2.0%, USD 2.5%, GBP 2.0%, CHF 2.0%, and 2.0% otherwise.

### FX-04: Lock rates to the expense date

The rate must be resolved using the receipt/expense date. Weekends and holidays must use the most recent published banking day, and manual rate override must remain available.

### FX-05: Preserve historical financial values

Already-posted expenses must retain their frozen rates. Cache cleanup or migration must not silently recompute historical totals.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FX-01 | Phase 1 | Pending |
| FX-02 | Phase 1 | Pending |
| FX-03 | Phase 1 | Pending |
| FX-04 | Phase 1 | Pending |
| FX-05 | Phase 1 | Pending |
