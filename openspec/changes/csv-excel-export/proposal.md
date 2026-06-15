## Why

Users need a way to extract their expense and report data into spreadsheet formats (CSV/Excel) for further analysis in external tools (accounting software, Excel pivot tables, company ERP systems). PDF export already exists for human-readable reports, but there is no machine-readable export path — making bulk data extraction impossible without direct DB access.

## What Changes

- New `GET /api/expenses/export` endpoint — exports the caller's expenses (or org-wide with `?all=true` for privileged roles) as CSV or XLSX, with the same filters as the existing list endpoint (`from`, `to`, `category_id`, `status`, `report_id`).
- New `GET /api/reports/{id}/export-csv` endpoint — exports all expenses of a specific report as CSV or XLSX.
- New `GET /api/reports/export` endpoint — exports a summary of reports (one row per report) as CSV or XLSX, respecting the same `all` / `user_id` / `status` filters as the existing list endpoint.
- Format controlled via `?format=csv` (default) or `?format=xlsx` query param.
- Frontend download buttons added to the Expenses page and the Reports list/detail pages.
- `openpyxl` added as a backend dependency for XLSX generation.

## Capabilities

### New Capabilities
- `expense-export`: Export expenses to CSV or XLSX with full filter support and role-based scoping.
- `report-export`: Export report summaries and per-report expense breakdowns to CSV or XLSX.

### Modified Capabilities

## Impact

- **Backend**: New router endpoints in `expenses.py` and `reports.py`; new `export_service.py` handling CSV/XLSX serialisation; `pyproject.toml` gains `openpyxl`.
- **Frontend**: New download buttons on `/expenses` page and `/reports` page + report detail page; uses direct anchor `href` with cookie credentials (or a fetch-blob approach via axios).
- **No breaking changes** — existing endpoints and PDF export are untouched.
- **Auth/scoping**: Export endpoints reuse `get_current_user` + the same `all` flag logic already present in list endpoints.
