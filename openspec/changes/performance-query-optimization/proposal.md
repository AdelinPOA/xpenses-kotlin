## Why

The post-hardening audit identified three performance issues that will cause degradation as data grows: (1) 12 `@ManyToOne(fetch = FetchType.EAGER)` relations on `ExpenseReport`, `Expense`, `AdvancePayment`, `MileageRecord`, and `OcrComparison` cause N+1 query storms on every list endpoint — `DashboardController.findAll()` loads 4 User rows per report via separate SELECTs; (2) `ExpenseController.listExpenses` fetches all matching rows from the DB then applies `reportId` and `categoryId` filters in Kotlin memory; (3) no endpoint supports pagination, so `GET /api/expenses` on a 50k-row database will serialize and transfer the entire table.

## What Changes

- **Convert all 12 `FetchType.EAGER` → `FetchType.LAZY`** in `Models.kt`. Safe because `spring.jpa.open-in-view` is enabled (default), keeping the Hibernate session open through the entire HTTP request — lazy relations load on demand in controller methods. Add `JOIN FETCH` to repository queries where relations are always accessed in list/serialization paths (e.g., `findAllWithExpenses` will also `JOIN FETCH r.user`).
- **Add a single comprehensive `@Query` method** `findAllWithFilters` to `ExpenseRepository` that accepts all optional filter parameters (userId, status, reportId, categoryId, fromDate, toDate) using JPQL `IS NULL` pattern. Replace the 6-branch `when` block + in-memory `filter{}` calls in `ExpenseController.listExpenses` and `exportExpenses` with this single query. Add equivalent filtered query for `ExpenseReportRepository`.
- **Add optional pagination** via `Pageable` parameter on list endpoints. When `page` query param is absent, use `Pageable.unpaged()` (backward compatible — returns all rows). When `page` is provided (e.g., `?page=0&size=20`), return a `PagedResponse<T>` wrapper with `data`, `page`, `size`, `total_elements`, `total_pages`. Frontend updated to handle both shapes.

## Capabilities

### New Capabilities
- `entity-fetch-lazy`: All `@ManyToOne` relations default to `FetchType.LAZY`; repository queries use `JOIN FETCH` where relations are needed for serialization.
- `sql-level-filtering`: `ExpenseRepository` and `ExpenseReportRepository` accept all filter parameters at the JPQL level, eliminating in-memory `filter{}` chains.
- `api-pagination`: List endpoints (`/api/expenses`, `/api/reports`) accept optional `page` + `size` query params and return `PagedResponse<T>` when paginated.

### Modified Capabilities

## Impact

- **Backend**: `Models.kt` (12 annotation changes), `Repositories.kt` (new `@Query` methods + `Pageable` variants), `ExpenseController.kt` (simplified `listExpenses` + `exportExpenses`), `ReportController.kt` (simplified `listReports`), `DashboardController.kt` (use scoped queries instead of `findAll`), new `PagedResponse` DTO.
- **Frontend**: `lib/api.ts` (handle `PagedResponse<T>` wrapper), `app/expenses/page.tsx` and `app/reports/page.tsx` (consume pagination metadata, add "Load more" button when `total_pages > 1`).
- **No breaking changes**: when `page` param is absent, endpoints return arrays exactly as before. `open-in-view: true` guarantees no `LazyInitializationException`.
