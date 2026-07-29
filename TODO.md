# Codebase Review — TODO

## 🔴 HIGH / CRITICAL

- [ ] Private `@Transactional` in ExpenseService — tx never created. Move `@Transactional` to public `createExpense()` entry point
- [ ] Rate limiting TOCTOU race — `cache.get→increment→put` not atomic. Use atomic increment
- [ ] Dashboard loads ALL reports into memory (`findAllWithExpenses().take(10)`). Add `Pageable`/LIMIT in SQL
- [ ] ReportController loads ALL reports with `LEFT JOIN FETCH` when unpaginated. Require pagination or hard limit
- [ ] Stale access tokens remain valid after user deactivation (mitigated by active-check per request, but still a gap)
- [ ] Receipt entity lacks `@Version` for optimistic locking
- [ ] Frontend `NEXT_PUBLIC_API_URL` in docker-compose hardcoded to production domain
- [ ] Frontend Docker healthcheck uses `wget` which doesn't exist in runner image
- [ ] Frontend `.dockerignore` too minimal — missing `.git/`, `.env*`, `Dockerfile`, etc
- [ ] CI `build-docker` rebuilds everything from scratch, discarding pre-compiled artifacts

## 🟡 MEDIUM

- [ ] RateLimitingFilter doesn't exclude OPTIONS/HEAD — preflight consumes quota
- [ ] `BulkExpenseController` receipt save outside transaction — orphan risk
- [ ] Redundant in-memory sorting after DB `ORDER BY` (ReportController, AdvanceController)
- [ ] Missing DB index on `expenses(status)` — sequential scan for all status queries
- [ ] Gemini API key exposed in HTTP request/response payloads
- [ ] No concurrency group in CI workflows — redundant runs queue up
- [ ] `default_batch_fetch_size: 16` too low for reports with many expenses
- [ ] Backend Dockerfile uses unpacked JAR (no layer caching)
- [ ] Backend Docker ENTRYPOINT signal propagation issue (shell wrapper)

## 🔵 LOW / CODE QUALITY

- [ ] Duplicated `validateMagicBytes` logic (ExpenseService + BulkExpenseController)
- [ ] Duplicated receipt save logic (ExpenseService + BulkExpenseController)
- [ ] Inconsistent mapper locations — some controllers define local mappers, ReportMapper has duplicates
- [ ] `requireNotNull` bypasses global exception handler (ExpenseMapper)
- [ ] Hardcoded `/app/data/receipts` path in StorageService — should be `@Value` injected
- [ ] `pre-commit-config.yaml` only runs Python linter (Ruff) — no ktlint or TS linter
- [ ] `ReportService.processAllReportsEagerly()` is dead code (no callers)
- [ ] `console.error` calls in production frontend code (DashboardClient)
