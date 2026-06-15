## Context

The active backend is `backend-kotlin-jpa/` — a Spring Boot 3.4.3 + Kotlin 2.1.0 + Spring Data JPA application. Controllers are in `src/main/kotlin/eu/nt/xpenses/controllers/`. Export endpoints need to reuse the existing in-memory filter logic from `ExpenseController.listExpenses` and `ReportController.listReports` rather than duplicate it. PDF export already exists in `PdfService.kt` + `ReportController.exportPdf` as a reference pattern. The frontend uses TanStack Query + axios with `withCredentials: true` — file downloads need a blob-fetch approach rather than bare `<a href>` links since the session cookie won't be forwarded by the browser to a cross-origin endpoint opened via anchor navigation.

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

### Decision 1: Separate `ExportService.kt` vs. inline in controllers

**Choice**: New `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExportService.kt` containing `buildCsv(rows, columns)` and `buildXlsx(rows, columns)` helpers.

**Rationale**: Both expenses and reports export need CSV/XLSX serialisation. A shared service keeps controllers thin and avoids copy-paste of Apache POI boilerplate. Mirrors the existing `PdfService.kt` pattern.

**Alternative considered**: Inline in each controller — rejected because it duplicates serialisation logic.

### Decision 2: Apache POI (`poi-ooxml`) over other JVM Excel libraries

**Choice**: `org.apache.poi:poi-ooxml`

**Rationale**: Apache POI is the de-facto standard for JVM Excel generation, well-maintained, supports both `.xls` and `.xlsx` (OOXML), and has a straightforward streaming workbook API (`SXSSFWorkbook`) for memory-efficient output. The alternative (`fastexcel`) is lighter but less mature. Dataset sizes are small enough that even the standard `XSSFWorkbook` (in-memory) works fine.

### Decision 3: Blob-fetch download on the frontend

**Choice**: `axios.get(..., { responseType: 'blob' })` → `URL.createObjectURL` → synthetic anchor click.

**Rationale**: The export endpoints require the `access_token` httpOnly cookie. A plain `<a href="/api/expenses/export">` opened in a new tab is fragile across port differences (frontend on 3001, backend on 8001). The blob-fetch pattern used for PDF downloads in `ReportController.exportPdf` already solves this — reuse it.

**Alternative considered**: Signed one-time download tokens — adds complexity, unnecessary for internal single-company use.

### Decision 4: Endpoint placement — new endpoints vs. query param on existing

**Choice**: New endpoints (`GET /api/expenses/export`, `GET /api/reports/export`, `GET /api/reports/{id}/export-csv`) rather than adding `?format=csv` to the existing list endpoints.

**Rationale**: List endpoints return `application/json`. Overloading them with binary file responses requires conditional `Content-Type` handling and breaks the controller's response model clarity. Separate endpoints match the existing `GET /api/reports/{id}/export` (PDF) pattern in `ReportController.kt`.

### Decision 5: Column schema for CSV/XLSX

Expenses export columns (org-wide adds `user` at end):
`id, date, merchant, description, category, amount_original, currency, amount_eur, fx_rate, tax_amount, tax_rate, tax_amount_eur, status, report_id`

Reports summary columns:
`id, title, status, date_from, date_to, total_amount, currency, submitted_at, approved_at, paid_at, user`

These mirror the fields already returned by the JSON list endpoints, keeping the frontend mental model consistent.

### Decision 6: Data access in Kotlin

Unlike the Python backend (raw SQL returning dicts), the Kotlin controllers already hold JPA entity objects in memory after `findAll()`. `ExportService` receives typed entity/DTO lists and maps their fields to rows — no additional DB queries needed.

## Risks / Trade-offs

- **Large datasets**: A company with 10,000+ expenses could produce a slow export. Mitigation: entities are already loaded in memory by the controller; POI writes to a `ByteArrayOutputStream`. Acceptable for expected scale. Add a row cap (e.g., 50,000) with a warning if needed later.
- **XLSX memory usage**: `XSSFWorkbook` holds the full workbook in memory. Mitigation: same as above — bounded dataset. Can switch to `SXSSFWorkbook` if needed.
- **Cookie auth on download**: The blob-fetch pattern adds a JS round-trip vs. a direct link. Mitigation: acceptable UX; consistent with existing PDF download.

## Migration Plan

1. Add `poi-ooxml` to `backend-kotlin-jpa/build.gradle.kts`.
2. Create `ExportService.kt`.
3. Add export endpoints to `ExpenseController.kt` and `ReportController.kt`.
4. Add download buttons to frontend pages.
5. No database migrations required.
6. No rollback complexity — purely additive.

## Open Questions

- Should the expenses export include receipt file paths? (Current decision: no — not useful in a spreadsheet context.)
- Should XLSX exports include auto-filters on the header row? (Current decision: yes — improves usability at near-zero cost.)
