# Consolidated Codebase Audit — xpenses-kotlin

**Merged from:** `audit.md` · `auditv2.md` · `improvemen-audit.md`  
**Verified against codebase:** 2026-06-22  
**Scope:** All source code excluding `.md` files  
**Backend:** Kotlin Spring Boot 3.4.5 (JPA + Flyway)  
**Frontend:** Next.js 15 + React 19 + TanStack Query v5  

---

## Executive Summary

**95 findings** (68 original + 27 new from `improvemen-audit`) after deduplication. The most severe systemic risk remains **in-memory full-table loading** (Dashboard + Report controllers load ALL rows into RAM) — an OOM risk at any moderate scale. Test coverage is stagnant at **~12% of endpoints** (5 of 15 controllers tested).

| Severity | Backend | DB/Schema | Frontend | DevOps/Config | Tests | Total |
|----------|---------|-----------|----------|---------------|-------|-------|
| **CRITICAL** | 5 | 1 | 2 | 5 | 0 | 13 |
| **HIGH** | 17 | 3 | 11 | 11 | 0 | 42 |
| **MEDIUM** | 7 | 2 | 9 | 6 | 0 | 24 |
| **LOW** | 8 | 6 | 4 | 6 | 2 | 26 |
| **Total** | **37** | **12** | **26** | **28** | **2** | **105** |

### Verified Status Counts

| Status | Count |
|--------|-------|
| ✅ RESOLVED (fixed in codebase) | 3 |
| 🔶 BY DESIGN (intentional tradeoff) | 3 |
| ❌ UNRESOLVED (still present) | 95 |
| ❓ CAN'T VERIFY | 4 |

---

## 🔴 CRITICAL (13)

### C1. In-Memory Full-Table Scans Cause OOM Risk
**Status:** ❌ UNRESOLVED  
**Files:** `DashboardController.kt:38-42,53-57` · `ReportController.kt:70-100` · `ExpenseController.kt:405`

`expenseRepository.findAll()`, `expenseReportRepository.findAll()` still load every row into memory for dashboard stats and report listing. Filtering/sorting/pagination happens in Kotlin. Only the export endpoint was fixed (S65) with `findAllWithFilters()` — Dashboard and Report list are unchanged.

**Fix:** Push filtering, aggregation, and pagination to the database with proper JPQL/SQL using `COUNT`, `GROUP BY`, `SUM`, and `LIMIT/OFFSET` or Spring Data `Pageable`.

**Effort:** Medium

---

### C2. No Global Exception Handler
**Status:** ❌ UNRESOLVED  
**File:** `ValidationExceptionHandler.kt`

Handles 6 specific exception types but has **no `@ExceptionHandler(Exception::class)`** catch-all. Unhandled runtime exceptions (NPE, IAE, `DataIntegrityViolation`, `StaleObjectState`) bubble up to Spring's default error page, leaking stack traces.

**Fix:** Add a catch-all handler returning 500 with a safe generic message and correlation ID.

**Effort:** Small

---

### C3. File Operations Before Transaction Commit Creates Orphans
**Status:** 🔶 BY DESIGN  
**Files:** `ExpenseController.kt:169-210` · `InsuranceController.kt:104-128`

Files are saved to storage **before** the `TransactionTemplate.execute{}` block. If the DB transaction fails, files are orphaned. This is an **intentional tradeoff** (S66) — decoupling prevents DB connection pool starvation under load.

**Fix:** None planned. Orphan risk is accepted for performance.

---

### C4. CSRF Completely Disabled with Cookie Auth
**Status:** ❌ UNRESOLVED  
**File:** `SecurityConfig.kt:35`
```kotlin
.csrf { it.disable() }
```
Cookie-based JWT auth (`access_token` + `refresh_token`) with `SameSite=Lax` does not protect POST requests from same-site redirects.

**Fix:** Enable CSRF via `CookieServerCsrfTokenRepository` or add `SameSite=Strict` cookie attribute + Origin header verification.

**Effort:** Small

---

### C5. V13 `deleted_at` Uses `TIMESTAMP` Without Timezone
**Status:** ❌ UNRESOLVED  
**File:** `V13__add_soft_delete_to_financial_records.sql:5,9,13`

Bare `TIMESTAMP` instead of `TIMESTAMPTZ`. V16 only drops `alembic_version` — does not fix this. With `ddl-auto: validate`, type mismatch against JPA `Instant` can fail startup or silently store ambiguous timestamps.

**Fix:** Create V17 migration: `ALTER TABLE ... ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC'`.

**Effort:** Small

---

### C6. No `.dockerignore` Files — Secrets Leak Risk
**Status:** ❌ UNRESOLVED  
**Files:** `backend-kotlin-jpa/Dockerfile` · `frontend/Dockerfile` · `mineru/Dockerfile` · `ocr-sidecar/Dockerfile`

Zero `.dockerignore` files exist. All 4 build contexts send the entire project (including `node_modules/`, `.gradle/`, `build/`, `.env`) to the Docker daemon.

**Fix:** Create `.dockerignore` per context excluding artifacts, caches, `.env`, `*.md`.

**Effort:** Small

---

### C7. `deployment.yaml` Missing `JWT_SECRET`
**Status:** ❌ UNRESOLVED  
**File:** `backend-kotlin-jpa/deployment.yaml:51-62`

Defines `SPRING_DATASOURCE_*` from a secret but **not** `JWT_SECRET`. Application has `jwt.secret: ${JWT_SECRET:}` — auth crashes in K8s.

**Fix:** Add `JWT_SECRET` sourced from a `secretKeyRef`.

**Effort:** Small

---

### C8. Probe Timing Too Tight in `deployment.yaml`
**Status:** ❌ UNRESOLVED  
**File:** `backend-kotlin-jpa/deployment.yaml:37-50`

livenessProbe `initialDelaySeconds: 15`, readinessProbe `initialDelaySeconds: 20`. No `startupProbe`. Too tight for JVM + Flyway + 16 migrations.

**Fix:** Increase to at least 45 for readiness, add `startupProbe` with `initialDelaySeconds: 30`.

**Effort:** Small

---

### C9. Hardcoded `COOKIE_SECURE=false` With No Production Override
**Status:** ❌ UNRESOLVED  
**Files:** `.env:5` · `docker-compose.yml:33`

`COOKIE_SECURE=false` is appropriate for dev but must be `true` for HTTPS production. No `docker-compose.prod.yml` or override exists.

**Fix:** Create `docker-compose.prod.yml` override setting `COOKIE_SECURE=true`, or add to `deployment.yaml`.

**Effort:** Small

---

### C10. `ExpenseControllerTest` Calls `findDeletedAudit()`
**Status:** ✅ RESOLVED  
**Files:** `ExpenseControllerTest.kt:110` · `Repositories.kt:117-118`

Method exists with proper `@Query(nativeQuery = true)` annotation. Compiles correctly.

---

### C11. Path Traversal in InsuranceController File Upload
**Status:** ❌ UNRESOLVED  
**File:** `InsuranceController.kt:104`

```kotlin
val originalName = upload.originalFilename ?: "document"
val relativePath = "$userId/insurance/${Instant.now().epochSecond}_$originalName"
```
`originalFilename` is unsanitized — directory separators not stripped. Attacker could write files outside the intended directory.

**Fix:** Strip directory separators, use `File(originalName).name`.

**Effort:** Small

---

### C12. Gemini API Key in URL Query Parameter
**Status:** ❌ UNRESOLVED  
**File:** `EmailImportService.kt:274`
```kotlin
val url = "https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=$apiKey"
```
API key exposed in URL query param (logged, cached, visible in proxies). `OcrService.kt` correctly uses `x-goog-api-key` header instead.

**Fix:** Use `.header("x-goog-api-key", apiKey)` pattern like `OcrService.kt`.

**Effort:** Tiny

---

### C13. 401 Refresh Queue Leaks Promises on Failure
**Status:** ✅ RESOLVED  
**File:** `lib/api.ts:39-44`

`processQueue(refreshError, null)` is called on refresh failure (line 55), properly draining and rejecting all pending promises.

---

## 🟠 HIGH (42)

### Backend (17)

#### H1. Missing `equals()`/`hashCode()` on All JPA Entities
**Status:** ❌ UNRESOLVED  
**File:** `Models.kt` (all 15 entities)

No entity overrides `equals()` or `hashCode()`. Default reference equality breaks Hibernate proxy comparison, `HashSet`/`HashMap` usage, and cross-session entity comparison.

**Fix:** Add stable ID-based or business-key-based `equals()`/`hashCode()`.

**Effort:** Large

---

#### H2. Path Traversal in `SignatureController.getSignature`
**Status:** ❌ UNRESOLVED  
**File:** `SignatureController.kt:31-48`

`signaturePath` from DB used directly as `File(path)` with no validation. A direct DB update could read arbitrary files.

**Fix:** Validate resolved path is within designated signatures directory. Store only filename, not absolute path.

**Effort:** Small

---

#### H3. `CompletableFuture.runAsync` Bypasses Thread Pool
**Status:** ❌ UNRESOLVED  
**File:** `OcrService.kt:391-425`

Uses `CompletableFuture.runAsync { ... }` without executor, hitting `ForkJoinPool.commonPool()` instead of configured `ocrTaskExecutor` (pool 2-5, bounded queue, AbortPolicy).

**Fix:** Replace with `runAsync(runnable, ocrTaskExecutor)`.

**Effort:** Tiny

---

#### H4. `LazyInitializationException` Risk in `getReceiptCompat`
**Status:** ❌ UNRESOLVED  
**File:** `ExpenseController.kt:304-339`

Accesses lazy `expense.receipts` without `@Transactional` or JOIN FETCH. Works today via OSIV (default `true`) but is a code smell.

**Fix:** Add `@Transactional(readOnly = true)` or switch to JOIN FETCH query.

**Effort:** Small

---

#### H5. `Double` for Monetary Values Causes Precision Loss
**Status:** ❌ UNRESOLVED  
**File:** `Models.kt:108,202,204,207,211,346,352,415-427`

15+ monetary fields use `Double`. Inconsistent with `taxAmount: BigDecimal`. Cannot precisely represent decimal fractions (e.g., `0.1 + 0.2 != 0.3`).

**Fix:** Use `BigDecimal` for ALL monetary amounts with `@Column(precision=..., scale=2)`.

**Effort:** Large — high-risk refactor, needs thorough testing

---

#### H6. No Ownership Check When Linking `OcrComparison` to Expense
**Status:** ❌ UNRESOLVED  
**File:** `ExpenseService.kt:82-88`

No verification that the `OcrComparison` record belongs to the current user. Any authenticated user could link any comparison.

**Fix:** Verify `comp.expense.user == currentUser` before linking.

**Effort:** Small

---

#### H7. V8 Destructive: `purchase_date` from `DATE` to `VARCHAR(255)`
**Status:** ❌ UNRESOLVED  
**File:** `V8__fix_inventory_purchase_date_type.sql`

Irreversibly casts `DATE` values to strings. No V17 migration to revert.

**Fix:** Cannot fix without data loss. Document as irreversible. Add CHECK constraint on existing data as band-aid.

**Effort:** N/A

---

#### H8. V10 Missing Index on `inventory_items.request_id`
**Status:** ❌ UNRESOLVED  
**File:** `V10__add_request_id_to_inventory_items.sql`

FK column added without index. Every other FK has a dedicated index. Querying by `request_id` triggers sequential scans.

**Fix:** Add `CREATE INDEX IF NOT EXISTS idx_inventory_items_request_id ON inventory_items(request_id)` via V17.

**Effort:** Tiny

---

#### H9. Inconsistent `@SQLDelete` Optimistic Locking
**Status:** ❌ UNRESOLVED  
**File:** `Models.kt:76,181,257`

| Entity | @SQLDelete | @Version |
|--------|-----------|----------|
| ExpenseReport | `WHERE id=? AND version=?` | ✅ Has @Version |
| Expense | `WHERE id=?` (no version) | ❌ Missing |
| Receipt | `WHERE id=?` (no version) | ❌ Missing |

Two concurrent threads could soft-delete the same Expense/Receipt record and both succeed.

**Fix:** Add `@Version` to Expense and Receipt, include `AND version=?` in their `@SQLDelete`.

**Effort:** Medium

---

#### H10. No Docker Layer Caching in CI
**Status:** ❌ UNRESOLVED  
**File:** `.github/workflows/ci.yml:90-92`

`docker compose build` runs without `--cache-from` or `docker/build-push-action`. Every CI run rebuilds all layers from scratch.

**Fix:** Use `docker/build-push-action@v6` with `cache-from`/`cache-to` pointing to GitHub Actions cache.

**Effort:** Small

---

#### H11. Frontend Dockerfile Copies Everything
**Status:** ❌ UNRESOLVED  
**File:** `frontend/Dockerfile:6`

```dockerfile
COPY . .
```
No `.dockerignore` — copies `node_modules/`, `.next/`, `.env.local`, etc.

**Fix:** Create `frontend/.dockerignore` excluding `node_modules/`, `.next/`, `.turbo/`, `.env*`, `*.md`.

**Effort:** Small

---

#### H12. Override Mounts May Fail Silently
**Status:** 🔶 BY DESIGN  
**File:** `docker-compose.override.yml:5-7`

Hot-swap mounts reference `./build/classes/kotlin/main` and `./build/resources/main`. If directories don't exist, Docker creates empty root-owned ones.

**Fix:** Ensure `make build` runs before `make up`.

---

#### H13. Hardcoded DNS Bypasses Host DNS
**Status:** ❌ UNRESOLVED  
**File:** `docker-compose.yml:34-36`
```yaml
dns: [8.8.8.8, 1.1.1.1]
```
Bypasses corporate/VPN/internal resolvers and Docker's embedded DNS.

**Fix:** Remove the `dns:` block.

**Effort:** Tiny

---

#### H14. Models.kt Is 671 Lines — 15 Entities in One File
**Status:** ❌ UNRESOLVED  
**File:** `Models.kt`

15 JPA entities crammed into a single file. Hinders discoverability and merge resolution.

**Fix:** Split by domain: `User.kt`, `Expense.kt`, `Category.kt`, etc.

**Effort:** Small

---

#### H15. Fat Controllers With Business Logic
**Status:** ❌ UNRESOLVED  
**Files:** `AdvanceController.kt` (479 lines) · `MileageController.kt` (242 lines) · `DashboardController.kt` (126 lines) · `InventoryController.kt` (384 lines) · `InsuranceController.kt` (223 lines)

All mix business logic with HTTP concerns directly via repositories. No service layer extracted.

**Fix:** Extract `AdvanceService`, `MileageService`, `DashboardService`, `InventoryService`, `InsuranceService`.

**Effort:** Medium

---

#### H16. OSIV Anti-Pattern Enabled by Default
**Status:** ❌ UNRESOLVED  
**File:** `application.yml`

`spring.jpa.open-in-view` defaults to `true` (not explicitly configured). Keeps Hibernate session open during view rendering, masking lazy-init issues and risking connection pool exhaustion.

**Fix:** Add `spring.jpa.open-in-view: false` and fix all lazy loading issues.

**Effort:** Medium

---

#### H17. No Kotlin Linting in CI
**Status:** ❌ UNRESOLVED  
**File:** `.github/workflows/ci.yml`

Frontend has `tsc` + `lint` steps; Kotlin only runs `./gradlew test bootJar` with no `ktlint` or `detekt`.

**Fix:** Add ktlint or detekt plugin + CI step.

**Effort:** Small

---

### Frontend (11)

#### H18. `react-hooks/exhaustive-deps` Disabled Globally
**Status:** ❌ UNRESOLVED  
**File:** `eslint.config.mjs:22`
```js
"react-hooks/exhaustive-deps": "off"
```
Masks ~5 real dependency issues across the codebase.

**Fix:** Remove override and fix the actual dependency arrays.

**Effort:** Small

---

#### H19. Plain `"Loading..."` Text on 7 Pages
**Status:** ❌ UNRESOLVED  
**Files:** `app/categories/page.tsx:154` · `app/expenses/ExpensesClient.tsx:158` · `app/expenses/[id]/edit/page.tsx:24` · `app/reports/[id]/advances/page.tsx:99` · `app/reports/[id]/mileage/page.tsx:86` · `app/reports/[id]/edit/page.tsx:104`

Plain text loading states instead of skeleton components.

**Fix:** Use skeleton components.

**Effort:** Small

---

#### H20. `formatEur`/`formatAmount` Duplicated ~12 Times
**Status:** ❌ UNRESOLVED

`formatEur` defined in 7 files; `formatAmount` defined in 5 files. Duplicated across dashboard, expenses, reports, approvals, payments, categories, profile.

**Fix:** Extract to `lib/format.ts`.

**Effort:** Tiny

---

#### H21. `middleware.ts` Only Whitelists `.png`
**Status:** ❌ UNRESOLVED  
**File:** `middleware.ts:6`

```js
pathname === "/favicon.ico" || pathname.endsWith(".png")
```
Missing `.jpg`, `.jpeg`, `.svg`, `.webp`, `.ico`, `.css`, `.js`, `.gif`.

**Fix:** Add all required extensions.

**Effort:** Tiny

---

#### H22. Toast `setTimeout` Never Cleaned Up
**Status:** ❌ UNRESOLVED  
**File:** `ToastProvider.tsx:38`
```tsx
setTimeout(() => { setToasts(...) }, 4000);
```
Return value never stored; cannot be cleared on unmount.

**Fix:** Wrap in `useEffect` with cleanup.

**Effort:** Tiny

---

#### H23. 706-Line `ExpenseForm.tsx`
**Status:** ❌ UNRESOLVED  
**File:** `components/expenses/ExpenseForm.tsx`

Monoithic form component mixing OCR, receipt preview, category classifier, and expense fields.

**Fix:** Split into 6 sub-components; migrate to `react-hook-form`.

**Effort:** Medium

---

#### H24. `any` Types in Error Handlers
**Status:** ❌ UNRESOLVED  
**Files:** `ExpenseForm.tsx` (3 instances) · `storage/page.tsx` (2 instances)

`catch (e: any)` patterns instead of `unknown` + narrowing. Also `zodResolver as any`.

**Fix:** Type as `unknown` + narrowing; fix zod resolver types.

**Effort:** Small

---

#### H25. `!!` Force-Unwrap on Nullable Fields (53× Across 9 Controllers)
**Status:** ❌ UNRESOLVED  
**Files:** All controllers

53 instances of `!!` — notably `currentUser!!`, `f.id!!`. Causes NPE if DB returns unexpected nulls.

**Fix:** Use `?: throw ResponseStatusException(...)` instead.

**Effort:** Medium

---

#### H26. `queryKeys.ts` Inconsistency
**Status:** ⚠️ PARTIAL  
**File:** `lib/queryKeys.ts`

`insuranceKeys` added; `userKeys` and `profileKeys` still inlined in components.

**Fix:** Move all to `lib/queryKeys.ts`.

**Effort:** Small

---

#### H27. Auth Guard Inconsistency
**Status:** ⚠️ PARTIAL  

3 pages redirect to `/dashboard` on role mismatch; 3 pages show inline "Access Denied". Admin pages consistently redirect — non-admin pages inconsistently handle unauthorized access.

**Fix:** Unify on redirect pattern.

**Effort:** Small

---

#### H28. `useEffect` for Synchronous Greeting Time
**Status:** ❓ CAN'T VERIFY (low priority)  
**File:** `DashboardGreeting.tsx:12`

```tsx
useEffect(() => { ... }, [])
```
Effect wrapping a synchronous `new Date().getHours()` computation. Empty deps is technically correct but wastes a render cycle.

**Fix:** Replace with plain function call.

**Effort:** Tiny

---

### Infrastructure (14)

#### H29. Hardcoded DB Credentials in docker-compose.yml
**Status:** ❌ UNRESOLVED  
**File:** `docker-compose.yml:7,39-40`

Postgres username/password hardcoded as `xpenses`/`xpenses`.

**Fix:** Use `${POSTGRES_PASSWORD}` env var references.

**Effort:** Tiny

---

#### H30. Frontend Missing `depends_on` + `restart`
**Status:** ❌ UNRESOLVED  
**File:** `docker-compose.yml:64-89`

Frontend service has no `depends_on` (starts before backend is ready) and no `restart: unless-stopped`.

**Fix:** Add `depends_on: backend: condition: service_healthy` and `restart: unless-stopped`.

**Effort:** Tiny

---

#### H31. No Logging Configuration (Unbounded Growth)
**Status:** ❌ UNRESOLVED  
**File:** `docker-compose.yml`

All services lack `logging:` config. Docker defaults to unbounded JSON file logs.

**Fix:** Add `logging: driver: json-file, options: { max-size: "10m", max-file: "3" }`.

**Effort:** Tiny

---

#### H32. No Container Security Hardening
**Status:** ❌ UNRESOLVED  
**File:** `docker-compose.yml`

No `cap_drop`, `security_opt`, or `read_only: true` on any container.

**Fix:** Add `cap_drop: [ALL]`, `cap_add: [NET_BIND_SERVICE]`, `security_opt: [no-new-privileges:true]`, `read_only: true` with `tmpfs` mounts.

**Effort:** Small

---

#### H33. No Monitoring Stack
**Status:** ❌ UNRESOLVED

Prometheus metrics exported via `/actuator/prometheus` but never scraped. No Grafana dashboard.

**Fix:** Add `prometheus` + `grafana` services to compose.

**Effort:** Small

---

#### H34. MinerU Healthcheck Pings `/docs` (Swagger UI)
**Status:** ❌ UNRESOLVED  
**File:** `docker-compose.yml:128`

Healthcheck hits Swagger UI endpoint instead of `/health`.

**Fix:** Use `/health` endpoint instead.

**Effort:** Tiny

---

#### H35. Frontend Healthcheck Uses `wget`
**Status:** ❌ UNRESOLVED  
**File:** `docker-compose.yml:82`

`wget` may not be in `node:22-alpine`. Use `node -e` or install `curl`.

**Fix:** Replace with `node -e "require('http').get(...)"`.

**Effort:** Tiny

---

#### H36. No `libs.versions.toml` Version Catalog
**Status:** ❌ UNRESOLVED  
**File:** `build.gradle.kts`

All dependency versions inlined in `build.gradle.kts`. No centralized version management.

**Fix:** Create `gradle/libs.versions.toml` version catalog.

**Effort:** Small

---

#### H37. No Path Filtering in CI
**Status:** ❌ UNRESOLVED  
**File:** `.github/workflows/ci.yml`

Full workflow runs on every push to any branch. Backend tests run even when only frontend changes.

**Fix:** Use `dorny/paths-filter` to skip backend jobs when only frontend files change.

**Effort:** Small

---

#### H38. CI Jobs Missing Timeouts
**Status:** ❌ UNRESOLVED  
**File:** `.github/workflows/ci.yml`

`build-kotlin` and `build-frontend` jobs lack `timeout-minutes`. Hung jobs run indefinitely.

**Fix:** Add `timeout-minutes: 20` / `timeout-minutes: 15`.

**Effort:** Tiny

---

#### H39. No Common Makefile Dev Commands
**Status:** ❌ UNRESOLVED  
**File:** `Makefile`

Missing `make ps`, `make clean`, `make logs-all`, `make down -v`, `make system prune`.

**Fix:** Add common dev commands.

**Effort:** Tiny

---

#### H40. No CSP Headers
**Status:** ❌ UNRESOLVED  
**File:** `SecurityConfig.kt:33`

No Content-Security-Policy HTTP header configured.

**Fix:** Add CSP header via security config.

**Effort:** Small

---

#### H41. Rate-Limit Missing on Change Password
**Status:** ❌ UNRESOLVED  
**File:** `application.yml:56-80`

Only `/api/auth/login` (10/min) and `/api/auth/refresh` (5/min) are rate-limited. `/api/auth/change-password` is not.

**Fix:** Add rate-limit filter for change-password endpoint.

**Effort:** Tiny

---

#### H42. `read_only: true` Not Set on Any Container
**Status:** ❌ UNRESOLVED  
**File:** `docker-compose.yml`

All containers run with writable root filesystems, increasing the blast radius of container escapes.

**Fix:** Add `read_only: true` with `tmpfs` mounts for temp directories.

**Effort:** Small

---

## 🟡 MEDIUM (24)

### Backend (7)

#### M1. Non-Atomic Report Submission + Email
**Status:** ❌ UNRESOLVED  
**File:** `ReportService.kt:125-141`

State change commits before async email notification; also loads ALL users via `userRepository.findAll()` to find approvers.

**Fix:** Move email enqueue into the same transaction (use `@TransactionalEventListener` or a DB-backed outbox table).

**Effort:** Medium

---

#### M2. DB Query Per Authenticated Request
**Status:** ❌ UNRESOLVED  
**File:** `JwtAuthenticationFilter.kt:31`

`userRepository.findById(claims.userId)` on every request even though JWT already contains userId/role/username.

**Fix:** Cache `User` entity in request-scoped cache or use lightweight principal from JWT claims.

**Effort:** Medium

---

#### M5. Login Invalidates All Other Sessions
**Status:** 🔶 BY DESIGN  
**File:** `AuthController.kt:77`

`refreshTokenRepository.deleteByUserId(user.id)` on every login. This is intentional — logging out other sessions of the same user on re-login is standard security practice.

---

#### M6. `@Transactional` + `@Async` on Same Method
**Status:** ❌ UNRESOLVED  
**File:** `AsyncOcrService.kt:20-21`

Both annotations on `processOcr()`. The async thread may not inherit the transaction context correctly.

**Fix:** Separate transactional logic from async execution.

**Effort:** Small

---

#### M7. MileageRecord Missing Soft Delete
**Status:** ❌ UNRESOLVED  
**File:** `Models.kt:392-442`

Unlike Expense/Report/Receipt, `MileageRecord` lacks `@SQLDelete` and `@SQLRestriction("deleted = false")`. Physically deleted with no audit trail.

**Fix:** Add `deleted` boolean + `@SQLDelete` + `@SQLRestriction` + Flyway migration to add column.

**Effort:** Medium

---

#### M9. Dead Code: `processAllReportsEagerly()`
**Status:** ❌ UNRESOLVED  
**File:** `ReportService.kt:34-43`

Logs all reports; never called from any controller, scheduled task, or test.

**Fix:** Remove or `@Deprecated`.

**Effort:** Tiny

---

#### M11. Hardcoded PBKDF2 Salt
**Status:** ❌ UNRESOLVED  
**File:** `JwtTokenProvider.kt:33`
```kotlin
val salt = "xpenses-jwt-salt"
```
Compile-time constant instead of per-deployment random value.

**Fix:** Generate random salt per deployment, store in config.

**Effort:** Small

---

#### M12. AdvancePayment Defaults `status = "paid"`
**Status:** ❌ UNRESOLVED  
**File:** `Models.kt:363`
```kotlin
var status: String = "paid"
```
Should default to `"requested"`. V12 migration added `'requested'` to DB CHECK constraint but entity default remains wrong.

**Fix:** Change default to `"requested"` in entity + new migration.

**Effort:** Tiny

---

#### M13. `orphanRemoval=true` With `@SQLDelete` May Conflict
**Status:** ✅ RESOLVED (non-issue on Hibernate 6.6.13.Final)

Hibernate 6.x correctly prioritizes `@SQLDelete` over `orphanRemoval`.

---

#### M14. Missing CHECK Constraints on Mileage Amounts
**Status:** ❌ UNRESOLVED  
**File:** `V5__data_integrity_constraints.sql`

`mileage_records.amount_before_tax` and `amount_eur` have no `>= 0` constraints.

**Fix:** Add V17 migration: `ALTER TABLE mileage_records ADD CONSTRAINT ... CHECK (amount_before_tax >= 0)`.

**Effort:** Tiny

---

### DB/Schema (2)

#### M3. In-Memory Sorting (5+ Controllers)
**Status:** ❌ UNRESOLVED  
**Files:** `ReportController.kt:84` · `DashboardController.kt:88` · `UserController.kt:66` · `AdvanceController.kt:56`

All four still sort in Kotlin after loading full datasets instead of using DB `ORDER BY`.

**Fix:** Push sorting to DB queries.

**Effort:** Small

---

#### M4. N+1 Save in Loops (6 Locations)
**Status:** ❌ UNRESOLVED  
**File:** `ReportService.kt:99-280`

Entities saved one at a time in loops across `attachExpenses`, `submitReport`, `recallReport`, `approveReport`, `rejectReport`, `payReport`.

**Fix:** Batch saves or use single `UPDATE` queries.

**Effort:** Small

---

### Frontend (9)

#### M15. No Server-Side Prefetch on Reports Page
**Status:** ❌ UNRESOLVED  
**File:** `app/reports/page.tsx`

Entirely client-rendered with `useQuery`. No `serverFetch` + `dehydrate` + `HydrationBoundary`.

**Fix:** Add RSC prefetch with TanStack Query hydration.

**Effort:** Small

---

#### M16. Repeated Inline Component Patterns
**Status:** ❌ UNRESOLVED

`inputCls`, delete modals, export drawers, role colors repeated across 4+ files each.

**Fix:** Extract shared `TextField`, `ConfirmDialog`, `ExportMenu` components.

**Effort:** Medium

---

#### M17. `useParams()` vs `use()` Inconsistency
**Status:** ❌ UNRESOLVED

`profile/[id]` uses legacy `useParams()`, `reports/[id]` uses `use()`.

**Fix:** Migrate to `use()` pattern consistently.

**Effort:** Small

---

#### M18. No `redirect_to` on Login Redirect
**Status:** ❌ UNRESOLVED  
**File:** `middleware.ts:13`

Middleware redirects to `/login` without `?redirect_to=${pathname}`.

**Fix:** Append redirect param.

**Effort:** Tiny

---

#### M19. Error Response Shape Inconsistency
**Status:** ❌ UNRESOLVED

Some controllers return `mapOf("detail" to ...)`, others use `ResponseStatusException`.

**Fix:** Create consistent error response DTO.

**Effort:** Small

---

#### M20. `@Transactional` Inconsistency
**Status:** ❌ UNRESOLVED

`ExpenseController` uses `TransactionTemplate.execute{}` while other controllers use `@Transactional`.

**Fix:** Document or unify pattern.

**Effort:** Small

---

#### M21. `next.config.ts` Rewrite Fallback URL Hardcoded
**Status:** ⚠️ PARTIAL  
**File:** `next.config.ts:9`

`"http://localhost:8001/api"` — already env-configured via `NEXT_PUBLIC_API_URL`. Low risk.

**Fix:** Already mitigated; monitor for regressions.

---

#### M22. Admin Pages Missing Error States
**Status:** ⚠️ PARTIAL

All 5 admin pages (email, imap, ldap, ocr, storage) now have error state handling.

---

#### M23. `ExpenseForm.tsx` Still 706 Lines
**Status:** ❌ UNRESOLVED  
**File:** `components/expenses/ExpenseForm.tsx`

No reduction from original 706 lines.

---

### Infrastructure (6)

#### M8. Seed Data: Hotel Described as "Meals & Food"
**Status:** ❌ UNRESOLVED  
**File:** `DataInitializer.kt:120-127`

"Hotel stay (Motel One)" assigned to `foodCategory` instead of an accommodation category.

**Fix:** Create accommodation category or reassign.

**Effort:** Tiny

---

#### M10. `calculateDailyAllowance()` Duplicated
**Status:** ❌ UNRESOLVED  
**Files:** `ReportController.kt:481-495` · `PdfService.kt:635-647`

Identical logic in two files. `ReportController` version uses `System.err.println` on error; `PdfService` version silently returns 0.

**Fix:** Extract to `ReportService` as a shared method.

**Effort:** Small

---

#### M24. No `SPRING_PROFILES_ACTIVE` in `.env.example`
**Status:** ❌ UNRESOLVED  
**File:** `.env.example`

Missing documented env var.

**Fix:** Add `SPRING_PROFILES_ACTIVE=prod`.

**Effort:** Tiny

---

#### M25. No `IMAP_POLL_INTERVAL` in `.env.example`
**Status:** ❌ UNRESOLVED  
**File:** `.env.example`

Missing documented env var.

**Fix:** Add documented env var.

**Effort:** Tiny

---

#### M26. No `LOG_LEVEL` in `.env.example`
**Status:** ❌ UNRESOLVED  
**File:** `.env.example`

Missing `LOGGING_LEVEL_ROOT=INFO`.

**Fix:** Add env var.

**Effort:** Tiny

---

#### M27. K8s Probes vs Docker Healthcheck Inconsistency
**Status:** ❌ UNRESOLVED

`deployment.yaml` uses `/actuator/health/*`; compose uses `/api/health`.

**Fix:** Align on one pattern.

**Effort:** Small

---

## 🟢 LOW (26)

### Backend (8)

| ID | Finding | File | Effort |
|----|---------|------|--------|
| L1 | `System.err.println("!!!!! EXCEPTION: ...")` instead of logger | `ReportController.kt:492` | Tiny |
| L2 | Missing `@Repository` on `OcrJobRepository` (all others have it) | `Repositories.kt:225` | Tiny |
| L3 | Duplicate `AdvancePaymentOut`/`MileageRecordOut` DTO mapping across 3 controllers | `AdvanceController.kt:355-378`, `ReportController.kt:431-476` | Small |
| L4 | Manual password length check duplicates DTO `@Size(min=8)` validation | `AuthController.kt:179` | Tiny |
| L5 | OCR status URL returns `/ocr/status/{id}` instead of `/api/ocr/status/{id}` | `OcrController.kt:84` | Small |
| L6 | `ImapConfigIn.imapPass` is `var` (mutable) in a `data class` | `AppSettingsController.kt:525-532` | Tiny |
| L7 | Email "test" button actually sends a real email to the recipient | `EmailSettingsService.kt:109` | Small |
| L8 | `app_settings.key` field lacks `@Column` annotation; `key` is SQL reserved word | `Models.kt:566` | Small |

### DB/Schema (6)

| ID | Finding | File | Effort |
|----|---------|------|--------|
| L9 | `insurance_files.file_path VARCHAR(500)` vs entity default `VARCHAR(255)` | `Models.kt:545-546` | Tiny |
| L10 | `ocr_comparisons.sha256 VARCHAR(64)` vs entity no length constraint | `Models.kt:635` | Tiny |
| L11 | CHECK constraint name mismatch: `chk_advances_*` on table `advance_payments` | `V5__data_integrity_constraints.sql` | Tiny |
| L12 | `expenses` uses `DOUBLE PRECISION` for amounts but `NUMERIC` for tax — inconsistent | `V1__init.sql` | Large (merge with H5) |
| L13 | `@Valid` doesn't prevent NPE on null `startTime`/`endTime` before `.isBefore()` | `MileageController.kt:76-78` | Small |
| L14 | OCR sidecar healthcheck missing `start_period` (EasyOCR model download slow) | `docker-compose.yml:150-154` | Tiny |

### Frontend (4)

| ID | Finding | File | Effort |
|----|---------|------|--------|
| L15 | `lib/themes.ts` — 31 lines, never imported, all roles map to "blue" | `lib/themes.ts` | Tiny |
| L16 | Add `useDebounce` custom hook for search inputs | — | Tiny |
| L17 | Remove unused imports (`BigDecimal`, `RoundingMode` from `ExpenseController.kt`, `ReportController.kt`) | Various | Tiny |
| L18 | Standardize inline DTO mappers into dedicated mapper components | Various | Small |

### DevOps/Config (6)

| ID | Finding | File | Effort |
|----|---------|------|--------|
| L19 | Frontend Dockerfile lockfile glob `package-lock.json*` — could match wrong files | `frontend/Dockerfile:4` | Tiny |
| L20 | Stale `make docker-build` reference in Makefile error message (target doesn't exist) | `Makefile:21` | Tiny |
| L21 | No `test-frontend` Makefile target | `Makefile` | Tiny |
| L22 | Unversioned `apk add curl su-exec` — non-reproducible builds | `backend-kotlin-jpa/Dockerfile:29` | Tiny |
| L23 | `.gitignore` missing `mineru/` artifacts, `.env.local`, `.env.production` | Root `.gitignore` | Tiny |
| L24 | `javax.cache:cache-api:1.1.1` used instead of `jakarta.cache` for Spring Boot 3.x | `build.gradle.kts:39` | Tiny |

### Test Infrastructure (2)

| ID | Finding | File | Effort |
|----|---------|------|--------|
| L25 | `ExpenseControllerTest` missing `mod1` check | `ContextLoadsTest.kt:8-13` | Tiny |
| L26 | No `application-test.yml` despite `@ActiveProfiles("test")` | `src/test/resources/` | Small |

---

## Test Coverage Report

### Coverage Summary

| Metric | Value |
|--------|-------|
| Total test files | 14 |
| Total test methods | 62 |
| Integration tests | 47 |
| Unit tests (Mockito) | 15 |
| Controllers tested | **5/15** (33%) |
| Services tested | **5/15** (33%) |
| Endpoints tested | **~12/77** (16%) |

### Controllers With Zero Tests

- `ReportController.kt` — 758 lines, 16 endpoints
- `AppSettingsController.kt` — 538 lines, 21 endpoints
- `OcrController.kt` — 272 lines, 3 endpoints
- `MileageController.kt` — 242 lines, 4 endpoints
- `InventoryController.kt` — 384 lines, 9 endpoints
- `InsuranceController.kt` — 223 lines, 5 endpoints
- `SignatureController.kt` — 115 lines, 3 endpoints
- `LdapSettingsController.kt` — 153 lines, 4 endpoints
- `CategoryController.kt`
- `HealthController.kt`

### Services With Zero Tests

- `PdfService.kt`, `StorageService.kt`, `S3StorageProvider.kt`, `ExportService.kt`, `LdapService.kt`, `EmailSettingsService.kt`, `EmailImportService.kt`, `CryptoService.kt`, `ExpenseMapper.kt`, `StorageProvider.kt`

### Test Infrastructure Issues

1. **`FxServiceTest.kt:54-66`** — Makes real HTTP calls to external APIs (network-dependent/flaky)
2. **Missing `application-test.yml`** — `@ActiveProfiles("test")` but no test-specific config file
3. **`TestAuthHelper.loginAs()`** — Full HTTP login dispatch per test (~47+ calls)
4. **IntegrationTestBase** — Single container in companion object (mitigated for sequential runs, but parallel forks create new containers)

---

## README Inaccuracies

1. **State machine diagram wrong** — "expenses detached" on rejection is incorrect. Expenses stay attached; only status resets to `draft`. Missing `rejected → draft` recall transition.
2. **"Comprehensive test suite"** — overstatement; ~12% endpoint coverage.

---

## By-Design Tradeoffs

| Finding | Rationale |
|---------|-----------|
| **C3** (file ops before transaction) | Prevents DB connection pool starvation under load (S66) |
| **H12** (override mounts may fail) | Enables sub-1s class reload without Docker rebuild (S64) |
| **M5** (login invalidates sessions) | Per-user session invalidation is standard security practice (S52–S79) |

---

## Consolidated Summary Table

| Category | Total | ✅ Resolved | 🔶 By Design | ❌ Unresolved |
|----------|-------|-------------|---------------|---------------|
| CRITICAL | 13 | 2 (C10, C13) | 1 (C3) | 10 |
| HIGH | 42 | 0 | 1 (H12) | 40 |
| MEDIUM | 24 | 1 (M13) | 1 (M5) | 22 |
| LOW | 26 | 0 | 0 | 26 |
| **Total** | **105** | **3** | **3** | **95** |

---

## Remediation Roadmap

Priority-ordered by effort × impact, assuming 1 sprint = 1 week:

### Sprint 1: Quick Security & Ops Wins (5 days)
- H2 (path traversal), C4 (CSRF/SameSite), C11 (Insurance path traversal), C12 (Gemini key header)
- C7 (deployment.yaml JWT_SECRET), C8 (probes), C9 (COOKIE_SECURE)
- C6 + H11 (.dockerignore), H10 (CI caching), H13 (DNS)
- C2 (global exception handler), L1 (println→logger), L2 (@Repository), L5 (OCR URL)

### Sprint 2: Data Integrity & Performance (5 days)
- C5 (V17 TIMESTAMPTZ migration), H8 (missing index)
- H3 (CompletableFuture executor), H4 (LazyInit fix), H6 (OCR ownership)
- M1 (atomic report+email), M7 (MileageRecord soft delete)
- M2 (DB query caching)

### Sprint 3: Memory Safety & Refactoring (5 days)
- C1 (Dashboard + Report pagination)
- H5 + L12 (Double→BigDecimal schema + entity refactor)
- H14 (Split Models.kt), H15 (Fat controllers → services)

### Sprint 4: Structural & Test Coverage (5 days)
- H1 (equals/hashCode on all entities)
- Integration tests for 10 untested controllers
- Frontend: H18 (exhaustive-deps), H19 (Loading→skeletons), H20 (format lib)

### Deferred (no fix)
- H7 (V8 irreversible — cannot fix without data loss)
- M13 (non-issue on Hibernate 6.6.13.Final)

---

*Merged from `audit.md`, `auditv2.md`, and `improvemen-audit.md`. Verified against codebase 2026-06-22.*

---

## Verification Addendum (2026-06-22, re-verified against code)

A second pass re-checked all CRITICAL findings plus a broad sample (~30) of HIGH/MEDIUM/LOW directly against the source. **Findings are accurate as stated**; the two spot-checked "RESOLVED" claims (C10, C13) are genuinely resolved. Three citation/wording corrections and three net-new open points follow.

### Corrections to existing findings

- **C1** — `ExpenseController.kt:405` is **already fixed** (uses `findAllWithFilters`, not `findAll()`), and the report-list path (`ReportController.kt:70-100`) uses **scoped** `findAllWithExpenses()` queries, *not* `findAll()`. The genuine residual is the **in-memory `sortedByDescending` + `subList` pagination** (lines 84–100) on the privileged path. `DashboardController.kt:39,54` `findAll()` is correctly flagged.
- **H30** — The frontend service **does** have `restart: unless-stopped` (`docker-compose.yml:87`). Only `depends_on` is genuinely missing; the "no restart" part of the finding is incorrect.
- **M3** — The in-memory-sort list under-counts. Additional top-level list sorts exist at `AdvanceController.kt:352`, `ReportController.kt:527`, and `DashboardController.kt:83`.

### New open points (not in the original 105)

- **N1. Additional full-table `findAll()` scans (same OOM class as C1).** Not enumerated by C1:
  - `AppSettingsController.kt:328,419,439` — `receiptRepository.findAll()` (orphan scans load every receipt, 3×)
  - `OcrService.kt:153` — `expenseRepository.findAll().filter { … }` (NaiveBayes training loads all expenses)
  - `LdapService.kt:211` — `userRepository.findAll().filter { authSource == "ldap" }`
  - `EmailImportService.kt:402,446` — `userRepository.findAll().firstOrNull { it.email == … }`
  - **Fix:** push the predicate into the query (`@Query`/derived method) or stream; **Effort:** Small.
- **N2. Missing `findByEmail` repository method.** `UserRepository` has only `findByUsername` (`Repositories.kt:19`); the N1 email lookups full-scan + match in memory. **Fix:** add a derived `findByEmail`. **Effort:** Tiny.
- **N3. M3 sort list non-exhaustive** — see Corrections above (`AdvanceController:352`, `ReportController:527`, `DashboardController:83`). **Fix:** DB `ORDER BY`. **Effort:** Tiny.

N1–N3 fall within the existing C1 / `performance-query-optimization` theme (no new category). They are folded into the `audit-remediation` OpenSpec change: task **3.1** (N1), task **2.13** (N3), and new task **2.14** (N2).
