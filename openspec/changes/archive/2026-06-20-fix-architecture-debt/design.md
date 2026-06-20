## Context

The Kotlin/Spring Boot backend (`backend-kotlin-jpa/`) and Next.js 15 frontend accumulated four verified architecture debts (see `proposal.md`). Constraints that shape the design:

- **JPA + Flyway with `ddl-auto: validate`** — all schema changes MUST go through Flyway migrations; entities are validated against the DB, not generated.
- **OSIV is on** (Spring default) — lazy loads currently resolve during serialization.
- **Cookie-based auth** — `JwtAuthenticationFilter` reads the `access_token` cookie and sets `request` attribute `currentUser`. The frontend uses `withCredentials`; cookies do not forward cross-port automatically.
- **No message broker** is deployed and adding one is out of scope; async work must use in-process primitives.
- **Tests** use Testcontainers + MockMvc; a goal here is to make core logic testable *without* MockMvc.

## Goals / Non-Goals

**Goals:**
- Thin controllers; report state machine and expense rules live in services with `@Transactional` at the service boundary.
- Receipt OCR no longer blocks Tomcat HTTP threads; scan returns `202` + pollable status.
- Expense/Report/Receipt deletes preserve audit history via soft delete, transparently excluded from normal reads.
- Dashboard and expenses pages get server-fetched initial data with client interactivity preserved.

**Non-Goals:**
- Introducing RabbitMQ/Kafka or any external queue.
- Re-fixing the N+1 (already done) or the date-typing finding (false premise).
- A full RSC rewrite of every page — only `dashboard` and `expenses` entry points.
- Changing auth mechanism, FX caching strategy, or storage providers.

## Decisions

### D1: Extract logic into `ReportService` / `ExpenseService`, transactions at service layer
Controllers keep only: resolve `currentUser`, parse params, call service, map result. `@Transactional` moves from controller methods onto service methods. Domain guard failures throw a small set of exceptions (or `ResponseStatusException`) mapped to `400/403/404`.
- *Why over keeping controllers:* enables unit tests with mocked repos (no MockMvc), restores SRP, and isolates the state machine.
- *Alternative considered:* a dedicated `ReportWorkflowService` separate from `ReportService`. Rejected for now — the existing `ReportService` is the natural home; splitting can come later if it grows.

### D2: Async OCR via Spring `@Async` + bounded `ThreadPoolTaskExecutor` + DB-backed job status
Scan endpoint persists a job/receipt row in `processing` state, submits the OCR call to a dedicated executor, returns `202` with the job id. A status endpoint reads job state. The executor has a fixed core/max pool and a bounded queue with a defined rejection policy (backpressure).
- *Why over a broker:* satisfies the requirement with zero new infrastructure; survives the no-broker constraint.
- *Why DB-backed status (not in-memory map):* status must survive across the existing single instance cleanly and be pollable; reuses existing `OcrComparison`/receipt persistence patterns.
- *Alternative considered:* Kotlin coroutines / WebClient reactive. Rejected — the stack is Spring MVC (synchronous), and `@Async` + executor is the idiomatic minimal-change fit.

### D3: Soft delete via Hibernate `@SQLDelete` + `@SQLRestriction`
Add a `deleted BOOLEAN NOT NULL DEFAULT false` (and `deleted_at TIMESTAMP NULL`) column to `expenses`, `expense_reports`, `receipts` via Flyway. Annotate the entities with `@SQLDelete(sql = "UPDATE ... SET deleted = true, deleted_at = now() WHERE id = ?")` and `@SQLRestriction("deleted = false")` so all default reads exclude soft-deleted rows automatically.
- *Why `@SQLRestriction` over per-query filters:* one declaration covers every derived/JPQL read; avoids touching dozens of queries.
- *Audit path:* an explicit native/`@Query(nativeQuery)` bypass for admin/audit reads (since `@SQLRestriction` always applies to entity reads).
- *Alternative considered:* `@FilterDef`/`@Filter` (must be enabled per session) — rejected as more error-prone than always-on `@SQLRestriction`.

### D4: RSC initial fetch + TanStack Query hydration with cookie forwarding
Convert `dashboard/page.tsx` and `expenses/page.tsx` so a server component does the first fetch against `INTERNAL_API_URL`, forwarding the `access_token` cookie via `next/headers` `cookies()`. Wrap the existing client component in a `HydrationBoundary` seeded with `dehydrate(queryClient)` using the same query keys, so existing `useQuery` hooks adopt the server data and skip the initial refetch.
- *Why hydration over full RSC rewrite:* preserves all existing client interactivity (filters, mutations) with minimal churn.
- *Alternative considered:* moving everything server-side and dropping TanStack Query — rejected; the pages are interactive and that would be a large, risky rewrite (the review rated this "High" complexity).

## Risks / Trade-offs

- **Moving `@Transactional` to services changes transaction scope** → write service unit + integration tests for each transition before deleting controller logic; verify rejected transitions roll back.
- **`@SQLRestriction` is global and silent** → audit/admin reads that need deleted rows will break unless an explicit bypass is provided; document and test the audit path. Existing unique constraints may conflict with retained rows → verify constraints tolerate soft-deleted duplicates.
- **Flyway migration on existing data** → column added with `DEFAULT false` so existing rows are valid; migration is additive and backward-compatible.
- **OCR `202` is a breaking API change** → frontend must switch to submit-then-poll; coordinate frontend update in the same change or keep a temporary synchronous fallback flag.
- **DB-backed job status adds write load** → minimal (one row per scan); acceptable.
- **RSC cookie forwarding** → if the cookie isn't forwarded, server fetch returns 401 and the page renders empty; test authenticated + unauthenticated paths.

## Migration Plan

1. Ship the Flyway migration (additive column) first — safe to deploy independently.
2. Land soft-delete annotations + audit bypass; verify reads exclude deleted rows.
3. Extract services (report, then expense) behind unchanged HTTP contracts; tests green before/after.
4. Land async OCR backend (`202` + status endpoint) with optional synchronous fallback flag.
5. Update frontend OCR client to poll; then migrate dashboard/expenses to RSC + hydration.
6. Rollback: each step is independent; the additive migration need not be reverted. Revert annotations/code per step if needed.

## Open Questions

- OCR job status: reuse an existing table/entity or add a dedicated `ocr_jobs` table? (Leaning: dedicated lightweight table.)
- Soft delete: do `orphanRemoval`/cascade child receipts need explicit soft-delete handling, or is per-entity `@SQLDelete` sufficient under cascade? Verify during implementation.
- Should the OCR synchronous fallback flag be retained long-term or removed once the frontend polls?
