# Code Review — xpenses-kotlin

Reviewed: Kotlin/Spring Boot backend (`backend-kotlin-jpa`) + Next.js 15 frontend (`frontend`).

## Backend (Kotlin / Spring Boot)

### Critical / High
- **Refresh-token reuse (#2):** `AuthController.refresh` rotates but has no reuse detection (no token family/`replaced_at`). Stolen tokens usable until expiry; concurrent use possible. Add family tracking and reject already-replaced tokens.
- **Report list cartesian + stale collection (#12, #14):** `LEFT JOIN FETCH r.expenses` duplicates rows when a report has multiple expenses → wrong `.size`/pagination counts in `ReportController.listReports`/`exportReports`. `submitReport` trusts an unrefreshed `report.expenses` (works in tests only because of `entityManager.clear()`) → can throw "No expenses attached" in prod. Use `SELECT DISTINCT r` + separate count, and reload report after attaching.
- **Soft-delete not cascaded (#21):** Deleting a report soft-deletes only the report; expenses & receipts stay `deleted=false` and remain visible/downloadable. Cascade in service layer.
- **Flyway `validate-on-migrate: false` (#24):** silent schema drift allowed. Set `true`.
- **Swagger public when enabled (#47):** `/v3/api-docs`, `/swagger-ui` are `permitAll`; if `SWAGGER_ENABLED=true` in prod the full schema is exposed unauthenticated. Gate behind `hasRole('mod')` or keep disabled in prod profile.
- **Dashboard/report full-table in-memory aggregation (#31):** `DashboardController`, `ReportController` load all rows then aggregate/filter in Kotlin. Use SQL `COUNT`/`SUM` + paginated queries at scale.

### Medium
- Secrets coupling (#1): if `ENCRYPTION_SECRET` omitted it reuses `JWT_SECRET`. Fail fast if equal/blank.
- Manual `fxRate` unvalidated (#9): zero/negative overwrites `amountEur` to 0. Validate `> 0`.
- Lazy-init on GET (#16, #44): `deleteReport`/getReceiptCompat touch lazy collections without `findByIdWithExpenses` → `LazyInitializationException` if OIV off.
- Client-supplied `Content-Type` on insurance upload (#43): stored XSS risk via MIME sniffing; use validated extension MIME.
- IMAP unbounded batch (#41): no max batch size → mailbox flood blocks pool.
- Status strings hardcoded everywhere (#30): enum/constant instead of `'requested'`/`'paid'` literals.
- Info-level log spam in PDF gen (#37).

## Frontend (Next.js / React)

### Critical
- **Refresh retry queue (#C1):** `lib/api.ts` queues 401s but never sets `_retry` on queued requests → possible refresh-loop + duplicate `/auth/refresh`.
- **Interceptor mutates `error.response.data` (#C2):** writes `.detail` onto blobs/strings → corrupts/throws. Guard with object check.

### High
- **Broken SSR hydration (#H1):** server prefetch key `[...dashboardKeys.all, {all}]` ≠ client key `[...all, user.id, {all}]` → prefetch wasted, content flash. Share one key helper.
- **Object URLs created in render (#H2):** `getObjectUrl` in `ExpenseForm` render body leaks blob URLs on add/remove. Move to `useEffect`.
- **`<a href>`/`<img src>` for auth downloads (#H3):** violates project's own anti-pattern; breaks cross-origin / `target="_blank"`. Route through `downloadBlob`.
- **Three redirect-to-login paths race (#H4):** AuthProvider effect + api interceptor + middleware. Consolidate.
- **`useSearchParams` one-way (#H5):** category filter never resets from URL / never pushed → state/URL diverge.

### Medium
- `as any` on `zodResolver` (#M1) defeats type safety across admin forms.
- Pervasive `catch (e: any)` (#M2) — adopt the `e: unknown` + typed cast pattern already used in ldap page; add `getApiErrorMessage`.
- Empty `catch` silently reverts edits (#M3).
- `parseInt`/`parseFloat` without NaN guard (#M4); `|| 0` coercion on money fields is a data-integrity risk.
- Non-deterministic toast keys (#M5) → use `crypto.randomUUID`.
- **Fabricated dashboard metrics (#M9):** hardcoded "+12.4%", "€25k budget", fake "Total Pending" shown to finance users — misleading. Wire to real data.

### Low
- Dead code `isDragging ? null : null` (#L1); `window.location.href` internal nav (#L2); index `key={i}` (#L6); `serverApi` no timeout (#L5); `next.config.ts` hardcoded `cpus:6` (#L7); login swallows all errors (#L10).

## Recommended priority order
1. Backend #2, #12/#14, #21, #24, #47 (security + data integrity)
2. Frontend #C1, #C2, #H1, #M9 (auth correctness + misleading financial data)
3. Backend #31, #1, #9, #16/#44, #43; Frontend #H2, #H3, #H4, #M1–M4
