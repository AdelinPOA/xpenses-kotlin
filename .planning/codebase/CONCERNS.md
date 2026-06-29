# Codebase Concerns

**Analysis Date:** 2026-06-29

## Tech Debt

### Soft-Delete Cascade Gaps

**Issue:** `ExpenseReport`, `Expense`, and `Receipt` entities use Hibernate `@SQLDelete` + `@SQLRestriction` for soft-delete, but child entity cascades are not automatic. When a report is deleted, its expenses are orphaned (not soft-deleted themselves), leading to phantom records and query anomalies.

**Files:** 
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt` (lines 80, 186, 267 — three TODO comments)
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ReportService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt`

**Impact:** 
- Reports deleted via the UI leave expenses visible in the expense list (their `deleted` flag is not set)
- Phantom expenses can still be queried and attached to other reports
- Audit trails incomplete — financial records don't reflect actual deletion intent

**Fix approach:**
1. On `ReportService.deleteReport()`, explicitly soft-delete all attached expenses and receipts *before* deleting the report itself
2. Add a service-layer helper `ExpenseService.softDeleteExpensesByReportId()` that marks expenses `deleted=true`
3. Add a service-layer helper `ReceiptService.softDeleteReceiptsByExpenseIds()` similarly
4. Document this pattern in CLAUDE.md — soft-delete requires explicit cascade at service layer, not ORM

---

### Stale Audit Scratch Files in Repo Root

**Issue:** Nine untracked/legacy AI-generated scratch files still in repo root, flagged since session 94 but never cleaned up.

**Files:** `glm52.md`, `hermes.md`, `mino25.md`, `nemotron.md`, `todo.md`, `kotlin_migration_plan.md`, `TOKEN_OPTIMIZATION.md`, `reasonix.toml`, `test.kts`

**Impact:** Repo hygiene — no functional risk, but clutters root and signals incomplete cleanup/review

**Fix approach:** Delete all nine files; confirm with user before cleanup

---

### Cascading Monetary Type Conversions Not Complete

**Issue:** Session 85 migrated monetary columns from `Double` → `BigDecimal` (migration `V20`), but not all conversion sites may be covered. Future developers might still use `Double` for money fields.

**Files:** 
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt` (all monetary fields should use `BigDecimal`)
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt` (currency formatting)
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt` (rate calculations)

**Impact:** Silent loss of precision if a new monetary field defaults to `Double`. Rounding errors accumulate in reports.

**Fix approach:**
1. Add a linter rule or `@Deprecated` annotation on Double to warn developers not to use it for money
2. Document monetary field pattern in CONVENTIONS.md: "Always use `BigDecimal` with scale=2, RoundingMode.HALF_UP"
3. Consider a Checkstyle/detekt rule to reject `Double` in monetary entity fields

---

## Test Coverage Gaps

### High-Risk Controllers Untested

**Issue:** 9 of 16 controllers have zero automated test coverage. These include critical business logic (Inventory, Mileage, Advances, OCR, Settings).

**Files:**
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/CategoryController.kt` — NO TESTS
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InventoryController.kt` — NO TESTS
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt` — NO TESTS
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt` — NO TESTS
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/SignatureController.kt` — NO TESTS
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/LdapSettingsController.kt` — NO TESTS
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt` — NO TESTS
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/OcrController.kt` — NO TESTS
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/BulkExpenseController.kt` — NO TESTS (new feature)

**Impact:**
- Role-based access control bugs silently introduced in untested endpoints (e.g., Mileage might allow technician to edit manager's records)
- Input validation gaps (null checks, boundary conditions) caught only in production
- Refactoring of untested code risks regressions

**Fix approach:**
1. Use `IntegrationTestBase` pattern from `AdvanceControllerTest.kt` / `ExpenseControllerTest.kt` as template
2. Prioritize Mileage, Advances, OCR (financial/sensitive logic first)
3. Add at least one happy-path + one unauthorized-access test per controller
4. Run `make test` after each addition to verify suite stays green

---

### OCR Service Test Brittleness

**Issue:** `OcrServiceTest.kt` was rewritten in session 100 to cover fallback chains, but the test uses literal argument matching instead of `ArgumentMatchers.any()` because Kotlin non-null types fail with `any()` returning null. This pattern is fragile and hard to extend.

**Files:** `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/OcrServiceTest.kt`

**Impact:**
- Tests are harder to read/maintain (explicit args instead of semantic matchers)
- New test cases require precise argument replication (copy-paste error risk)

**Fix approach:**
1. Create a custom `anyNonNull<T>()` matcher for Kotlin that wraps `any()` with a non-null guard
2. Refactor OCR tests to use it
3. Document the pattern for future test writers

---

### Missing PDF Font Regression Test

**Issue:** Session 99 fixed a critical bug where `PdfService.mergePdfFiles()` corrupted embedded font streams during PDF merging. The fix (using `PDFMergerUtility` instead of manual `importPage`) is not covered by a regression test.

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt` (mergePdfFiles method)

**Impact:** The bug — silent font stream corruption with intact-looking dictionaries — can re-appear silently if the code is refactored. A test that only checks "merge doesn't throw" won't catch it.

**Fix approach:**
1. Add a test in `backend-kotlin-jpa/src/test/` that generates a PDF with Euro symbols (or other non-ASCII chars), merges it with another PDF, and asserts the resulting font stream is non-empty
2. Parse the merged PDF with PDFBox and verify stream bytes exist

---

## Security Considerations

### Cascading Encryption Secret Issues

**Issue:** `JWT_SECRET` env var doubles as the root key for LDAP/OCR/IMAP/storage config encryption (via `CryptoService` with the hardcoded info label `"xpenses-ldap-settings-pw"`, etc.). If `JWT_SECRET` rotates for a security incident, all encrypted settings silently fail to decrypt.

**Files:**
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/CryptoService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/LdapService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailImportService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt`

**Impact:**
- Rotating `JWT_SECRET` for a compromised session key breaks LDAP sync, OCR scanning, email polling, and S3 access permanently
- No recovery path except re-entering all encrypted settings

**Current mitigation:** `before_production.md` recommends setting a separate `ENCRYPTION_SECRET`, but this is not implemented

**Fix approach:**
1. Add `ENCRYPTION_SECRET` env var to `.env` (default: derive from `JWT_SECRET` for backward compat)
2. Update `CryptoService` to read from `ENCRYPTION_SECRET` instead of `JWT_SECRET`
3. Document in CLAUDE.md that `ENCRYPTION_SECRET` and `JWT_SECRET` must be rotated independently

---

### Unencrypted Database Credentials in docker-compose.yml

**Issue:** `docker-compose.yml` hardcodes Postgres credentials (`SPRING_DATASOURCE_PASSWORD=xpenses`) in plaintext. `.env` file is not tracked in git but is used locally; compose file is tracked.

**Files:** `docker-compose.yml` (hardcoded `xpenses` password multiple places)

**Impact:**
- If compose file is ever committed with real credentials (accident), password is in git history forever
- Dev teams with git access see the literal password

**Current mitigation:** `before_production.md` notes this but it's not fixed

**Fix approach:**
1. Use env file interpolation: `${POSTGRES_PASSWORD}` in compose
2. Keep actual password only in `.env` (git-ignored)
3. Document in README: "Copy `.env.example` to `.env` and set your Postgres password"

---

### No Automated Secret Scanning in CI

**Issue:** `.github/workflows/ci.yml` runs gitleaks but only on pull requests / pushes to `main`. No pre-commit hook runs locally to catch secrets before push.

**Files:** `.github/workflows/ci.yml`

**Impact:**
- Developers can push plaintext API keys/passwords on feature branches before gitleaks catches them on PR
- Secret already in git history — CI failure doesn't remove it

**Fix approach:**
1. Add `pre-push` git hook via `.husky` that runs `gitleaks detect --source=git --verbose` locally
2. Document in CLAUDE.md and README: "Husky hooks run gitleaks before push"

---

## Performance Bottlenecks

### N+1 Queries on User Authentication

**Issue:** `JwtAuthenticationFilter` decodes JWT and loads the full `User` entity from the database on *every* request. No caching of authenticated users within a request or session.

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/JwtAuthenticationFilter.kt`

**Impact:**
- One authenticated user making 10 API calls = 10 database round-trips for the same user
- Under load, this saturates the connection pool

**Current status:** Session 88's audit flagged this; not yet fixed.

**Fix approach:**
1. Add `@Cacheable` annotation to `UserRepository.findById()` with Caffeine cache (max 1000 users, 30-min TTL)
2. Or: add a simple request-scoped cache in `RequestContextHolder` to avoid 2+ lookups in a single HTTP request
3. Invalidate cache on user update/password-change via `@CacheEvict`

---

### Large File Handling in PdfService

**Issue:** `PdfService.mergePdfFiles()` and `generateReportPdf()` load entire PDF files into memory (`ByteArray`). For large reports with 100+ receipt PDFs, this can exhaust heap.

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt`

**Impact:**
- Reports with many attachments (e.g., 50+ receipts × 2MB each = 100MB) risk OOM
- Container memory limit is 1GB; a single large report can take 10% of available heap

**Fix approach:**
1. Stream PDF merging instead of loading all into memory (PDFBox supports streaming merge)
2. Add a file size check before merge: if receipts total > 50MB, return error with helpful message
3. Document max receipt count/size in user guide

---

### Inefficient OCR Job Polling

**Issue:** `OcrController` async OCR jobs are stored in the database with a status field, but frontend polls at a fixed interval (likely 500ms or 1s) with no exponential backoff.

**Files:**
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/OcrController.kt`
- `frontend/components/expenses/ExpenseForm.tsx` (polling logic)

**Impact:**
- 60+ requests/minute to `/api/ocr/status/{jobId}` per scanning expense, even when most jobs complete in <2s
- Under heavy load (bulk upload 20 receipts), this can create 1000s of polling requests

**Fix approach:**
1. Add exponential backoff: start at 200ms, double up to 5s max
2. Or: implement Server-Sent Events (SSE) for `/api/ocr/status` to push updates instead of polling
3. Document max polling duration: if job >120s with no result, declare timeout/failure

---

## Fragile Areas

### Monolithic Models.kt and Repositories.kt

**Issue:** All JPA `@Entity` classes (14+ entities) live in a single 659-line `Models.kt` file. All `Repository` interfaces (12+ repos) live in a single 230-line `Repositories.kt` file. This makes navigation hard and encourages tight coupling.

**Files:**
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt`

**Impact:**
- Adding a new entity requires editing a 659-line file → high merge conflict risk
- Hard to find a specific entity or query in a crowded file
- Accidental coupling (entity A imports entity B's repo even though it shouldn't)

**Fix approach:**
1. Split into domain-focused files: `UserModel.kt`, `ExpenseModel.kt`, `ReportModel.kt`, etc.
2. Split repos similarly: `UserRepository.kt`, `ExpenseRepository.kt`, etc.
3. Keep an `index.kt` or `package-exports.kt` in models/ to re-export for backward compat
4. This is a refactoring; no functional change

---

### Complex Gemini OCR Fallback Chain

**Issue:** `OcrService` implements a 4-tier Gemini model fallback (`gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-3-flash` → `gemini-2.5-flash`). If the first 3 fail, the fourth is used; if all fail, an error persists and the user must manually fill the expense.

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt` (lines 45-50, 200-250 fallback loop)

**Impact:**
- Hard to test all combinations (4 models × success/failure = 8+ paths)
- Silent fallback means user doesn't know which model was actually used (logs only)
- If the fallback chain exhausts, error message is generic ("OCR failed")

**Fix approach:**
1. Add logging at each fallback step: `"model-X failed with error Y, trying model-Z"`
2. Return detailed error in response: `{ failed_models: [model1, model2], final_error: "..." }`
3. Extend test coverage to cover full chain exhaustion (currently tested, but brittle)

---

### Encryption Config Load Failures Silent

**Issue:** `CryptoService`, `OcrService`, `LdapService`, `StorageService` all decrypt stored settings on startup. If decryption fails (corrupted config, wrong key, etc.), they log and fall back to defaults. User doesn't know the stored config is broken until they try to use the feature.

**Files:**
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/CryptoService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/LdapService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt`

**Impact:**
- LDAP config silently switches to disabled → user's LDAP login stops working without warning
- OCR key decryption fails → OCR endpoints return generic "failed" errors
- Storage config broken → file uploads silently fall back to local storage

**Fix approach:**
1. Add a `/api/settings/validate-all` endpoint that decrypts and validates all stored configs
2. Log a WARN on startup if any critical config fails to load: `"OCR config failed to decrypt — OCR disabled until corrected"`
3. Add a dashboard widget showing which integrations are "broken/disabled due to config error"

---

## Scaling Limits

### Single-Server Deployment

**Issue:** Current deployment (as of HANDOFF session 100) runs frontend, backend, Postgres, and optional Caddy on a single 24-core / 8GB RAM host at `xpenses.nt-automation.eu`. Blast radius is the entire application if the server fails or runs out of resources.

**Files:** `docker-compose.yml`, `before_production.md`

**Current capacity:**
- Postgres connection pool: 10 default (Spring DataSource)
- Backend thread pool: 200 (default Tomcat)
- Frontend Node memory: 4GB heap (configured in Dockerfile)

**Limit:**
- OCR + PDF generation spike can cause 1+ second latency for all users
- Database connection pool exhaustion at ~50 concurrent users with slow queries
- Disk space: `/app/data/receipts` volume unbounded

**Fix approach:**
1. For MVP (current): monitor `/metrics` (Prometheus) and `/actuator/health` for warning signs
2. Before 10+ daily users: migrate Postgres to managed RDS or separate VM
3. Before 100+ users: run backend on separate container/VM, use nginx as load balancer
4. Document scaling checkpoints in `SCALING.md`

---

### Receipt Storage Not Bounded

**Issue:** `StorageService` uploads receipt files to a local Docker volume or S3 with a 50MB file-size limit per file, but no volume-level quota on total storage.

**Files:**
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt`
- `docker-compose.yml` (volumes: xpenses-data is unbounded)

**Impact:**
- If 100 users upload 10 receipts/month × 2MB average = 2GB/month, volume fills in ~1 year
- No warning before disk full — file uploads fail with cryptic errors

**Fix approach:**
1. Add a quota check in `StorageService.uploadFile()`: if remaining space < 10% of volume, reject uploads
2. Add a scheduled job to clean up old (>2yr) receipts (soft-deleted reports can be purged)
3. Document storage cleanup in operations guide

---

## Dependencies at Risk

### Deprecated Gemini Model References

**Issue:** `OcrService` fallback chain includes `gemini-3-flash` (Preview model) which may be deprecated without warning. The fallback list is hardcoded; adding new models requires code changes.

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt` (lines 45-50)

**Impact:**
- If Google retires `gemini-3-flash` or `gemini-2.5-flash`, OCR breaks with API error
- User has to wait for a code fix + deployment; no fallback to alternative models

**Current mitigation:** Multiple models in chain; if one is retired, others still work

**Fix approach:**
1. Move `GEMINI_FALLBACK_CHAIN` to `app_settings` table (JSON) so it can be updated without redeployment
2. Add `/api/admin/ocr/test-model` endpoint to verify all models in the chain are still reachable
3. On startup, test the first 2 models and log WARN if either is unreachable

---

### OpenPDF and PDFBox Coupling

**Issue:** `PdfService` uses both OpenPDF (2.0.3) for generation and PDFBox (3.0.2) for parsing/merging. Two different PDF libraries in the same service create versioning and API drift risk.

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt`

**Impact:**
- Dependency vulnerabilities in either library can require careful coordination (breaking API changes)
- 2 libraries = 2× probability of a security issue in PDF handling
- Embedding fonts correctly across both requires deep domain knowledge

**Current status:** Session 99 fixed a critical font-corruption bug caused by this coupling

**Fix approach:**
1. Long-term: migrate both generation and parsing to PDFBox only (or OpenPDF only) to consolidate
2. Short-term: add comprehensive integration tests for font handling (covers the PDF boundary)
3. Document the coupling in CLAUDE.md with a note: "PDF handling is a fragile area — test all changes with real receipts"

---

## Known Bugs

### Cascade Soft-Delete Not Implemented

**Bug:** When a report is deleted, its expenses are not soft-deleted, leaving orphaned financial records in the database.

**Symptoms:** Expense list shows expenses from deleted reports; they can be attached to other reports, causing data integrity issues

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ReportService.kt` (deleteReport method)

**Trigger:** User deletes a report via `DELETE /api/reports/{id}`

**Workaround:** None; bug persists in production. Users should avoid deleting reports with expenses.

**Fix:** See "Soft-Delete Cascade Gaps" under Tech Debt above.

---

### Encryption Key Rotation Not Supported

**Bug:** If `JWT_SECRET` or `ENCRYPTION_SECRET` is rotated, all previously-encrypted settings (LDAP, OCR, IMAP, storage) become permanently inaccessible.

**Symptoms:** After secret rotation, `/api/settings/ldap` returns empty config; LDAP sync fails silently; OCR scanning returns "OCR disabled"

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/CryptoService.kt`

**Trigger:** Admin rotates `ENCRYPTION_SECRET` in `.env` and restarts container

**Workaround:** Re-enter all encrypted settings manually via the admin UI

**Fix:** Implement key versioning — store secret version ID with each encrypted value, support decryption with old keys, re-encrypt on next write with new key.

---

### User Cache Invalidation on Password Change

**Bug:** If user caching (recommended in Performance Bottlenecks) is implemented, password changes in one session don't immediately invalidate cached user objects in other sessions.

**Symptoms:** User A changes password; User A's session still works (uses cached token); User B's session still sees User A's old password hash (reads cache)

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/JwtAuthenticationFilter.kt` (if caching is added)

**Trigger:** User A changes password in `/api/users/{id}`, User B is logged in

**Workaround:** Restart backend to clear caches

**Fix:** When user password/role changes, evict from cache immediately; broadcast to all sessions (Redis pub-sub or in-memory event)

---

## Missing Critical Features

### No Audit Log of Financial Decisions

**Issue:** No record of *who* approved/rejected/paid a report, or when. Soft-deleted records have `deleted_at` but no `deleted_by` column.

**Impact:** Compliance/forensics gap — can't answer "who signed off on this expense?" or "why was this report rejected?"

**Files:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt` (ExpenseReport, Expense entities)

**Fix approach:**
1. Add `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `paid_by`, `paid_at` columns to `expense_reports`
2. Add `deleted_by` to soft-deleted financial entities
3. Populate these on every state transition in `ReportService`
4. Create `/api/reports/{id}/audit-log` endpoint to expose the audit trail to managers/finance

---

### No Bulk Action Support

**Issue:** Bulk expense upload is new (session 93), but there's no bulk action API for approving/rejecting/paying multiple reports at once. Finance team must click "Approve" individually for 20+ reports.

**Impact:** Finance workflow is slow; UX friction at scale

**Fix approach:**
1. Add `POST /api/reports/bulk-approve` accepting `{ reportIds: [1, 2, 3] }`
2. Add similar for bulk-reject and bulk-pay
3. Add a "select all" checkbox and "Approve selected" button to the reports list UI

---

### No Time-Zone Handling

**Issue:** Date fields in the API are strings (ISO-8601 format), but user's time zone is not captured. All dates are interpreted in UTC or the server's time zone.

**Impact:** Users in different time zones see expenses with "wrong" dates (e.g., expense from 2 PM becomes 4 PM due to TZ offset)

**Files:** Almost all date fields across models, controllers, frontend

**Fix approach:**
1. Add `time_zone` column to `User` table (Olson tz name, e.g. `"Europe/Bucharest"`)
2. Store all dates in `timestamptz` (Postgres) or UTC instant (already done)
3. Return dates in user's time zone in API responses (calculated server-side)
4. Handle client-side date parsing in frontend with Intl API

---

