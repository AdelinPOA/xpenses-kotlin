## 1. Backend — Dependency & Export Service

- [ ] 1.1 Add `org.apache.poi:poi-ooxml` to `backend-kotlin-jpa/build.gradle.kts` dependencies
- [ ] 1.2 Create `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExportService.kt` with `buildCsv(rows: List<Map<String, Any?>>, columns: List<String>): ByteArray` and `buildXlsx(rows: List<Map<String, Any?>>, columns: List<String>): ByteArray` helpers; XLSX output includes auto-filter on header row via Apache POI `XSSFWorkbook`

## 2. Backend — Expense Export Endpoint

- [ ] 2.1 Add `GET /api/expenses/export` to `ExpenseController.kt` accepting `format`, `from`, `to`, `categoryId`, `status`, `reportId`, `all` query params
- [ ] 2.2 Reuse the in-memory filter logic already in `listExpenses`; apply same role-scoping (`all` flag ignored for non-privileged roles)
- [ ] 2.3 Inject `ExportService`; map filtered `Expense` entities to `Map<String, Any?>` rows using the defined column schema; return `ResponseEntity<ByteArray>` with correct `Content-Type` and `Content-Disposition` header
- [ ] 2.4 Return `400 Bad Request` for unsupported `format` values

## 3. Backend — Report Export Endpoints

- [ ] 3.1 Add `GET /api/reports/export` to `ReportController.kt` accepting `format`, `status`, `all`, `userId` query params; mirrors `listReports` scoping
- [ ] 3.2 Serialise reports with columns: `id, title, status, date_from, date_to, total_amount, currency, submitted_at, approved_at, paid_at, user`; datetime fields as ISO 8601 strings, nulls as empty strings; `user` is the report owner's `displayName`
- [ ] 3.3 Add `GET /api/reports/{reportId}/export-csv` to `ReportController.kt` accepting `format` param; exports expenses belonging to that report without `user` column (all belong to the same owner)
- [ ] 3.4 Apply access control on `export-csv`: owner or privileged role (`manager`, `chef_finance`, `mod`); return `403` otherwise, `404` if report not found (mirrors `getReport` access check pattern)

## 4. Frontend — Download Utility

- [ ] 4.1 Add `downloadBlob(url: string, params: Record<string, unknown>, filename: string): Promise<void>` utility to `frontend/lib/api.ts` using `axios.get(..., { responseType: 'blob' })` → `URL.createObjectURL` → synthetic anchor click → `URL.revokeObjectURL` (reuse pattern from PDF download in report detail page)

## 5. Frontend — Expenses Page

- [ ] 5.1 Add an "Export" dropdown button on `frontend/app/expenses/page.tsx` with two options: "Download CSV" and "Download XLSX"
- [ ] 5.2 Wire the dropdown to call `downloadBlob('/api/expenses/export', { ...activeFilters, format }, 'expenses_<date>.<ext>')`, passing any active filter state already in the page
- [ ] 5.3 Show a loading spinner on the button while the download request is in flight; show a toast on error

## 6. Frontend — Reports Pages

- [ ] 6.1 Add an "Export Reports" dropdown button on `frontend/app/reports/page.tsx` (CSV / XLSX options) wired to `GET /api/reports/export` with active filter state
- [ ] 6.2 Add an "Export Expenses" dropdown button on the report detail page `frontend/app/reports/[id]/page.tsx` alongside the existing PDF export button; wired to `GET /api/reports/{id}/export-csv` with format param
- [ ] 6.3 Show loading state and toast error on both export actions
