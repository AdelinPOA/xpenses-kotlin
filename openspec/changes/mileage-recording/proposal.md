## Why

Technicians at Newtech Automation travel to client sites by car and need to record km driven for mileage reimbursement. Currently they must manually create a "Transport" expense and type km details into the description field — error-prone and impossible to aggregate for reports. A dedicated mileage recording feature linked to expense reports gives structured data (origin, destination, distance, rate) with automatic EUR cost calculation.

## What Changes

- New `mileage_records` DB table linked to `expense_reports` (same pattern as `advance_payments`)
- New CRUD router at `/api/reports/{id}/mileage` with auth + ownership checks
- Dual configurable km rates: `MILEAGE_RATE_BEFORE_TAX` (gross, default 0.30 EUR/km) and `MILEAGE_RATE_AFTER_TAX` (net/reimbursement, default 0.22 EUR/km)
- Mileage tab on report detail page (`/reports/[id]`) — inline form + table
- Mileage summary row in PDF export (total km × rate = reimbursable amount)
- Report totals include mileage cost in reimbursable calculation

## Capabilities

### New Capabilities
- `mileage-recording`: CRUD for mileage records scoped to expense reports, with km rate calculation, frontend UI, and PDF export integration

### Modified Capabilities

## Impact

- **Backend**: new `mileage_records` table + migration columns in `database.py`, new router `routers/mileage.py`, new Pydantic models in `models.py`, `pdf_export.py` updated, `config.py` gets `mileage_rate_before_tax` and `mileage_rate_after_tax` settings
- **Frontend**: `api.ts` types + API calls, report detail page gets mileage tab, `ReportOut` model extended with `mileage_records` and `total_mileage`
- **Tests**: new `test_mileage.py`
- **No breaking changes** — additive only
