## Context

The Kotlin backend has 12 `@ManyToOne(fetch = FetchType.EAGER)` relations across 5 entities. Combined with `findAll()` calls in `DashboardController` and in-memory `filter{}` chains in `ExpenseController`, this creates N+1 query patterns that will degrade severely as the expense table grows beyond a few thousand rows.

Spring Boot's default `spring.jpa.open-in-view: true` is active (confirmed in startup logs: `HHH000489: No JTA platform available`). This keeps the Hibernate session open for the entire HTTP request lifecycle, meaning lazy relations can be safely accessed in controller methods without `LazyInitializationException`.

The existing repository layer already has `JOIN FETCH` variants for `findAllWithExpenses` (fetches `r.expenses` eagerly via JPQL), but does NOT join-fetch the User relations on `ExpenseReport` (user, signer, approvedBy, rejectedBy) — these are the 4 EAGER fetches that fire per-report.

Stack: Kotlin 2.1.0, Spring Boot 3.4.3, Spring Data JPA, Hibernate, PostgreSQL 16.

## Goals / Non-Goals

**Goals:**
- Eliminate N+1 queries on list endpoints by switching EAGER → LAZY and adding targeted JOIN FETCH
- Push all filter logic to JPQL queries (no in-memory `filter{}` after a `findAll()`)
- Add optional pagination so the API doesn't serialize unbounded result sets
- Maintain 100% backward compatibility — no breaking API changes when pagination params are absent

**Non-Goals:**
- No DTO projections / Spring Data projections (keep returning JPA entities + mapping to *Out DTOs)
- No read-replica / CQRS split
- No caching layer (Redis/Hazelcast) — Hibernate L2 cache is sufficient for now
- No full-text search refactoring
- No `open-in-view: false` migration (that's a larger change requiring OSIV → DTO pattern refactor)

## Decisions

### Decision 1: EAGER → LAZY is safe under open-in-view

**Choice**: Change all 12 `FetchType.EAGER` to `FetchType.LAZY` in `Models.kt`.

**Rationale**: `spring.jpa.open-in-view: true` (Spring Boot default) keeps the Hibernate session bound to the request thread. Every controller method runs inside this session, so `report.user?.displayName` triggers a lazy load — one extra `SELECT ... FROM users WHERE id = ?` per distinct user. With `default_batch_fetch_size: 16` (already set in `application.yml:19`), Hibernate batches these into IN-clause queries of 16 IDs max. For a dashboard loading 10 reports with 4 distinct users, this is 1 batched SELECT instead of 40 individual EAGER SELECTs.

For the `JOIN FETCH` paths (report lists with expenses), we add explicit `JOIN FETCH r.user` to the JPQL so the user is loaded in the same query, not via a separate lazy SELECT.

**Alternatives considered**: Set `open-in-view: false` and add `@Transactional(readOnly = true)` to all read endpoints. Rejected — requires auditing every lazy-access site and is a separate concern. The OSIV default is safe for this app's scale (~50 users, ~10k expenses).

### Decision 2: Single comprehensive `@Query` with IS NULL pattern

**Choice**: Add `findAllWithFilters` to `ExpenseRepository` using JPQL `:param IS NULL OR e.field = :param` pattern for all 6 optional parameters.

```jpql
SELECT e FROM Expense e
WHERE (:userId IS NULL OR e.user.id = :userId)
  AND (:status IS NULL OR e.status = :status)
  AND (:reportId IS NULL OR e.report.id = :reportId)
  AND (:categoryId IS NULL OR e.category.id = :categoryId)
  AND (:fromDate IS NULL OR e.date >= :fromDate)
  AND (:toDate IS NULL OR e.date <= :toDate)
ORDER BY e.date DESC
```

**Rationale**: Replaces the 6-branch `when` block + 2 in-memory `filter{}` calls with a single DB-level query. PostgreSQL handles `IS NULL OR` efficiently. The `ORDER BY e.date DESC` is pushed to the DB (currently done in Kotlin via `sortedByDescending`).

**Alternatives considered**: Spring Data `Specification<T>` (Criteria API). Rejected — adds boilerplate (factory methods, `SpecificationExecutor` interface) for what is a single static query. JPA Criteria is better when the number of combinations is truly dynamic, but here the parameter set is fixed.

### Decision 3: Optional pagination via `Pageable.unpaged()` default

**Choice**: Add `Pageable` parameter to repository methods. In the controller, if the `page` query param is present, create `PageRequest.of(page, size)`; if absent, pass `Pageable.unpaged()` which returns all rows in a single-page `Page`.

When paginated, the controller wraps results in a `PagedResponse<T>` data class:
```kotlin
data class PagedResponse<T>(
    val data: List<T>,
    val page: Int,
    val size: Int,
    val totalElements: Long,
    val totalPages: Int
)
```

When unpaginated, the controller returns `List<T>` directly (backward compatible).

**Rationale**: `Pageable.unpaged()` is a first-class Spring Data feature designed exactly for this. The frontend can opt into pagination by sending `?page=0&size=20`; existing calls without `page` continue to work. The `PagedResponse` wrapper is serialized to JSON with a `data` array — the frontend checks `response.data` vs `response` (array) to detect which shape it received.

**Alternatives considered**: Always paginate with a default `size=100`. Rejected — the frontend has no "load more" UI yet; silently truncating to 100 would hide expenses and confuse users. Better to make pagination opt-in.

### Decision 4: DashboardController scope fix — use `findAllByUserId` for non-privileged users

**Choice**: In `DashboardController.getDashboard`, replace `expenseRepository.findAll()` with `expenseRepository.findAllByUserId(uid)` for non-privileged users. Only `chef_finance`/`mod`/`manager` (with `all=true`) use `findAll()`.

**Rationale**: Currently every technician's dashboard triggers `findAll()` (ALL expenses for ALL users) then filters in memory to the current user's data. This is both a performance issue and a data-leak surface (the data is filtered after loading). Switching to `findAllByUserId` is one line.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| EAGER → LAZY could cause `LazyInitializationException` if any code accesses a relation outside a web request (e.g., `@Async` email service serializing a report) | `@Async` methods in `EmailSettingsService` receive detached entities. Audit: `ReportController.submit/pay/approve/reject` pass primitive IDs + re-fetch the user's email inside the `@Transactional` method, not the async callback. `PdfService` receives entities within the request thread (called synchronously from `exportReportPdf`). Safe. |
| `IS NULL OR` JPQL pattern may produce suboptimal query plans on PostgreSQL | PostgreSQL's planner handles `OR col IS NULL` well with parameterized prepared statements. Hibernate prepares these. Verify with `EXPLAIN ANALYZE` if performance is unexpectedly slow. |
| `PagedResponse` wrapper changes JSON shape when `page` param is provided | Documented: when `page` is absent, shape is unchanged (`[...]`); when present, shape is `{data: [...], page, size, ...}`. Frontend adapter checks `Array.isArray(response)`. |
| `Pageable.unpaged()` still executes a `COUNT(*)` query on large tables | Spring Data skips the count query for `unpaged()` — confirmed in `PageableExecutionUtils.getPage()`. No count overhead for backward-compatible calls. |
| Removing in-memory sort (`sortedByDescending`) in favor of JPQL `ORDER BY` changes tie-breaking order | JPQL `ORDER BY e.date DESC` is deterministic for distinct dates. For same-date expenses, DB returns by physical order (insertion order for SERIAL PK). Acceptable. |
