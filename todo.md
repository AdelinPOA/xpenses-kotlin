# TODO.md — xpenses-kotlin

> Regenerated: 2026-06-25 (session 61) — fresh audit
> Source: codebase audit (direct verification + 2 parallel review agents: backend/persistence, security/auth)
>
> NOTE: The previous session-60 list (export OOM, BigDecimal ctor, raw Thread, WebP magic bytes,
> insurance silent catch) is now ALL FIXED by the merged codebase-hardening-round (#9, commit f962ed3).
> Security/auth layer audited clean — no findings (JWT, CSRF, crypto, IDOR scoping, path traversal all solid).

## Recently Fixed (session 61)

### ✅ payReport violated chk_expenses_status (was #1, CRITICAL) — FIXED
- Added migration `V21__add_paid_to_expenses_status.sql` (adds 'paid' to the constraint).
- Added a flushing regression test in `ReportStateMachineTest.kt` that exercises the constraint
  against real Postgres (the old happy-path test never flushed, which hid the bug).
- Verified: the new test passes on JDK21 + Testcontainers.

### ✅ codebase-hardening-round (#9) CSRF filter broke the controller test suite — FIXED
- **Severity:** HIGH (regression in the test safety net, not user-facing).
- **Cause:** `csrfOriginRefererFilter` (`SecurityConfig.kt:93-96`, added in commit f962ed3 / PR #9)
  403s every state-changing request lacking an Origin/Referer header. No MockMvc test sent one,
  so 13/18 ReportStateMachineTest cases (and presumably other controller tests) 403'd. The few
  that "passed" expected 403 anyway — passing for the wrong reason and masking real failures.
- **Fix:** added a `MockMvcBuilderCustomizer` bean in `IntegrationTestBase` that injects a default
  `Origin: http://localhost:3001` (matching cors.allowed-origins) into every MockMvc request.
  Login/refresh are already in the filter's skipPaths.
- **Follow-up:** CI for #9 was green despite this — confirm the CI test job actually runs and fails
  on red. If CI didn't catch a fully-broken controller suite, the gradle test task may be
  misconfigured (e.g. failures not failing the build) — worth checking `.github/workflows/ci.yml`.

### ✅ FxServiceTest asserted Double against BigDecimal — FIXED
- **Severity:** LOW (test-only). `FxServiceTest` asserted `assertEquals(1.0, rate)` / `assertEquals(0.92, rate)`,
  but `FxService.getRate` returns `BigDecimal` (migrated during the BigDecimal hardening). `Double.equals(BigDecimal)`
  is always false, so 3 cases failed. Surfaced once the CSRF fix unblocked the rest of the suite.
- **Fix:** scale-insensitive `BigDecimal.compareTo` assertions in `FxServiceTest.kt`.

### Verification (session 61)
Full backend suite on JDK21 + Testcontainers (run in a temurin:21 Docker container since the host JVM is
JDK25, which can't compile Kotlin 2.1.0): 63 tests, all green after the three fixes above. The local
`make test` cannot run here — host is JDK25; use the Docker path or CI.

## Open Bugs

### 1. payReport violates chk_expenses_status CHECK constraint → 500 in prod (FIXED — see above)
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ReportService.kt:277`
- **Constraint:** `src/main/resources/db/migration/V5__data_integrity_constraints.sql:5-6`
- **Severity:** CRITICAL
- **Problem:** `payReport` sets `exp.status = "paid"` on each expense, but `chk_expenses_status` only permits
  `('draft','submitted','approved','rejected')` for the `expenses` table — `'paid'` is missing (the
  `expense_reports` constraint on line 9 DOES include it). Marking any approved report as paid throws a
  Postgres CHECK violation → HTTP 500, payment rolled back.
- **Why tests miss it:** each `@Transactional` test rolls back without flushing dirty expense entities to
  Postgres, so the constraint is never exercised. Only fires against a real committing transaction in prod.
- **Fix:** new migration `V21__add_paid_to_expenses_status.sql` — DROP + re-ADD `chk_expenses_status` with
  `'paid'` included. (Never edit applied V5.)
- **Status:** [ ] TODO

### 2. mod role can mark reports paid (contradicts documented policy)
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ReportService.kt:259`
- **Severity:** HIGH
- **Problem:** Guard allows `currentUser.role == "mod"` to pay, but CLAUDE.md documents
  "Payment: chef_finance only." Guard contradicts the documented state machine — decide which is correct.
- **Fix:** remove `"mod"` from the payReport role check (or update the documented policy).
- **Status:** [ ] TODO

### 3. Unbounded in-memory load on GET /api/reports?all=true (and export)
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt:76` (and `:520`)
- **Query:** `repositories/Repositories.kt:45` `findAllWithExpenses()`
- **Severity:** HIGH
- **Problem:** Privileged `?all=true` path runs a `LEFT JOIN FETCH` with no WHERE/LIMIT — loads every report
  + every attached expense org-wide into memory (cartesian-product multiplication), then sorts/paginates in
  Kotlin. OOM risk as data grows. (`ReportService.processAllReportsEagerly()` has the same pattern but is
  unused — verify before removing.)
- **Fix:** require pagination for the unfiltered "all" path; push status/date filters down to SQL.
- **Status:** [ ] TODO

### 4. FX cache duplicate-row race
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:24-57`
- **Severity:** MEDIUM
- **Problem:** check-then-insert with NO unique constraint on `fx_rates(from_currency, to_currency, rate_date)`.
  Two concurrent expense entries for the same new (currency, date) both miss cache and both `save()` → duplicate
  rows. Future `findByFromCurrencyAndToCurrencyAndRateDate` returns an arbitrary row, so two same-day same-currency
  expenses can get different EUR conversions.
- **Fix:** add unique index on `fx_rates(from_currency,to_currency,rate_date)` + `ON CONFLICT DO NOTHING`
  (or catch `DataIntegrityViolationException` and re-read), instead of the generic `catch (e: Exception)`.
- **Status:** [ ] TODO

### 5. getExpense omits "manager" from privileged role allowlist (inconsistency)
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt:109`
- **Severity:** LOW
- **Problem:** receipt/export endpoints in the same file include `"manager"` in their privileged allowlist;
  `getExpense` does not. A manager gets 403 fetching a single expense by ID they don't own, despite being able
  to list/export it. Fails closed (not a vuln), but inconsistent.
- **Fix:** add `"manager"` to the role list on line 109 to match the other endpoints.
- **Status:** [ ] TODO

## Notes (not bugs)
- `FxService.convert()` (`FxService.kt:60`) divides where every real caller multiplies — inverted relative to
  the codebase convention, but has ZERO callers (dead code). Fix or delete if ever wired up.
