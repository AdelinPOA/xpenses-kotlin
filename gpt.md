# GPT Review Notes — xpenses-kotlin

Generated: 2026-07-19
Scope: Verified review of `/root/xpenses-kotlin`, including backend, frontend, Docker/runtime state, `hy3.md`, and `nemotron.md`.

## Validation Performed

- Backend: `cd backend-kotlin-jpa && ./gradlew test bootJar --no-daemon` passed.
- Frontend: `cd frontend && npx tsc --noEmit`, `npm run lint`, and `npm run build` passed.
- Runtime: Docker services are healthy and `/api/health` returns OK.
- Public docs endpoints checked locally: Swagger/API docs returned 404, actuator prometheus returned 403.
- Deployed DB schema verified for key money/date columns.

## Demo Accounts

Demo accounts are intentionally kept for testing. This is acceptable if the environment is not exposed to untrusted networks or is protected by VPN/IP allowlisting/basic auth.

Current risk is not demo seeding itself; it is active known credentials in any internet-accessible environment.

Relevant files:
- `docker-compose.yml:41` defaults `SEED_DEMO_USERS` to true if unset.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt:55` seeds demo users when enabled.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt:59` starts known usernames/passwords: `tech1`, `manager1`, `cfo1`, `mod1`.

## High-Priority Findings

### 1. Storage Admin Contract Is Broken

The frontend and backend disagree on storage provider capabilities and S3 field names.

Frontend advertises local, SMB, WebDAV, SFTP, and S3. Backend only implements local and S3.

Frontend S3 shape:
- `frontend/lib/api.ts:433`
- Uses `endpoint_url`, `access_key`, `bucket_name`, `region_name`.

Backend S3 shape:
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt:46`
- Expects `endpoint`, `access_key_id`, `bucket`, `region`.

Storage test response also mismatches:
- Backend returns `ok/error` from `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt:365`.
- Frontend expects `success/message` from `frontend/lib/api.ts:460`.

Impact: Admin storage settings and test results can be misleading or fail even when values look correct.

Recommendation: Pick one contract. Either update frontend types/form to backend names, or add backend normalization for old/frontend names. Also remove unsupported SMB/WebDAV/SFTP options or implement providers.

### 2. Dashboard Export Endpoint Is Wrong

Frontend calls a non-existent endpoint:
- `frontend/app/dashboard/DashboardClient.tsx:158` calls `/expenses/export-csv`.

Backend exposes:
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt:386` as `/expenses/export?format=csv`.

Impact: Dashboard “Download Report” button likely fails.

Recommendation: Replace dashboard export with existing `downloadBlob("/expenses/export", { format: "csv" }, filename)` helper.

### 3. Flyway Validation Is Disabled

- `backend-kotlin-jpa/src/main/resources/application.yml:23` has `validate-on-migrate: false`.

Impact: Schema drift or modified applied migrations may go undetected.

Recommendation: Enable validation once current migrations are verified clean. Prefer profile/environment override if dev needs flexibility.

### 4. Soft-Delete Cascade Policy Is Unfinished

TODO comments exist:
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt:80`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt:186`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt:270`

Report delete currently detaches expenses first:
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt:210`

Impact: Current report delete path is safer than a direct cascade, but the domain policy remains implicit and fragile. Other delete paths or future changes can leak children or leave inconsistent audit state.

Recommendation: Implement explicit service-layer deletion policies and tests for report, expense, receipt, advances, and mileage.

### 5. Dashboard/Report Aggregation Loads Too Much Into Memory

Examples:
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/DashboardController.kt:45`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt:70`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt:86`

Impact: Fine for testing/small data, but poor scalability as expense/report rows grow.

Recommendation: Move counts/sums/grouping to SQL queries and use database pagination for report lists.

## Medium-Priority Findings

### 6. Manual FX Rate Is Not Validated

Manual `fx_rate` is accepted directly:
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt:32`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt:127`

Impact: Zero/negative/invalid rates can corrupt derived EUR amounts unless caught by DB constraints indirectly.

Recommendation: Add DTO validation and service guard requiring manual FX rate `> 0`.

### 7. Date Columns Are Stored As Text

Actual deployed schema confirms `expenses.date` is `text`.

Relevant migration:
- `backend-kotlin-jpa/src/main/resources/db/migration/V1__init.sql:57`

Impact: ISO `yyyy-MM-dd` strings sort lexically, so current behavior mostly works. But native `DATE` gives better type safety, validation, index semantics, and SQL ergonomics.

Recommendation: Add Flyway migration converting expense/report/advance FX date fields to native `DATE` where appropriate, then update Kotlin entity types to `LocalDate`.

### 8. Refresh Token Reuse Detection Is Missing

Refresh token rotation exists, but theft/reuse detection does not track token family/replaced tokens.

Relevant files:
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/JwtTokenProvider.kt`

Impact: This is a hardening gap, not a current correctness bug. A stolen current refresh token is usable until rotated/expired.

Recommendation: Track token family, `replaced_at`, `revoked_at`, and revoke the family on reuse of a replaced token.

### 9. Dashboard SSR Hydration Key Mismatch

Server prefetch key differs from client query key.

Server:
- `frontend/app/dashboard/page.tsx:11` uses `[...dashboardKeys.all, { all: false }]`.

Client:
- `frontend/app/dashboard/DashboardClient.tsx:57` uses `[...dashboardKeys.all, user?.id, { all: showAll }]`.

Impact: Server prefetch is mostly wasted; client refetches and may flash loading/data.

Recommendation: Centralize dashboard key helper in `queryKeys.ts`, or skip SSR prefetch for auth-specific dashboard pages.

### 10. Static/Fake Dashboard Metrics

Hardcoded dashboard values exist:
- `frontend/app/dashboard/DashboardClient.tsx:191` hardcoded `+12.4%`.
- `frontend/app/dashboard/DashboardClient.tsx:196` hardcoded `€25k` budget.
- `frontend/app/dashboard/DashboardClient.tsx:382` hardcoded “Total Pending”.

Impact: Misleading in finance workflow if users interpret these as real metrics.

Recommendation: Either wire to real backend fields or label/remove as placeholder UI.

## Lower-Priority Findings

### 11. Next.js Tooling Warnings

- `frontend/package.json:9` uses deprecated `next lint`.
- `npm run build` warns about workspace root inference due multiple lockfiles.
- `frontend/next.config.ts:3` should set `outputFileTracingRoot` or root/frontend lockfile ownership should be clarified.

Recommendation: Replace `next lint` with `eslint .`; configure `outputFileTracingRoot` if keeping root lockfile.

### 12. Build-Time Dynamic Route Warnings

`dashboard` and `expenses` pages use `cookies()` via `serverFetch`, which forces dynamic behavior.

Relevant files:
- `frontend/lib/serverApi.ts:8`
- `frontend/app/dashboard/page.tsx:11`
- `frontend/app/expenses/page.tsx:12`

Recommendation: Add `export const dynamic = "force-dynamic"` to those pages if SSR prefetch remains intentional.

### 13. Large Files / Maintainability

Examples:
- `frontend/components/expenses/ExpenseForm.tsx` is ~777 lines.
- `frontend/lib/api.ts` is ~633 lines.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt` contains many entities.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt` contains many repositories.

Impact: Maintainability and review complexity, not immediate production failure.

Recommendation: Split only as part of nearby feature work or bug fixes; avoid broad churn just for file-size cleanup.

## Verification Of `hy3.md` Findings

### Valid

- Refresh-token reuse detection missing.
- Soft-delete cascade policy unfinished.
- Flyway validation disabled.
- Swagger paths are `permitAll` if enabled; currently runtime appears disabled.
- Dashboard/report aggregation loads rows and filters in Kotlin.
- Manual FX rate not validated.
- Insurance upload stores client-supplied MIME type.
- Status strings are hardcoded.
- Frontend refresh queue retry risk exists because queued requests are retried without `_retry` set.
- Frontend interceptor mutates `error.response.data` without checking if it is an object.
- Dashboard hydration key mismatch exists.
- Static/fake dashboard metrics exist.

### Partly Valid / Needs Nuance

- Report list cartesian duplicates: repository queries use `SELECT DISTINCT`, so the duplicate-count claim is not clearly true. Pagination is still in-memory and should be improved.
- `submitReport` stale collection: current code reloads report after attach at `ReportService.kt:116`, but does so with plain `findById`; behavior should still be tested/strengthened with an eager query.
- Lazy-init on delete: current delete method is transactional, so immediate LazyInitializationException is unlikely there. Still fragile if Open Session In View is disabled elsewhere.
- Object URL leak: `ExpenseForm` stores/revokes URLs on unmount, but dynamic add/remove behavior should be reviewed.
- Auth download anchors: most authenticated downloads use `downloadBlob`; anchors in `ExpenseForm` are mostly local/blob preview URLs, not backend auth URLs.

## Verification Of `nemotron.md` Findings

### Valid

- Soft-delete cascade policy unfinished.
- Date stored as `TEXT` is true for deployed DB.
- Refresh-token reuse detection missing.
- `Models.kt`, `Repositories.kt`, `ExpenseForm.tsx`, and `api.ts` are large.
- Middleware only checks cookie existence; backend remains real auth authority.
- Missing `@Version` on some entities is true, but impact varies by entity.
- Flyway validation disabled.
- General API rate limiting is limited; auth endpoints are rate-limited.
- `themes.ts` referenced in frontend AGENTS but no file exists.
- `serverApi.ts` duplicates some API concerns.

### False / Stale / Overstated

- `ThemeProvider.tsx` broken variable claim is false. `theme` and `setThemeState` exist and compile.
- “No service unit tests” is false. Service tests exist for `ExpenseService`, `FxService`, `ReportService`, OCR, and PDF.
- “No frontend tests except Playwright” is partly misleading: Playwright e2e coverage exists across many areas. It is true there are no obvious React unit tests.
- “Money is DOUBLE PRECISION” is stale for deployed schema. Actual DB columns checked are `numeric` for monetary fields. V20 converted them.
- “Date TEXT is critical” is overstated. It is technical debt, not an immediate critical bug while ISO dates are enforced by UI/API conventions.
- “ThemeProvider is critical” is false based on current source and successful build.

## Recommended Priority Order

1. Fix storage admin contract and test response shape.
2. Fix dashboard export endpoint.
3. Decide and enforce demo-account network boundary during testing.
4. Enable Flyway validation after checking migration cleanliness.
5. Add manual FX rate validation.
6. Add explicit soft-delete/deletion policy tests.
7. Convert date text fields to native dates.
8. Remove or wire fake dashboard metrics.
9. Clean dashboard SSR hydration key mismatch or mark dynamic pages explicitly.
10. Add refresh-token reuse detection before broader exposure.
11. Migrate lint script away from `next lint`.
12. Split large files opportunistically, not as an isolated refactor.
