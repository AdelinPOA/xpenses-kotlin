## Context

xpenses has a pattern for report-scoped sub-records: `advance_payments` table with its own router, Pydantic models, and a tab on the report detail page. Mileage recording follows the same pattern exactly — a `mileage_records` table linked to `expense_reports`, CRUD router, frontend tab, and PDF export row.

The existing expense workflow (FX conversion, report state machine, PDF export) is untouched. Mileage is a parallel cost line in the report, not a special expense type.

## Goals / Non-Goals

**Goals:**
- Record km driven per trip (origin → destination, distance, date)
- Auto-calculate cost from distance × configurable rate
- Include mileage total in report reimbursable amount
- Show mileage in PDF export
- Follow existing `advance_payments` patterns for consistency

**Non-Goals:**
- Google Maps API integration for distance calculation
- GPS tracking or route recording
- Per-user or per-vehicle rate overrides
- Mileage approval workflow (follows report approval)
- Multi-currency mileage rates (EUR only)

## Decisions

1. **Separate table vs. expense subtype**: Separate `mileage_records` table. Mileage has different fields (origin, destination, distance_km) that don't map to expense columns (amount, merchant, currency). Forcing it into expenses would require nullable columns and type-switching logic. The `advance_payments` pattern proves this approach works.

2. **Dual rate storage**: Two env vars in `config.py`:
   - `MILEAGE_RATE_BEFORE_TAX` (default 0.30 EUR/km) — the gross/accounting rate
   - `MILEAGE_RATE_AFTER_TAX` (default 0.22 EUR/km) — the net rate used for reimbursement
   Both rates are stored on each record at creation time (`rate_before_tax`, `rate_after_tax`) so historical records remain accurate if rates change.

3. **Cost calculation**: Server-side only. Two amounts per record:
   - `amount_before_tax = distance_km × rate_before_tax` (for accounting/reporting)
   - `amount_eur = distance_km × rate_after_tax` (for reimbursement totals)
   No FX conversion needed since rates are always EUR.

4. **Report integration**: `ReportOut` gets `mileage_records` list and `total_mileage_eur` field. The `total_reimbursable` calculation adds mileage cost: `total_expenses - non_reimbursable - advances + mileage`.

## Risks / Trade-offs

- **Rate change affects new records only** → Acceptable; each record stores its rate at creation time.
- **No distance validation** → Users can enter any km value. Mitigation: manager reviews at report approval.
