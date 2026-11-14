# General Stabilization, Hygiene & Documentation Plan (`xpenses-kotlin`)

Generated: 2026-11-14
Priority companion: see [important-todo.md](important-todo.md) for the urgent AI Import Order & Expense OCR execution plan.

---

## 1. Live Deployment Drift (Immediate Operations Check)

- **Observed state**: Live `xpenses-backend` and `xpenses-frontend` containers run tag `import-order-b151269`, two commits behind `origin/main` (`2459290`).
  - Missing `3d44cb9`: CIDR `trusted-proxies` (`172.16.0.0/12`, `10.0.0.0/8`) and `CF-Connecting-IP` support in `RateLimitingFilter` / `application-prod.yml`. Without it, proxied users can collapse into a single IP bucket and hit intermittent `429` limits.
  - Missing `2459290`: `frontend/Dockerfile` default `NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED=true`.
- **Action**:
  - [x] Align `docker-compose.yml` build-arg default for `NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED` to `true`.
  - [x] Roll out updated backend & frontend images cleanly (no `docker compose down`, preserve persistent volumes).

---

## 2. Core Reliability Bugs ("Works on the 2nd Try")

### P0 — OCR Result Cache Concurrent-Insert Crash
- **File**: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt` (`prepareScan`, `saveCacheResult`)
- **Cause**: `acquireScanLock` (`pg_advisory_xact_lock`) ends when `prepareScan` commits before the AI HTTP call runs. Concurrent scans of the same receipt race into `saveCacheResult()` and hit `uq_ocr_result_cache_identity` (confirmed in live logs on `2026-11-11 15:52 UTC`).
- **Fix**: Replace `save` with PostgreSQL `ON CONFLICT DO UPDATE` upsert / isolated `REQUIRES_NEW` conflict handling. *(Tracked in `important-todo.md` Milestone 1)*

### P0 — FX Rate Cache Insert Race Inside Active `@Transactional`
- **File**: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt`, `ExpenseService.kt`
- **Cause**: `FxService.getRate` catches `DataIntegrityViolationException` inside caller `@Transactional` (`createExpense`, `updateExpense`, `reviewExpense`), aborting the Postgres transaction (`25P02`) on concurrent requests. External FX HTTP calls (`HttpFxRateProvider`) also execute while holding DB transactions open.
- **Fix**: Persist FX cache rows in `REQUIRES_NEW` + `ON CONFLICT DO NOTHING` / catch-and-reselect outside caller transaction, and resolve missing FX rates before starting expense write transactions. *(Tracked in `important-todo.md` Milestone 1)*

### P0 — Auth Refresh Token Rotation Race & Cross-Device Kickout
- **Files**: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt`, `frontend/lib/api.ts`, `frontend/components/AuthProvider.tsx`
- **Cause**:
  - `AuthController.refresh` immediately deletes `RefreshToken`; concurrent duplicate refreshes (`access_token` still valid) increment `user.tokenVersion++` and wipe all refresh tokens.
  - `AuthProvider.scheduleProactiveRefresh()` calls `/auth/refresh` independently of `api.ts`'s `isRefreshing` lock and without cross-tab coordination (`BroadcastChannel` / `navigator.locks`).
  - `AuthController.login` deletes all existing user refresh tokens, kicking out other logged-in devices.
- **Fix**:
  - [x] Share one single-flight refresh lock across `AuthProvider` and `api.ts` + cross-tab coordination.
  - [x] Add short grace window / row lock for recently rotated refresh tokens before treating reuse as theft, and support per-session tokens instead of wiping all devices on login.

---

## 3. Report, Bulk, FX UI & Prod Log Hygiene (P1)

- [x] **Atomic New Report Creation** (`frontend/app/reports/new/page.tsx`, `ReportController.kt`): Allow optional `expense_ids` + `Idempotency-Key` in `POST /api/reports` instead of two non-atomic calls (`POST /reports` + `POST /reports/{id}/attach`) that duplicate draft reports if `attach` fails.
- [ ] **Invalid Demo Emails in Production DB**: Deactivate or remove seeded `@nt-automation.eu` demo manager/CFO accounts (`maria.ionescu@nt-automation.eu`, `elena.dumitrescu@nt-automation.eu`) on prod after verifying active users *(inspected read-only — awaiting explicit approval before mutating live user rows; blank emails also present on `cristi`/`bianca`)*, and **done:** guarded `EmailSettingsService.sendEmail` against blank/invalid/placeholder addresses cleanly.
- [x] **Spring Boot Log Hygiene** (`application.yml`): Set `spring.jpa.open-in-view: false`, remove deprecated explicit `PostgreSQLDialect`, and exclude unused `UserDetailsServiceAutoConfiguration` dev password noise.
- [x] **FxRateInput State Reset** (`frontend/components/expenses/FxRateInput.tsx`): Reset `debitTouched` and local inputs when `currency` changes and verify EUR round-trip clears manual override cleanly.

---

## 4. Open Tracked GitHub Issues (P1/P2)

- [ ] **`#58` / `#59`**: PWA service worker cache isolation and safe offline cold-start on iPhone.
- [ ] **`#57` / `#60`**: Orphan receipt cleanup & OCR source retention reconciliation (`OCR_SOURCE_CLEANUP_ENABLED` must stay `false` until resolved).
- [ ] **`#48` / `#45` / `#50` / `#51`**: Mobile bulk review row error feedback, fullscreen receipt viewer, and iPhone acceptance gate (`#44`).

---

## 5. Documentation (`.md`) Cleanup & Synchronization

- [x] **Dirty EGM blueprint files**: Discard uncommitted `## Repository Blueprint (EGM)` diff in `README.md`, remove the 81 untracked nested `**/README.md` files and `2026-10-27_DRIFT_REPORT.md` (they create maintenance drift on every source change).
- [x] **Archive superseded point-in-time docs** into `docs/archive/`: Moved `P2_HANDOFF.md`, `cve.md`, `plans/p2-follow-up.md`, `.planning/`, `docs/astra-production-audit/`, `docs/gpt6-astra-production-audit-prompt.md`, and `docs/mobile-ui-remediation-plan.md` into `docs/archive/2026-11-14-superseded/` (kept `openspec/` since `README.md` references accepted specs there).
- [x] **Refresh canonical docs**: Update `HANDOFF.md` to match current `HEAD`, deployed images, and recent fixes (`23b0df8`, `7d3a19f`, `b151269`, `3d44cb9`, `2459290`). Keep `AGENTS.md`, `CONTEXT.md`, `docs/adr/`, `docs/contracts/`, and `docs/designs/` authoritative.
