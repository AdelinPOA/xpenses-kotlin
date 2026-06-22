## Why

A consolidated codebase audit (`audit-consolidated.md`, verified against the codebase on 2026-06-22) identified **95 unresolved findings** — 10 CRITICAL, 40 HIGH, 22 MEDIUM, 26 LOW — spanning security, data integrity, performance, structure, frontend quality, DevOps, and test coverage. The highest systemic risk is **in-memory full-table loading** (OOM at moderate scale) and a cluster of unguarded security gaps (CSRF disabled, path traversal in file upload/serve, secrets leaked via URL/Docker context, missing K8s `JWT_SECRET`). Backend endpoint test coverage is stagnant at ~16%. These must be closed before the app can be deployed with confidence.

This change is the single source of truth for remediating the audit. It deliberately **references — and does not duplicate** — four already-implemented overlapping changes; the audit re-confirmed that those left residual gaps (different files, partial fixes), which this change targets.

## What Changes

Organized into the audit's four-sprint roadmap. Each item carries its audit finding ID.

- **Sprint 1 — Security & ops quick wins:** global catch-all exception handler with correlation ID (C2); CSRF/SameSite hardening (C4); path-traversal sanitization on insurance upload (C11) and signature serve (H2); move Gemini key to `x-goog-api-key` header in `EmailImportService` (C12 — `OcrService` was already fixed); `.dockerignore` for all 4 build contexts (C6/H11); `deployment.yaml` `JWT_SECRET` + startup/readiness probes (C7/C8); `docker-compose.prod.yml` with `COOKIE_SECURE=true` (C9); CI Docker layer caching (H10); remove hardcoded DNS (H13); env-var DB creds (H29); frontend `depends_on`/`restart` (H30); log rotation limits (H31); MinerU + frontend healthcheck fixes (H34/H35); change-password rate limit (H41); CSP header (H40); plus L1/L2/L5 nits.
- **Sprint 2 — Data integrity & performance:** V17 migration converting `deleted_at` to `TIMESTAMPTZ` (C5), adding `inventory_items.request_id` index (H8) and mileage `CHECK (>= 0)` constraints (M14); `@Version` + version-aware `@SQLDelete` on `Expense`/`Receipt` (H9); `ocrTaskExecutor` on the `CompletableFuture` OCR path (H3); `@Transactional(readOnly)` on lazy receipt read (H4); `OcrComparison` ownership check (H6); atomic report-state + approver-notification via outbox/event (M1); `MileageRecord` soft delete (M7); JWT-claims request principal to drop the per-request DB load (M2); `AdvancePayment` default status `"requested"` (M12); remove dead `processAllReportsEagerly()` (M9); extend `performance-query-optimization` for in-memory sort (M3) and N+1 batch saves (M4).
- **Sprint 3 — Memory safety & structural refactor:** push remaining privileged dashboard aggregation + report-list pagination to the DB (C1, extends `performance-query-optimization`); migrate all monetary entity fields from `Double` to `BigDecimal` (H5/L12 — **BREAKING** to JSON numeric precision & DB column types); split `Models.kt` by domain (H14); extract `Advance`/`Mileage`/`Dashboard`/`Inventory`/`Insurance` services (H15); disable OSIV (H16); `equals()`/`hashCode()` on entities (H1); Gradle version catalog (H36); ktlint/detekt in CI (H17).
- **Sprint 4 — Frontend quality & test coverage:** re-enable `exhaustive-deps` + fix deps (H18); skeleton loaders (H19); shared `lib/format.ts` (H20); broaden middleware static-asset allowlist (H21); toast `setTimeout` cleanup (H22); split `ExpenseForm.tsx` (H23); `any`→`unknown` (H24); replace `!!` force-unwraps (H25); centralize query keys (H26); unify auth-guard pattern (H27); frontend medium items (M15–M23); integration tests for the 10 untested controllers and test-infra fixes (L25/L26, `FxServiceTest` network calls, `application-test.yml`).
- **LOW cleanup batch:** L3–L24 remaining nits (DTO mapper dedupe, schema length mismatches, `.gitignore`, Makefile targets, dependency hygiene).
- **Docs:** fix the two README inaccuracies (state-machine diagram; "comprehensive test suite" overstatement).

**Explicitly deferred / no-fix (documented, not tasked):** C3 file-ops-before-commit (by design, S66); H12 hot-swap mounts (by design, S64); M5 login session invalidation (by design); H7 V8 `DATE`→`VARCHAR` (irreversible without data loss); M13 `orphanRemoval` (non-issue on Hibernate 6.6.13).

## Capabilities

### New Capabilities
- `global-exception-handling`: Unhandled runtime exceptions return a safe generic 500 with a correlation ID; no stack traces leak to clients (C2).
- `csrf-protection`: State-changing requests under cookie auth are protected via CSRF token and/or `SameSite=Strict` + Origin verification (C4).
- `secure-file-path-handling`: Uploaded and served file paths are sanitized and confined to their designated directory; no path traversal (C11, H2).
- `monetary-precision`: All monetary amounts are represented and computed with `BigDecimal` (fixed scale) end-to-end, not `Double` (H5, L12).
- `jwt-request-principal`: The authenticated principal is derived from JWT claims without a per-request database load (M2).
- `transactional-report-notifications`: Report state transitions and approver notifications are atomic — a committed transition reliably enqueues exactly one notification via an outbox/event (M1).
- `backend-test-coverage`: Every backend controller has integration-test coverage; tests are hermetic (no live external HTTP) (Sprint 4 tests, L25/L26).

### Modified Capabilities
- `financial-record-soft-delete`: Extend soft-delete scope to `MileageRecord` (M7) and make `Expense`/`Receipt` soft-deletes optimistic-lock-safe with `@Version` (H9).
- `service-layer-architecture`: Extend the service-ownership requirement to `Advance`, `Mileage`, `Dashboard`, `Inventory`, and `Insurance` domains; controllers stay thin (H15).

## Impact

- **Backend:** `SecurityConfig`, `ValidationExceptionHandler` (new catch-all), `InsuranceController`, `SignatureController`, `EmailImportService`, `Models.kt` (split + `BigDecimal` + `@Version` + `equals/hashCode`), `Repositories.kt`, `JwtAuthenticationFilter`, `OcrService`, `AsyncOcrService`, `ReportService`/new services, new Flyway `V17`, `application.yml`, `build.gradle.kts` (+ `gradle/libs.versions.toml`).
- **Frontend:** `eslint.config.mjs`, `middleware.ts`, `lib/format.ts` (new), `lib/queryKeys.ts`, `ToastProvider.tsx`, `ExpenseForm.tsx` (split), multiple pages (skeletons, auth guards, prefetch).
- **DevOps:** 4 × `.dockerignore` (new), `docker-compose.yml`, `docker-compose.prod.yml` (new), `deployment.yaml`, `.github/workflows/ci.yml`, `Makefile`, `.env.example`, `.gitignore`.
- **BREAKING:** `Double`→`BigDecimal` changes JSON number formatting and DB column types (V17 migration, high-risk — requires thorough testing). `TIMESTAMP`→`TIMESTAMPTZ` alters stored timestamp semantics.
- **References (no duplication):** `production-readiness-hardening`, `performance-query-optimization`, `fix-codebase-bugs-and-debt`, `code-quality-gaps-round-2`.
