## Context

The app has a FastAPI + asyncpg backend with raw SQL, no ORM. Export endpoints need to reuse the existing filter query logic from `list_expenses` and `list_reports` rather than duplicate it. PDF export already exists in `services/pdf_export.py` as a reference pattern. The frontend uses TanStack Query + axios with `withCredentials: true` for cookie auth — file downloads need a blob-fetch approach rather than bare `<a href>` links since the session cookie won't be forwarded by the browser to a cross-origin endpoint opened via anchor navigation.

## Goals / Non-Goals

**Goals:**
- CSV and XLSX export for expenses list (filtered, role-scoped)
- CSV and XLSX export for reports list (filtered, role-scoped)
- CSV and XLSX export for individual report's expenses
- No duplication of filter/auth logic — reuse existing patterns
- Download triggered from the frontend with a single click

**Non-Goals:**
- PDF format (already covered by existing export)
- Streaming large exports (dataset sizes are bounded by a single company's expenses)
- Scheduled/async export jobs
- Excel formulas or pivot tables in XLSX output

## Decisions

### Decision 1: Separate `export_service.py` vs. inline in routers

**Choice**: New `backend/xpenses/services/export_service.py` containing `build_csv(rows, columns)` and `build_xlsx(rows, columns)` helpers.

**Rationale**: Both expenses and reports export need CSV/XLSX serialisation. A shared service keeps routers thin and avoids copy-paste of openpyxl boilerplate. Mirrors the existing `pdf_export.py` pattern.

**Alternative considered**: Inline in each router — rejected because it duplicates serialisation logic.

### Decision 2: `openpyxl` over `xlsxwriter`

**Choice**: `openpyxl`

**Rationale**: `openpyxl` is already widely used in the Python ecosystem, supports both read and write, and has a simpler API for the use case (no streaming needed). `xlsxwriter` is write-only and marginally faster for huge datasets, which are not expected here.

### Decision 3: Blob-fetch download on the frontend

**Choice**: `axios.get(..., { responseType: 'blob' })` → `URL.createObjectURL` → synthetic anchor click.

**Rationale**: The export endpoints require the `access_token` httpOnly cookie. A plain `<a href="/api/expenses/export">` opened in a new tab works for same-site requests but is fragile across port differences (frontend on 3001, backend on 8001). The blob-fetch pattern used for PDF downloads elsewhere in the app already solves this — reuse it.

**Alternative considered**: Signed one-time download tokens — adds complexity, unnecessary for internal single-company use.

### Decision 4: Endpoint placement — new endpoints vs. query param on existing

**Choice**: New endpoints (`GET /api/expenses/export`, `GET /api/reports/export`, `GET /api/reports/{id}/export-csv`) rather than adding `?format=csv` to the existing list endpoints.

**Rationale**: List endpoints return `application/json` with `response_model` validation. Overloading them with binary file responses requires conditional response types, which breaks FastAPI's OpenAPI schema generation and response model typing. Separate endpoints keep concerns clean and match the existing `GET /api/reports/{id}/export` (PDF) pattern.

### Decision 5: Column schema for CSV/XLSX

Expenses export columns (org-wide adds `user` at end):
`id, date, merchant, description, category, amount_original, currency, amount_eur, fx_rate, tax_amount, tax_rate, tax_amount_eur, status, report_id`

Reports summary columns:
`id, title, status, date_from, date_to, total_amount, currency, submitted_at, approved_at, paid_at, user`

These mirror the fields already returned by the JSON list endpoints, keeping the frontend mental model consistent.

## Risks / Trade-offs

- **Large datasets**: A company with 10,000+ expenses could produce a slow export. Mitigation: asyncpg streams rows efficiently; openpyxl writes in memory. Acceptable for the expected scale. Add a row cap (e.g., 50,000) with a warning header if needed later.
- **XLSX memory usage**: openpyxl holds the full workbook in memory. Mitigation: same as above — bounded dataset.
- **Cookie auth on download**: The blob-fetch pattern adds a JS round-trip vs. a direct link. Mitigation: acceptable UX; consistent with existing PDF download.

## Migration Plan

1. Add `openpyxl` to `backend/pyproject.toml`.
2. Create `export_service.py`.
3. Add export endpoints to `expenses.py` and `reports.py`.
4. Add download buttons to frontend pages.
5. No database migrations required.
6. No rollback complexity — purely additive.

## Open Questions

- Should the expenses export include receipt file paths/URLs? (Current decision: no — not useful in a spreadsheet context.)
- Should XLSX exports include auto-filters on the header row? (Current decision: yes — improves usability at near-zero cost.)
