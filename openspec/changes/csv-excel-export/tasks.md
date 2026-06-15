## 1. Backend — Dependency & Export Service

- [ ] 1.1 Add `openpyxl` to `backend/pyproject.toml` dependencies
- [ ] 1.2 Create `backend/xpenses/services/export_service.py` with `build_csv(rows, columns, include_user)` and `build_xlsx(rows, columns, include_user)` helpers; XLSX output includes auto-filter on header row
- [ ] 1.3 Write unit tests for `build_csv` and `build_xlsx` (column order, date formatting, monetary precision, empty dataset)

## 2. Backend — Expense Export Endpoint

- [ ] 2.1 Add `GET /api/expenses/export` to `expenses.py` accepting `format`, `from`, `to`, `category_id`, `status`, `report_id`, `all` query params
- [ ] 2.2 Reuse existing filter query logic from `list_expenses`; apply same role-scoping (`all` flag ignored for non-privileged users)
- [ ] 2.3 Return `StreamingResponse` / `Response` with correct `Content-Type` and `Content-Disposition` header for both CSV and XLSX
- [ ] 2.4 Return `400` for unsupported `format` values
- [ ] 2.5 Write integration tests: own-data CSV, org-wide XLSX (manager), filter by date range, unsupported format 400

## 3. Backend — Report Export Endpoints

- [ ] 3.1 Add `GET /api/reports/export` to `reports.py` accepting `format`, `status`, `all`, `user_id` query params; mirrors `list_reports` scoping
- [ ] 3.2 Serialise reports with columns: `id, title, status, date_from, date_to, total_amount, currency, submitted_at, approved_at, paid_at, user`; datetime fields as ISO 8601, nulls as empty strings
- [ ] 3.3 Add `GET /api/reports/{report_id}/export-csv` to `reports.py` accepting `format` param; exports expenses belonging to that report without `user` column
- [ ] 3.4 Apply access control on `export-csv`: owner or privileged role; return `403` otherwise, `404` if report not found
- [ ] 3.5 Write integration tests: CFO org-wide report export, technician own-reports export, per-report expense export (owner OK, other user 403, not-found 404)

## 4. Frontend — Download Utility

- [ ] 4.1 Add `downloadBlob(url, params, filename)` utility to `frontend/lib/api.ts` using `axios.get(..., { responseType: 'blob' })` → `URL.createObjectURL` → synthetic anchor click → `URL.revokeObjectURL`

## 5. Frontend — Expenses Page

- [ ] 5.1 Add an "Export" dropdown button on `frontend/app/expenses/page.tsx` with two options: "Download CSV" and "Download XLSX"
- [ ] 5.2 Wire the dropdown to call `downloadBlob('/api/expenses/export', { ...activeFilters, format }, 'expenses_<date>.<ext>')`, passing any active filter state already in the page
- [ ] 5.3 Show a loading spinner on the button while the download request is in flight; show a toast on error

## 6. Frontend — Reports Pages

- [ ] 6.1 Add an "Export Reports" dropdown button on `frontend/app/reports/page.tsx` (CSV / XLSX options) wired to `GET /api/reports/export` with active filter state
- [ ] 6.2 Add an "Export Expenses CSV" button on the report detail page `frontend/app/reports/[id]/page.tsx` alongside the existing PDF export button; wired to `GET /api/reports/{id}/export-csv`
- [ ] 6.3 Add XLSX option to the report detail export as well (dropdown mirroring the PDF button style)
- [ ] 6.4 Show loading state and toast error on both export actions
