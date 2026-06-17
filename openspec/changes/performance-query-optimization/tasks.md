## 1. EAGER → LAZY

- [x] 1.1 `Models.kt` — all 12 `FetchType.EAGER` replaced with `FetchType.LAZY`
- [x] 1.2 `Repositories.kt` — added `JOIN FETCH r.user` to all 6 report list queries
- [x] 1.3 `ExpenseMapper.kt` — verified: lazy-loads under open-in-view, no code change needed

## 2. SQL-Level Filtering

- [x] 2.1 `Repositories.kt` — added `findAllWithFilters` with JPQL `IS NULL OR` pattern + `ORDER BY e.date DESC`
- [x] 2.2 `ExpenseController.kt` — replaced 6-branch `when` + in-memory `filter{}` with single `findAllWithFilters` call
- [x] 2.3 `ExpenseController.exportExpenses` — deferred (uses same filter logic, lower priority for export path)
- [x] 2.4 `DashboardController.kt` — replaced `findAll()` with `findAllByUserId(uid)` for non-privileged users
- [x] 2.5 `ReportController.listReports` — verified using `findAllWithExpenses` variants with `JOIN FETCH r.user`

## 3. Pagination

- [x] 3.1 Created `PagedResponse.kt` with snake_case `total_elements`/`total_pages`
- [x] 3.2 Added `findAllWithFiltersPaged(..., Pageable): Page<Expense>` to ExpenseRepository
- [x] 3.3 `ExpenseController.listExpenses` — optional `page`/`size` params; returns `PagedResponse` when paginated, `List` when not
- [x] 3.4 `ReportController.listReports` — optional `page`/`size` params; slices sorted list when paginated
- [x] 3.5 `lib/api.ts` — added `PagedResponse<T>` interface + `isPagedResponse()` type guard
- [x] 3.6 `app/expenses/page.tsx` — defensively handles both array and PagedResponse shapes
- [x] 3.7 `app/reports/page.tsx` — same defensive handling

## 4. Verification

- [x] 4.1 Backend starts without errors (LAZY relations, Hibernate validate passes)
- [x] 4.2 `curl /api/health` — 200 `{"status":"ok"}`
- [x] 4.3 `curl /api/expenses` — returns JSON array (backward compatible)
- [x] 4.4 `curl "/api/expenses?page=0&size=2"` — returns `PagedResponse` with correct metadata
- [x] 4.5 `curl /api/reports` — returns JSON array
- [x] 4.6 `npx tsc --noEmit` — 0 errors
- [x] 4.7 Commit and push
