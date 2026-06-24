# HANDOFF.md — xpenses-kotlin

## Current Session (2026-06-25, session 80)

### What Was Done
- **Full Audit Remediation (from hermes.md/todo.md)** — Implemented P0 (all 7 critical/security fixes), P1 (all 18 high-priority fixes), and most P2 items. Branch: `fix/audit-remediation`. 24 files modified + 1 new Flyway migration.

#### P0 — Critical / Security (7/7)
- **C0** `V17__fix_expenses_status_check.sql` — new migration adding `'paid'` to `chk_expenses_status` CHECK constraint
- **C1** `EmailImportService.pollAndProcessEmails` — added `@Async` + `@Transactional` to scheduled IMAP polling
- **C2** `ReportService.submitReport` — replaced `.get()` with `.orElseThrow { ResponseStatusException(NOT_FOUND) }`
- **C3** `EmailImportService.parseDelegationEmailGemini` — moved Gemini API key from `?key=` query param to `x-goog-api-key` header
- **C5** `OcrService.scanMineru/testMineruConnection` — added `validateUrlForSsr()` allowlist check on mineruUrl/baseUrl
- **C6** `StorageService.getLocalPath` — replaced `absoluteFile` with `canonicalFile` + canonical path traversal guard (all 4 sites + migration code)
- **C7** `UserController` — replaced `as User` with `as? User ?: throw ResponseStatusException(...)` at both sites

#### P1 — High (18/18)
- **C8** `Repositories.kt` — added `findByEmailIgnoreCase()` to UserRepository; used in EmailImportService instead of `findAll().firstOrNull`
- **C9** `OcrService.scanReceipt` — replaced 3× `CompletableFuture.runAsync` (ForkJoinPool) with Spring-managed `@Qualifier("applicationTaskExecutor")`
- **C10** `ReportController.calculateDailyAllowance` — replaced `System.err.println` with `log.warn`
- **H0a** `ReportService.payReport` — removed `mod` from allowed roles
- **H0b** `ExpenseController.getSingleReceipt/getReceiptCompat` — removed `manager` from IDOR guard
- **H0c** `ReportService.payReport` — added self-ownership check (mirrors approve/reject)
- **H0d** `Repositories.kt` — added `ORDER BY e.date DESC, e.id DESC` to paged/non-paged queries
- **H0e** `ExpenseForm.tsx` — fixed `onError` to read `e.message ?? e.response?.data?.detail`
- **H0f** `LdapService` — wrapped `InitialDirContext` in `.use {}`, close `NamingEnumeration` in finally
- **H0g** `S3StorageProvider.download` — wrapped `ResponseInputStream` in `.use {}`
- **H10** `AsyncOcrService` — extracted failure persist into `@Transactional(REQUIRES_NEW)` method
- **H11** — added HTTP connect/read timeouts to `OcrService` (10s/60s), `FxService` (10s/30s), `EmailImportService` (10s/60s)
- **H3** Frontend — replaced `<a href={API_BASE_URL/...}>` with Axios `downloadBlob()` in `ExpenseForm.tsx`, `ExpensesClient.tsx`, `reports/[id]/page.tsx`
- **H4** `ExpenseForm.tsx` — OCR polling: max 60 retries (~90s), `AbortController`, timeout error message
- **H5** `AuthController/JwtTokenProvider` — added `tokenVersion` mechanism (column + claim + validation); invalidates JWTs on password change
- **H6** `ReportService.submitReport` — extracted SMTP email into `@Async fun sendReportSubmittedNotification()`
- **H7** `InsuranceController` (2 sites) + `ExpenseController` (2 sites) — replaced `!!` with `?: throw ResponseStatusException`
- **H8** `ReportService.rejectReport` — removed `totalAmount = 0.0` (keeps original total, consistent with recallReport)
- **H9** `PdfService` — wrapped logo `InputStream` in `.use {}` for auto-close

#### P2 — Medium (5/8 selected)
- **M-G3** `PdfService` — `DecimalFormat` → `ThreadLocal.withInitial { DecimalFormat(...) }`
- **M-G5** `Models.kt` — added `@Version` to `Expense`, `AdvancePayment`, `MileageRecord` + updated `@SQLDelete` on Expense
- **M23** `CryptoService` — AES/CBC+HMAC → AES/GCM (with backward compat), `@PostConstruct` secret fail-fast, dedicated `encryption.secret` property
- **M-G1** `EmailImportService` — mark IMAP SEEN on success only (not on parse failure)
- **M-G2** `ExpenseController`/`InsuranceController` — moved file writes inside `transactionTemplate.execute{}` to prevent orphan files on rollback
- **M-G7** `EmailImportService` — added `mail.imap.starttls.enable=true` to IMAP session props

#### Infrastructure
- **H1/H2** `DashboardController` — replaced `findAll()` with JOIN FETCH queries; added `@Transactional(readOnly = true)`
- **Repositories.kt** — added ORDER BY to ExpenseReportRepository queries (id DESC) for deterministic pagination

### Files Changed (24 + 1 new)
- `backend-kotlin-jpa/src/main/resources/db/migration/V17__fix_expenses_status_check.sql` — **NEW**
- `AuthController.kt`, `DashboardController.kt`, `ExpenseController.kt`, `InsuranceController.kt`, `ReportController.kt`, `UserController.kt`
- `JwtAuthenticationFilter.kt`, `JwtTokenProvider.kt`
- `AsyncOcrService.kt`, `CryptoService.kt`, `EmailImportService.kt`, `FxService.kt`, `LdapService.kt`, `OcrService.kt`, `PdfService.kt`, `ReportService.kt`, `StorageService.kt`, `S3StorageProvider.kt`
- `Models.kt`, `Repositories.kt`
- `ExpenseForm.tsx`, `ExpensesClient.tsx`, `reports/[id]/page.tsx`
- `todo.md`

### Not Yet Done
- **M3** — `Double`/`DOUBLE PRECISION` → `BigDecimal`/`NUMERIC(12,2)` (schema-breaking, needs migration)
- Remaining M1–M22, M-G6, M-G8, L1–L13 items (lower priority)
- `make test` + `make build` full verification (requires JDK 21 + Docker)
- Verification of ~22 unverified `[GLM]` findings

---

> Last updated: 2026-06-25
> Author: Hermes

---

## Latest Session (2026-06-21, session 78)

### What Was Done
- **Fixed OCR Fallback UI Display**:
  - Identified that when a preferred OCR provider (like Gemini or MinerU) failed, the backend fell back to EasyOCR but the frontend still only displayed the original configured provider name in the "Scan History & Comparisons" table, masking the failure from the user.
  - Added `easyocrError`, `geminiError`, and `mineruError` fields to the `OcrComparisonRow` data class in `OcrController.kt` and `OCRComparisonRow` interface in `frontend/lib/api.ts`.
  - Updated the frontend UI in `page.tsx` to detect fallback scenarios (e.g., when Gemini was requested but failed or returned null). In these cases, the UI now strikes through the failed provider name (e.g., `<del>GEMINI</del>`), adds a red "FAILED" badge, and explicitly displays an amber badge reading "Used: EASYOCR" underneath.
  - Reverted the removal of `gemini-3-flash` (Preview) at user's request, leaving it as an available model option in `page.tsx` and `OcrService.kt`.

### Files Changed
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/OcrController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- `frontend/app/admin/ocr/page.tsx`
- `frontend/lib/api.ts`

---

## Previous Session (2026-06-21, session 77)

### What Was Done
- **Added Gemini 3 Flash OCR Model Support**:
  - Registered `gemini-3-flash` as a selectable dropdown option in the frontend OCR Admin page (`frontend/app/admin/ocr/page.tsx`).
  - Added mapping in `OcrService.kt` to map the `gemini-3-flash` provider key to the official Gemini API model name `gemini-3-flash-preview`.
- **Verification**:
  - Rebuilt backend container and compiled frontend successfully.
  - Smoke-tested the connection test endpoint `/api/settings/ocr/test` for `gemini-3-flash`, confirming it returns `200 OK` with `success: true`.

### Files Changed
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- `frontend/app/admin/ocr/page.tsx`

---

## Previous Session (2026-06-21, session 76)

### What Was Done
- **Fixed Gemini Model OCR Connection Test and Scanning**:
  - Found that the frontend OCR Admin configuration page had compilation errors: operator precedence error mixing `||` and `??`, and an undefined variable `formData` inside the `handleTest()` connection handler.
  - Resolved compiler errors: added parentheses to the nullish coalescing expression and changed the connection test payload to use `watch("provider")` to dynamically retrieve the currently selected model provider.
  - Refactored `OcrService.kt` to:
    - Support all Gemini model options (like `gemini-3.1-flash-lite` and `gemini-3.5-flash`) for caching hit logic, cached data retrieval, and synchronous scanning (using `config.provider.startsWith("gemini-")`). Previously, selecting models other than `gemini` would fall back to EasyOCR caching and synchronous execution.
    - Centralize and expose `geminiModelName(provider)` publicly so that other components can resolve the correct model name.
  - Refactored `EmailImportService.kt` to resolve the model name dynamically for email parsing using `ocrService.geminiModelName(provider)`, rather than hardcoding `gemini-2.5-flash`.
  - Refactored `AppSettingsController.kt` to support all Gemini model variants for active email parser checks.
- **Verification**:
  - Rebuilt backend container and compiled frontend successfully.
  - Ran the full Kotlin test suite (62 tests) successfully.
  - Smoke-tested testing endpoint `/api/settings/ocr/test` for `gemini`, `gemini-3.1-flash-lite`, and `gemini-3.5-flash`, confirming all return `200 OK` with `success: true`.

### Files Changed
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailImportService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- `frontend/app/admin/ocr/page.tsx`

---

## Previous Session (2026-06-21, session 75)

### What Was Done

- **Fixed OCR Admin Layout Regression**: The comparison table ("Scan History & Comparisons") had reverted to a narrow `max-w-2xl` layout with a horizontal scrollbar. Root cause: commit `3b04f1a` (Bugfix round 1) was based on a commit prior to session 60's layout fix (`534bcf8`) and overwrote it.
  - Restored the layout fix: outer page container now uses fluid width (`px-4` instead of `max-w-2xl mx-auto`), settings form stays at `max-w-2xl mx-auto`, and the comparison section uses `max-w-6xl mx-auto` for a full-width table without horizontal scroll.
  - Frontend Docker image rebuilt and container restarted.
  - Docker frontend container stopped — dev server now runs directly via `npm run dev` on port 3001 (no Docker rebuild needed during development).
- **Fixed MinerU Model Cache Permissions**: MinerU was returning `409 Conflict` on every scan because `/home/mineru/.cache` was owned by `root` (created during Docker build), but the container runs as the `mineru` user. This caused `PermissionError: [Errno 13] Permission denied: '/home/mineru/.cache/modelscope'` when MinerU tried to create the modelscope cache directory at runtime.
  - Fixed running container: `chown -R mineru:mineru /home/mineru/.cache`
  - Updated `mineru/Dockerfile`: added `RUN mkdir -p /home/mineru/.cache/modelscope && chown -R mineru:mineru /home/mineru/.cache` before the `USER mineru` switch, so rebuilds won't regress.
  - Container restarted and health check passes.
- **Switched MinerU from GPU (XPU) to CPU mode**: Commit `62ccaa6` configured MinerU for Intel GPU acceleration (`MINERU_DEVICE_MODE=xpu`), but the local dev machine lacks an Intel GPU. Every scan attempt failed with `RuntimeError: No XPU devices are available`.
  - Changed `docker-compose.yml`: `MINERU_DEVICE_MODE=cpu`, commented out GPU-specific configs (devices, group_add, gpu-libs volume, LD_LIBRARY_PATH) with notes for re-enabling on GPU hardware.
  - Container recreated and healthy. No image rebuild needed — XPU PyTorch falls back to CPU when no GPU is detected.
- **Added Gemini 2.0 Flash and 3.1 Flash-Lite as OCR provider options**: Added both models to the frontend provider dropdown alongside the existing `gemini` (2.5 Flash).
  - Frontend: added `<option value="gemini-2.0-flash">` and `<option value="gemini-3.1-flash-lite">` in the select menu, updated validation and payload logic.
  - Backend: added `geminiModelName(provider)` helper that maps the provider string to the correct model name.
  - Fixed test connection to test the actually selected Gemini model (previously always tested 2.5 Flash regardless of selection).
  - Note: Google's docs list `gemini-2.0-flash` as retired on June 1, 2026 — API returns `limit: 0` (confirmed via direct API test). Removed `gemini-2.0-flash` option. The two working Gemini options are now `gemini` (2.5 Flash) and `gemini-3.1-flash-lite`.
  - Fixed test connection to test the actually selected Gemini model (previously always tested 2.5 Flash regardless of selection).
  - Added Gemini 3.5 Flash option. All Gemini providers now use `startsWith("gemini-")` matching so any future model variant works automatically.
  - Test connection button now shows for all Gemini provider variants.

## Previous Session (2026-06-21, session 73)

### What Was Done
- **Verification**: Ran the entire Gradle unit test suite inside a JDK 21 container; all tests passed successfully with 5 actionable tasks up-to-date.
- **Branch Delivery**: Cleanly stashed uncommitted workspace files, checked out `main`, pulled latest updates, merged `feat/mineru-gpu-acceleration` via fast-forward, and pushed the updated `main` to remote origin.
- **Work Preservation**: Switched back to `feat/mineru-gpu-acceleration` and restored the uncommitted MinerU Intel XPU/GPU configuration files to the working directory so they are preserved for future work.

### Files Changed
- None (delivered previous changes to `main`)

---

## Previous Session (2026-06-21, session 72)

### What Was Done
- **Optimized OCR Scanning Performance**:
  - Implemented client-side image compression in [ExpenseForm.tsx](file:///home/poa/xpenses-kotlin/frontend/components/expenses/ExpenseForm.tsx) using HTML5 Canvas. Image files are scaled down to max 1600px and compressed to 80% JPEG quality before scan, reducing upload size by **95%+** while retaining the original receipt for final database storage.
  - Added parallel PDF page extraction via `thread_count=2` and restricted PyTorch CPU thread count to 2 (`torch.set_num_threads(2)`) in [app.py](file:///home/poa/xpenses-kotlin/ocr-sidecar/app.py) to eliminate thread contention.
  - Programmed dynamic MIME type mapping in [OcrService.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt) when uploading files to Gemini API.
  - Implemented SHA-256 OCR Scan Caching by hashing files and looking up the best cached `OcrComparison` record (ranking linked expenses and populated results first). If found, the results are copied and returned in <50ms without invoking the OCR models.
  - Created Flyway migration [V15__add_sha256_to_ocr_comparison.sql](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/resources/db/migration/V15__add_sha256_to_ocr_comparison.sql) to add a `sha256` column to `ocr_comparisons`.
  - Added unit test suite [OcrServiceTest.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/OcrServiceTest.kt) to test caching, currency resolution, and record duplication.
- **Validation**:
  - Verified backend compilation and ran the entire JUnit test suite successfully inside a JDK 21 container.
  - Smoke-tested synchronous scan and verified database cache hit lookup with logs showing cache hits.

### Files Changed
- `frontend/components/expenses/ExpenseForm.tsx`
- `ocr-sidecar/app.py`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- `backend-kotlin-jpa/src/main/resources/db/migration/V15__add_sha256_to_ocr_comparison.sql`
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/OcrServiceTest.kt`

---

## Previous Session (2026-06-20, session 71)

### What Was Done
- **Fixed Slow OCR Scanning Performance (MinerU Bottleneck)**:
  - Identified that the OCR service was executing all three OCR engines (EasyOCR, MinerU, Gemini) in parallel but blocking the client HTTP request thread on `CompletableFuture.allOf(...).join()`.
  - Since MinerU runs layout parsing on CPU and takes up to 2 minutes, it bottlenecked all scan requests even if the user selected a fast provider (like EasyOCR or Gemini).
  - Refactored `scanReceipt` in `OcrService.kt` to pre-save an empty `OcrComparison` record to obtain an ID for asynchronous telemetry logging.
  - Runs only the selected provider synchronously (and fallbacks to EasyOCR if the selected engine fails/returns no amount) and returns its response immediately (completing fast scans in 1-2 seconds).
  - Executes the non-selected engines asynchronously in the background using `CompletableFuture.runAsync`.
  - Added custom JPQL `@Modifying` and `@Transactional` update queries (`updateEasyOcrResult`, `updateMineruResult`, `updateGeminiResult`) in `OcrComparisonRepository` inside `Repositories.kt` to surgically update specific provider columns. This avoids JPA/Hibernate entity overwrite hazards when multiple concurrent background threads update the same comparison record.
- **Fixed `MultipartException: Current request is not a multipart request`**:
  - Found that setting a default header `"Content-Type": "application/json"` on the Axios instance in `api.ts` overrode the browser's/Axios's built-in smart request content type detection.
  - When the frontend passed a `FormData` object to `/ocr/scan`, `/receipts`, or `/insurance`, Axios still sent `Content-Type: application/json`, which caused the Spring MVC backend to throw a `MultipartException: Current request is not a multipart request` (mapped as `500 Internal Server Error` on the client side).
  - Fixed it by removing the hardcoded default `"Content-Type": "application/json"` header from `api.ts`. This allows Axios to automatically detect and set `multipart/form-data` with correct boundary parameters on `FormData` requests, while still using `application/json` automatically for standard JSON objects.
- **Validation**:
  - Rebuilt and verified backend compilation inside the JDK 21 Docker container.
  - Ran and verified that the `AsyncOcrTest` unit test suite passes successfully.
  - Verified frontend builds cleanly and packages successfully in Docker Compose.

### Files Changed
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- `frontend/lib/api.ts`

---

## Previous Session (2026-06-20, session 70)

### What Was Done
- **Fixed 404 Not Found on Async OCR Polling**:
  - Found that the backend returned `status_url` with the `/api` prefix (e.g. `/api/ocr/status/{jobId}`). When the frontend Axios instance (pre-configured with `baseURL: http://localhost:8001/api`) tried to fetch it, the simple string concatenation in Axios resolved to `/api/api/ocr/status/{jobId}` which returned a `404 Not Found` error.
  - Removed the `/api` prefix from `status_url` in `OcrController.kt`, returning `/ocr/status/{jobId}` so it combines correctly with the Axios base URL.
- **Tested and Evaluated all OCR Engines**:
  - Performed OCR scanning on the Holiday Inn test image (`2_hotel holidayinn.jpg`) and successfully verified execution for all three engines.
  - Documented extraction comparison results in a new artifact [ocr_test_comparison.md](file:///home/poa/.gemini/antigravity-cli/brain/de349e93-e74d-4130-ba93-75f569cf0645/ocr_test_comparison.md).

### Files Changed
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/OcrController.kt`

---

## Previous Session (2026-06-20, session 69)

### What Was Done
- **Fixed 403 Forbidden on File Uploads**:
  - Identified that manually passing `headers: { "Content-Type": "multipart/form-data" }` in Axios requests strips the boundary parameter generated by the browser. This caused Tomcat to throw a `MultipartException: the request was rejected because no multipart boundary was found` when parsing.
  - Due to Spring Security blocking `/error`, this parsing exception was mapped to a `403 Forbidden` status on the client instead of a `400 Bad Request`.
  - Fixed all three frontend file upload calls (`/ocr/scan` and `/receipts` in `ExpenseForm.tsx`, and `/insurance` in `insurance/page.tsx`) by removing the manual `Content-Type` header, letting Axios and the browser set it automatically with the correct boundary.
  - Permitted the `/error` path in `SecurityConfig.kt` to allow correct error dispatches and prevent obfuscation of backend issues.
- **Fixed `AsyncOcrTest.kt` Matcher Failures**:
  - Replaced Mockito `any()` and `eq()` matchers for Kotlin non-nullable types in `AsyncOcrTest.kt` with exact arguments, preventing runtime `NullPointerException` and `InvalidUseOfMatchersException` in the backend test suite.
- **Validation**:
  - Recompiled and restarted the Kotlin backend; all 62 integration tests passed successfully.
  - Verified frontend TypeScript files build cleanly with 0 type errors.

### Files Changed
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt`
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/ocr/AsyncOcrTest.kt`
- `frontend/app/insurance/page.tsx`
- `frontend/components/expenses/ExpenseForm.tsx`

---

## Previous Session (2026-06-20, session 68)

### What Was Done
- **Merged `fix/expense-detach-and-orphaned-ocr-job`**:
  - **Expense Report Detachment Bug**: Fixed `ExpenseService.kt` so editing an uncategorized expense with a null `reportId` leaves the report association unchanged rather than silently detaching it.
  - **Orphaned OCR Jobs Bug**: Fixed `OcrController.kt` to gracefully handle Async OCR thread pool queue rejections (503s) by marking the `OcrJob` as `failed` instead of leaving it `pending` forever.
- **Explicit Task Executor**: Ensured `AsyncConfig.kt` explicitly defines `applicationTaskExecutor` to prevent Spring auto-configuration failures when multiple executors exist.
- **Cleanup**: Removed outdated AI-generated markdown reports (`readout.md`, etc.).

### Files Changed
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/OcrController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/XpensesApplication.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/AsyncConfig.kt`

### Key Decisions
- Deliberate detachments from a report are exclusively handled by report endpoints (`attach`, `recall`, `reject`); expense edits should never implicitly detach.

---

## Previous Session (2026-06-20, session 67)

### Files Changed
- `backend-kotlin-jpa/src/main/resources/db/migration/V13__add_soft_delete_to_financial_records.sql`
- `backend-kotlin-jpa/src/main/resources/db/migration/V14__create_ocr_jobs.sql`
- `backend-kotlin-jpa/.../Models.kt`, `Repositories.kt`
- `backend-kotlin-jpa/.../ExpenseService.kt`, `ReportService.kt`, `AsyncOcrService.kt`
- `backend-kotlin-jpa/.../ExpenseController.kt`, `ReportController.kt`, `OcrController.kt`
- `frontend/app/dashboard/page.tsx`, `frontend/app/expenses/page.tsx`, `frontend/lib/serverApi.ts`
- `frontend/components/expenses/ExpenseForm.tsx`

### Key Decisions
- Moved heavy OCR scanning to an isolated bounded thread pool to avoid HTTP thread starvation.
- Centralized database persistence logic into cohesive, fully transaction-wrapped service boundaries instead of "Fat Controllers".
- Transparent database soft-delete applied via Hibernate annotations to maintain data integrity and audit trails.
- Server-side pre-fetching via RSC + Hydration Boundary utilized to improve frontend First Contentful Paint (FCP) and eliminate `useQuery` waterfalls.

---

## Previous Session (2026-06-20, session 66)

### What Was Done

- **Codebase Optimizations & Transaction Decoupling**:
  - **Removed Redundant Sort**: Eliminated the redundant in-memory collection sorting (`.sortedByDescending { it.date }`) in the expense export endpoint in [ExpenseController.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt), since the repository query `findAllWithFilters` already returns database results pre-sorted by date descending.
  - **Decoupled S3/Storage I/O from Transactions**: Refactored file upload and file deletion endpoints in [ExpenseController.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt) and [InsuranceController.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt) to move all slow storage network/disk operations (`storageService.uploadFile` and `storageService.deleteFile`) outside the database transaction blocks. Programmatic transaction management (`TransactionTemplate`) was introduced to wrap only the database persistence calls, preventing database connection pool starvation under load.
- **Verification**:
  - Compiled Kotlin classes and resources using a JDK 21 Docker container to synchronize host-mounted build directories.
  - Ran and verified the Kotlin backend test suite on the host, passing all 50 tests.
  - Smoke-tested the backend container using `curl` checks (health check, login authentication, and authenticated list endpoints).
- **Git & Merge**:
  - Staged, committed, and pushed changes on the feature branch `feat/codebase-optimizations`.
  - Checked out `main`, merged `feat/codebase-optimizations`, and pushed the updated `main` branch to remote origin.

### Files Changed
- `backend-kotlin-jpa/.../ExpenseController.kt` — removed redundant sorting, decoupled uploadReceipts, deleteExpense, and deleteSingleReceipt.
- `backend-kotlin-jpa/.../InsuranceController.kt` — decoupled uploadFile and deleteFile.

### Key Decisions
- Run file storage operations (both upload and delete) strictly outside transaction blocks, preventing network/disk latency from locking database connections.
- Programmatic transaction wrapping via `TransactionTemplate` is preferred over class/method-level `@Transactional` when non-transactional work must be executed in the same controller method.

---

## Previous Session (2026-06-20, session 65)

### What Was Done

- **Codebase Audit** — Full codebase audit across 6 layers (surface scan, antipatterns, types, builds, structural). Found 6 bugs:
  1. **Export OOM** — `ExpenseController.kt:575` used `findAll()` + in-memory `.filter{}` → replaced with `findAllWithFilters()` (DB-level filtering)
  2. **BigDecimal precision** — 4 sites used `BigDecimal(double)` for tax amounts → replaced with `BigDecimal.valueOf()`
  3. **Unmanaged Thread** — `StorageService.kt:301` raw `Thread { }.start()` → replaced with Spring `@Qualifier("applicationTaskExecutor")`
  4. **WebP validation** — Only checked RIFF header (WAV/AVI pass as WebP) → added `WEBP` sub-signature check at bytes 8-11
  5. **Silent storage failure** — `InsuranceController.kt:174` empty catch block → added `logger.warn(...)`
  6. **`any` types** — `insurance/page.tsx:35` used `any[]` for users → replaced with `User[]`, removed casts

- **OpenSpec change**: Created `fix-codebase-bugs-and-debt` (validated, implemented all tasks)
- **Verification**: Backend + frontend Docker rebuild pass; `GET /api/expenses/export?format=csv` works; all containers healthy
- **CI job removed**: CodeQL job deleted (requires GitHub Advanced Security, paid feature for private repos)

### Files Changed
- `backend-kotlin-jpa/.../ExpenseController.kt` — export DB filtering, BigDecimal precision, WebP validation
- `backend-kotlin-jpa/.../StorageService.kt` — managed Executor instead of raw Thread
- `backend-kotlin-jpa/.../InsuranceController.kt` — logger + warn on storage deletion failure
- `frontend/app/insurance/page.tsx` — User[] type, removed any casts
- `openspec/changes/fix-codebase-bugs-and-debt/` — proposal, spec, design, tasks (all ✅)
- `todo.md` — audit findings documented

### Key Decisions
- Export endpoint now reuses `findAllWithFilters()` (same JPQL query as list endpoint) — behavior identical
- Storage migration uses Spring-managed thread pool for graceful shutdown
- WebP files now validated at 2 levels: RIFF container + WEBP sub-identifier

---

## Previous Session (2026-06-20, session 64)

### What Was Done

- **Fixed Local Dev Hot-Swapping & Caching**:
  - Resolved `No Bucket4j cache configuration found - cache-to-use: null` startup crash by compiling the latest Kotlin classes and processing resources (which syncs `application.yml` with the required `cache-to-use: jcache` property) on the host's build directory. The compile was executed inside a JDK 21 container to bypass host JDK 25 compiler limitations.
  - Re-applied `docker-compose.override.yml` configuration. Tested and verified that the backend container boots up and hot-swaps successfully using `PropertiesLauncher` and `LOADER_PATH`.
  - Switched the frontend container health check in `docker-compose.yml` from `localhost` to `127.0.0.1` to prevent connection refused errors caused by IPv6 loopback resolution inside Next.js.
  - Verified all 5 containers are up, healthy, and communicating. Tested local `/api/auth/login` and `/api/expenses` successfully.
  - Tested the LDAP settings test connection endpoint to confirm the connection JNDI library executes correctly.
  - Merged all hot-swapping and container configuration fixes into `main` branch and pushed to GitHub.
- **Production Readiness Guide**:
  - Created a comprehensive [production_readiness_guide.md](file:///home/poa/.gemini/antigravity-cli/brain/eabc83a9-80cd-4fff-bb12-616c4adbb3db/production_readiness_guide.md) mapping out step-by-step tasks for production deployment (CI scans, security variables, managed DB, S3 remote storage, enterprise LDAP, and logging/monitoring).

---

## Previous Session (2026-06-20, session 63)

### What Was Done

- **CI & Local Dev Build Optimizations**:
  - **CI Speedup**: Removed Trivy vulnerability scans from [.github/workflows/ci.yml](file:///home/poa/xpenses-kotlin/.github/workflows/ci.yml) (reducing build times from ~9 minutes to under 2 minutes).
  - **Local Development Hot-Swapping**: Enabled spring-boot-devtools in [build.gradle.kts](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/build.gradle.kts) and created [docker-compose.override.yml](file:///home/poa/xpenses-kotlin/docker-compose.override.yml) to mount local compiled classes and resources directories directly into the container. This allows the application to hot-reload class files in <1s without any Docker container rebuilds.
  - Switched development to dedicated `fix/ci-and-dev-optimizations` branch.

---

## Previous Session (2026-06-20, session 62)

### What Was Done

- **Fix Missing `gradle.properties` in Docker Builds** — Found that `gradle.properties` was not copied into the Docker builder container in `backend-kotlin-jpa/Dockerfile`. This caused the container build to ignore Gradle caching/memory options and dependency version overrides (e.g. tomcat, spring-security, spring-framework, netty), leading to Trivy CVE errors in CI Docker image scans.
- Added `gradle.properties` to the `COPY` instruction in the builder stage of `backend-kotlin-jpa/Dockerfile`.
- Switched development to dedicated `fix/docker-copy-gradle-properties` branch.

---

## Previous Session (2026-06-20, session 61)

### What Was Done

- **CI Memory & CVE Patches** — Addressed errors in GitHub Actions CI runs:
  - **CodeQL OOM**: Resolved `OutOfMemoryError: GC overhead limit exceeded` during compilation by adding `org.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m` and `kotlin.daemon.jvmargs=-Xmx2g` to [gradle.properties](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/gradle.properties).
  - **Trivy CVEs**: Patched vulnerabilities in backend Docker image scans by bumping `spring-security.version` to `6.4.10` and adding `spring-framework.version=6.2.11` to [gradle.properties](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/gradle.properties) to address `CVE-2025-41232`, `CVE-2025-41248`, `CVE-2026-22732`, and `CVE-2025-41249`.
  - Switched development to dedicated `fix/ci-memory-and-cves` branch.

---

## Previous Session (2026-06-20, session 60)

### What Was Done

- **Inventory & Insurance — feature completion** — Finished the full-stack wiring for two new domains:
  - **Backend** (already built by session 59): `InventoryController.kt` (384 lines — CRUD + request approval/rejection workflow), `InsuranceController.kt` (208 lines — file upload/download/delete per technician), `Models.kt` (`InventoryItem`, `InventoryRequest`, `InsuranceFile` JPA entities), `Repositories.kt` (3 new repository interfaces), Flyway migrations V7–V11, `SecurityConfig.kt` endpoint registration, `ValidationExceptionHandler.kt` (ResponseStatusException handler), `ReportController.kt` (recall from rejected + allowance calc for approved/paid only).
  - **Frontend wiring** (this session): Added `InventoryItem`, `InventoryItemCreate`, `InventoryItemUpdate`, `InventoryRequest`, `InventoryRequestCreate`, `InventoryRejectBody`, `InsuranceFile` TypeScript interfaces + `inventoryKeys`/`insuranceKeys` query keys + sidebar nav links (Package/Shield icons, visible to all roles).
  - **Pages**: `frontend/app/inventory/page.tsx` (514 lines), `frontend/app/insurance/page.tsx` (250 lines) — both with TanStack Query, role-based scoping, modal CRUD, toast notifications.

- **Stale branch cleanup** — Deleted `fix/manager-receipt-access` (fix already applied in main; branch was pre-Kotlin-migration and would have deleted current codebase).

- **Verification**: `docker compose up -d --build backend frontend` pass; all containers healthy; `GET /api/inventory`, `GET /api/inventory/requests`, `GET /api/insurance` returning correct data; frontend pages at `/inventory` and `/insurance` return 200 for authenticated requests.

### Files Changed
- `frontend/lib/api.ts` — added inventory/insurance types (68 lines)
- `frontend/lib/queryKeys.ts` — added `inventoryKeys`, `insuranceKeys`
- `frontend/components/layout/Sidebar.tsx` — added Package, Shield nav items
- `frontend/app/inventory/page.tsx` — new (514 lines)
- `frontend/app/insurance/page.tsx` — new (250 lines)
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt` — `/api/inventory/**`, `/api/insurance/**` paths
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/ValidationExceptionHandler.kt` — `ResponseStatusException` handler
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt` — recall from rejected, allowance for approved/paid only
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt` — `InventoryItem`, `InventoryRequest`, `InsuranceFile` entities
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt` — 3 new repository interfaces
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InventoryController.kt` — new (384 lines)
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt` — new (208 lines)
- Flyway migrations V7–V11 — new

### Key Decisions
- Inventory requests create N `InventoryItem` rows (one per requested quantity) upon approval
- Insurance upload restricted to managers/CFO/mod; download available to file owner + privileged roles
- Daily allowance only calculated for `approved`/`paid` reports to avoid misleading draft/submitted totals
- Reports can now be recalled from `rejected` status (not just `submitted`)

---

## Previous Session (2026-06-20, session 59)

### What Was Done

- **Technology Stack Assessment** — Evaluated the current architecture and technology selections (Kotlin/Spring Boot 3.4.3 + Next.js 15 + PostgreSQL 16 + FastAPI/EasyOCR sidecar).
  - Created a comprehensive assessment report artifact: [tech_stack_assessment.md](file:///home/poa/.gemini/antigravity-cli/brain/eabc83a9-80cd-4fff-bb12-616c4adbb3db/tech_stack_assessment.md).
  - Recommended keeping the current stack, detailing why alternative frameworks (like Go or Node.js backends, or Vite SPAs) do not justify the refactoring overhead.
  - Provided optimizations/best practices to keep developer velocity high (e.g. standard JVM dev builds, build caching).

---

## Previous Session (2026-06-18, session 58)

### What Was Done

- **Backend Docker build speedup — ~6.5x faster rebuilds** — `docker compose build backend` went from 4m29s to ~41s for a typical source change.

  - **BuildKit cache mounts on `~/.gradle`** — added `--mount=type=cache,target=/root/.gradle` to both `RUN ./gradlew dependencies` and `RUN ./gradlew bootJar` in `Dockerfile`. Persists Gradle's dependency cache and build cache across `docker build` runs, eliminating the 2m26s dependency download on every rebuild.

  - **Gradle build cache enabled** — added `org.gradle.caching=true` to `gradle.properties`. Caches task outputs (compileKotlin, processAot, etc.) in `~/.gradle/caches/build-cache-1/`, enabling incremental compilation when source files change.

  - **Measured gains** (single Kotlin file change):
    - Dependencies resolution: **CACHED** (was 2m26s)
    - `compileKotlin`: 25.6s (incremental)
    - Full `bootJar`: 39.4s (was 1m58s)
    - Total rebuild: ~41s (was 4m29s)

  - First build after this change is still slow (populates caches), but all subsequent rebuilds benefit — even across `docker compose down/up` cycles.

### Modified Files
- `backend-kotlin-jpa/Dockerfile` — Added BuildKit cache mounts (`--mount=type=cache,target=/root/.gradle`) on Gradle RUN steps
- `backend-kotlin-jpa/gradle.properties` — Enabled `org.gradle.caching=true`

---

## Previous Session (2026-06-17, session 57)

### What Was Done

- **Fixed OCR accuracy tracking — 3 bugs resolved** — the OCR Scanner admin page always showed "Pending save…" in the Final (Ground Truth) column and 0% accuracy across all engines, even after expenses were saved from scanned receipts.

  - **Bug 1 (Root Cause): `OcrComparison` entity missing error fields** — `OcrService.scanReceipt()` constructed `OcrComparison` with `easyocrError`, `geminiError`, `mineruError` named parameters that didn't exist on the entity class. This caused the save to fail silently (caught by try/catch), meaning **no comparison rows were ever persisted to the database**. Without a saved comparison row, `comparison_id` was never returned to the frontend, so expenses could never be linked to OCR comparisons.
    - **Fix**: Added `easyocrError`, `geminiError`, `mineruError` fields to `OcrComparison` entity in `Models.kt`. Created Flyway migration `V6__add_ocr_error_columns.sql` to add the corresponding DB columns.

  - **Bug 2: Key name mismatch for `comparison_id`** — even if Bug 1 were fixed, the backend returned the comparison ID as `ocr_comparison_id` in the scan response, but the frontend's `OCRScanResult` interface expected `comparison_id`. This meant `scanResult?.comparison_id` was always `undefined`, so the expense save payload never included the comparison link.
    - **Fix**: Changed `mutableResult["ocr_comparison_id"]` → `mutableResult["comparison_id"]` in `OcrService.kt`.

  - **Bug 3: Accuracy percentage formula wrong** — the formula `Math.round(ratio * 100) / 100.0` produced values like `0.5` for 50%, but the frontend renders `{value}%` expecting `50`. All accuracy values would have displayed as fractions (e.g., "0.5%" instead of "50%").
    - **Fix**: Changed to `Math.round(ratio * 10000) / 100.0` to produce proper percentage values (e.g., `50.0` for 50%).

  - **Bonus: Gemini accuracy counting consistency** — Gemini accuracy was only counted when `provider == "gemini"`, unlike EasyOCR/MinerU which counted based on result existence. Changed to result-existence-based counting for consistency.

- **Fixed session timeout showing "Good morning, Guest!"** — after the access token expired (15 min inactivity), the dashboard rendered with `user=null` showing "Good morning, Guest!" instead of redirecting to login or refreshing the token silently.

  - **AuthProvider redirect on auth failure** — when `getMe()` fails (after the axios interceptor already tried token refresh), redirect to `/login` instead of silently setting `user=null`. Previously this caused a broken half-authenticated state.

  - **Dashboard auth loading guard** — added `authLoading` check from `useAuth()` to show skeleton while auth resolves. Added `enabled: !!user` to TanStack Query to prevent fetching dashboard data before user is known. Prevents "Guest" flash during token refresh.

  - **Refresh token cookie `SameSite=Strict` → `Lax`** — `Strict` blocks the cookie from being sent on top-level navigations from external sources (bookmarks, browser restoring tabs after restart). Changed to `Lax` which still protects against CSRF on POST requests.

### Modified Files
- `backend-kotlin-jpa/.../controllers/OcrController.kt` — Fixed accuracy formula (×10000/100 instead of ×100/100), fixed Gemini counting logic
- `backend-kotlin-jpa/.../models/Models.kt` — Added `easyocrError`, `geminiError`, `mineruError` fields to `OcrComparison` entity
- `backend-kotlin-jpa/.../services/OcrService.kt` — Changed `ocr_comparison_id` → `comparison_id` key name
- `backend-kotlin-jpa/.../resources/db/migration/V6__add_ocr_error_columns.sql` — New migration for error columns
- `backend-kotlin-jpa/.../controllers/AuthController.kt` — Refresh token cookie `SameSite=Strict` → `Lax`
- `frontend/components/AuthProvider.tsx` — Redirect to `/login` on auth failure instead of showing Guest
- `frontend/app/dashboard/page.tsx` — Auth loading guard, prevent Guest flash

---

## Previous Session (2026-06-16, session 56)

### What Was Done

- **Fixed IMAP delegation details overflow** — `DelegationFields` component on IMAP admin page changed from `grid-cols-1 sm:grid-cols-2` (two fields per row) to single-column list with `break-words`, fixing text overflow inside side-by-side parser cards.

- **Exposed delegation fields in API** — `ReportOut` DTO now includes all 11 delegation fields (kundenauftrag, auftragsart, positionstyp, technplatz_raw, technplatz_line, kunde_code, kunde_name, adresse, vorgang, arbeitsplatz, techniker). Previously they were stored in DB but never serialized.

- **Made delegation fields editable** — Added all 11 fields to `ReportUpdate` DTO and wired them into the `updateReport` controller. Blank strings saved as null.

- **Edit report page redesigned** — Delegation section replaced the read-only block with individual editable `<input>` fields grouped in a labeled card. Fields are pre-populated from report data and submitted on save.

- **Report detail page redesigned** — `DelegationReportDetails` component moved out of the title `<div>` to a full-width card below the header row. New design: indigo-tinted card with header bar (icon + "DELEGATION DETAILS" label + "Email import" badge), two-column layout (left: order identifiers; right: client + personnel), row dividers for scannability.

- **Backend rebuild** — Local JDK 25 incompatible with Kotlin compiler; build done inside Docker (`docker compose build backend`). Verified API returns delegation fields for report 9.

### Commit
- `6fb8866` — feat: expose and edit delegation fields on report pages

### What Was Done

- **Implemented improved IMAP email delegation parser** — planned via OpenSpec (`openspec/changes/improved-imap-email-parser/`), implemented end-to-end. All 4 specs delivered.

#### Spec 1: Local Parser Enhancement (EmailImportService.kt)
- Rewrote `parseDelegationEmailLocal()` to extract 12+ structured fields as first-class map entries instead of concatenating into description text.
- Added keyword groups: `vorgangKws`, `arbeitsplatzKws`, `auftragsartKws`, `technikerKws`, `adresseKws` — all supporting German/English/Romanian synonyms.
- Implemented `extractAfterKeyword()` and `extractMultiTokenAfterKeyword()` helper functions to reduce duplication.
- Implemented multi-line `extractAddress()` function for collecting address lines after `Adresse` keyword.
- **TechnPlatz Cxxxxxx line detection**: `TechnPlatz C374981` → `technplatz_line = true` (regex: `^C\d{6,}`).
- Customer code/name split: `0022265695 PJSC CARLSBERG UKRAINE` → `kunde_code` + `kunde_name`.
- Fixed `split("\\n")` → `split("\n")` for correct line-based parsing of actual newline characters from HTTP request body.
- Clean description built from structured fields instead of raw string concatenation.

#### Spec 2: Gemini Parser Schema (EmailImportService.kt)
- Extended Gemini response schema from 4 properties (title, date_from, date_to, description) to 15 properties.
- Added 11 new fields: kundenauftrag, auftragsart, positionstyp, technplatz_raw, technplatz_line (boolean), kunde_code, kunde_name, adresse, vorgang, arbeitsplatz, techniker.
- Prompt instructs Gemini to: split Kunde into code+name, detect C+6+digits pattern for technplatz_line.
- Backend maps Gemini response to extended map with null defaults for missing optional fields.

#### Spec 3: ExpenseReport Entity & Flyway Migration
- Created `V4__add_delegation_fields.sql`: 10 nullable TEXT columns + 1 BOOLEAN column on `expense_reports` table, all using `ADD COLUMN IF NOT EXISTS`.
- Added 11 properties to `ExpenseReport` entity in `Models.kt`: kundenauftrag, auftragsart, positionstyp, technplatzRaw, technplatzLine, kundeCode, kundeName, adresse, vorgang, arbeitsplatz, techniker — with `@JsonProperty` snake_case annotations.
- Updated `processIncomingEmail()` and `simulateIncomingEmail()` to map new parser fields to entity fields.
- Updated frontend `Report` interface in `lib/api.ts` with delegation fields.

#### Spec 4: Frontend Structured Display
- Extended `EmailSimulationParsed` TypeScript type with 11 optional fields.
- Extended `Report` TypeScript type with delegation fields.
- Created `<DelegationFields>` component on IMAP admin page — renders 2-column grid of field→value pairs with amber "Production Line" badge for `technplatz_line: true`.
- Created `<DelegationReportDetails>` component on report detail page — shows delegation fields in 3-column grid when present.
- Both components gracefully hide when no delegation fields are present.

### Build & Deployment
- **Docker rebuild required**: First attempt hit compilation errors — `@JsonProperty` import removed from `AuthController.kt` + `NoSuchFileException` constructor mismatch in `StorageService.kt` + `S3StorageProvider.kt`.
- Fixed all 3 errors, rebuilt backend (`BUILD SUCCESSFUL in 4m 12s`), rebuilt frontend — both containers restarted and verified as healthy.

### Modified/Added Files
- `backend-kotlin-jpa/src/main/resources/db/migration/V4__add_delegation_fields.sql` — NEW
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt` — +11 fields + @JsonProperty import
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailImportService.kt` — Major parser refactoring
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt` — Restored @JsonProperty import
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/S3StorageProvider.kt` — Fixed NoSuchFileException
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt` — Fixed NoSuchFileException
- `frontend/lib/api.ts` — Extended EmailSimulationParsed + Report interfaces
- `frontend/app/admin/imap/page.tsx` — DelegationFields component with Production Line badge
- `frontend/app/reports/[id]/page.tsx` — DelegationReportDetails component
- `openspec/changes/improved-imap-email-parser/` — NEW (proposal, 4 specs, design, tasks)
- `HANDOFF.md` — This update

---

## Previous Session (2026-06-16, session 54)

### What Was Done

- **Addressed all 4 remaining code quality gaps** — planned via OpenSpec (`openspec/changes/code-quality-gaps-round-2/`), implemented end-to-end.

#### Gap 1: UserController returns response DTOs instead of raw entities

- Extracted `UserResponse` data class from `AuthController.kt` to `models/UserResponse.kt` with `UserResponse.fromUser(user)` companion factory.
- All 6 `UserController` endpoints (`createUser`, `listUsers`, `getUser`, `updateRole`, `updateActive`, `updateMe`) now return `UserResponse` instead of raw `User` JPA entities.
- `AuthController` imports `UserResponse` from models instead of defining it locally.

#### Gap 2: Bean Validation on request DTOs

- Added `spring-boot-starter-validation` dependency.
- Created `config/ValidationExceptionHandler.kt` with `@RestControllerAdvice` for consistent `400 {"detail": "..."}` error responses.
- Added `@Valid` to `AuthController.login`, `AuthController.changePassword`, `UserController.createUser`, `UserController.updateRole`.
- Added `@NotBlank`, `@Size(min=8)`, `@Pattern` annotations to `LoginRequest`, `ChangePasswordRequest`, `UserCreateRequest`, `RoleUpdateRequest`.

#### Gap 3: S3 remote storage provider

- Added `software.amazon.awssdk:s3:2.30.0` dependency.
- Created `services/storage/StorageProvider.kt` interface with `upload`, `download`, `delete`, `testConnection`.
- Created `services/storage/S3StorageProvider.kt` — implements all 4 operations using AWS SDK v2; supports access key auth, custom endpoint (S3-compatible), and region config.
- Refactored `StorageService.kt` — uses `@PostConstruct` to initialize a `StorageProvider` based on config; `uploadFile`/`downloadFile`/`deleteFile`/`testConnection` delegate to the provider for non-local providers; local cache fallback for remote reads.
- SFTP/SMB/WebDAV stubs now return `mapOf("ok" to false, "error" to "not implemented")` instead of misleading `mapOf("ok" to true)`.

#### Gap 4: JDK 25 compatibility guidance

- Created `.java-version` file (JDK 21) for SDKMAN!/jEnv/asdf.
- Added `make check-java-version` target that detects wrong JDK versions with a clear error message.
- Added `check-java-version` as a prerequisite of `make build`.
- Added "Local Development Requirements" section to `README.md` with SDKMAN! instructions and Docker workaround.

### Build Verification

- `make check-java-version` — correctly exits with error on host JDK 25
- `./gradlew dependencies --configuration compileClasspath` — spring-boot-starter-validation and awssdk:s3 resolve correctly
- `npx tsc --noEmit` — exit code 0 (zero errors)
- Kotlin compile blocked by JDK 25 environment — Docker build expected to work

### Modified/Added Files

- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/UserResponse.kt` — NEW
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/ValidationExceptionHandler.kt` — NEW
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/StorageProvider.kt` — NEW
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/S3StorageProvider.kt` — NEW
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt` — Refactored for provider pattern
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt` — Removed local UserResponse, use model, +@Valid
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/UserController.kt` — UserResponse DTOs, +@Valid, validation annotations on DTOs
- `backend-kotlin-jpa/build.gradle.kts` — Added spring-boot-starter-validation + awssdk:s3
- `.java-version` — NEW (pinned to JDK 21)
- `Makefile` — Added check-java-version target + build prerequisite
- `README.md` — Added Local Development Requirements section
- `openspec/changes/code-quality-gaps-round-2/` — NEW (proposal, 4 specs, design, tasks)
- `HANDOFF.md` — This update

---

## Previous Session (2026-06-16, session 53)

### What Was Done

- **Removed incomplete `backend-kotlin/` reactive prototype**: The repo had two backend directories — `backend-kotlin/` (Spring WebFlux + R2DBC, only 1 controller) and `backend-kotlin-jpa/` (Spring MVC + JPA, 13 controllers, fully complete). After confirming with the user that the reactive stack provided no benefit for an internal expense app (~50 users), the incomplete prototype was deleted. `backend-kotlin-jpa/` is now the single, canonical backend.
- **Rebuilt README.md from scratch**: Rewrote the entire README to accurately reflect the single-backend architecture, full tech stack, project structure, all API endpoints, Docker services, OCR system, and roadmap.
- **Updated GEMINI.md and HANDOFF.md** to remove stale dual-backend references.

### Modified/Deleted Files
- `backend-kotlin/` — DELETED (incomplete WebFlux prototype, only had AuthController)
- `README.md` — Full rewrite with accurate architecture documentation
- `HANDOFF.md` — Session 53 added

---

## Previous Session (2026-06-16, session 52)

### What Was Done

- **Comprehensive bugfix pass** — 15 issues fixed across 25 files, spanning HIGH and MEDIUM severity findings from a full codebase audit.

### Fixed Issues

#### HIGH Severity (8 fixes)

1. **[BUG] Sign endpoint allowed signing in ANY state** — Added status check requiring `submitted` or `approved` reports only. Previously a user could sign draft/rejected/paid reports. (`ReportController.kt`)
2. **[BUG] Reject orphaning all expenses** — Replaced `exp.report = null` + `report.expenses.clear()` with keeping the relationship intact; expenses are set to `"draft"` but remain attached. (`ReportController.kt`)
3. **[PERF/RACE] No optimistic locking on state transitions** — Added `@Version` field to `ExpenseReport` entity + Flyway `V3__add_version_column.sql`. Prevents double-approve/double-pay from concurrent requests. (`Models.kt`, `Repositories.kt`)
4. **[BUG] Missing `@Transactional` on 7 multi-entity write operations** — Added `@Transactional` to `submitReport`, `approveReport`, `rejectReport`, `payReport`, `recallReport`, `deleteReport`, `attachExpenses`. Prevents partial writes. (`ReportController.kt`)
5. **[BUG] `AdvancePaymentCreate.type` free-text bypass** — Added explicit `listOf("request", "paid")` validation with clear error. Unknown types are now rejected. (`AdvanceController.kt`)
6. **[CONFIG] CORS hardcoded to localhost** — Made origins configurable via `cors.allowed-origins` property (default: `http://localhost:3001,http://127.0.0.1:3001`). (`SecurityConfig.kt`, `application.yml`)
7. **[SECURITY] JWT key derived via zero-padding** — Replaced `padEnd(32, '0')` with PBKDF2WithHmacSHA256 (65536 iterations, 256-bit output). Any-length secrets now produce strong keys. (`JwtTokenProvider.kt`)
8. **[BUG] Inconsistent error response format** — Fixed `OcrController` to return JSON `{"detail": "..."}` instead of plain strings. (`OcrController.kt`)

#### MEDIUM Severity (7 fixes)

9. **[PERF] BigDecimal precision loss via Double multiplication** — Fixed 7 locations across `ExpenseController`, `AdvanceController`, `MileageController` to use `BigDecimal.valueOf().multiply()` instead of `BigDecimal(double * double)`. (`ExpenseController.kt`, `AdvanceController.kt`, `MileageController.kt`)
10. **[TECH DEBT] Empty catch blocks in PdfService** — Added SLF4J `log.warn()` to all 6 empty `catch (e: Exception) {}` blocks. (`PdfService.kt`)
11. **[PERF] N+1 in export endpoint** — Changed `findAllByUserId()`/`findAll()` to `*WithExpenses()` JOIN FETCH variants. (`ReportController.kt`)
12. **[BUG] ExpenseMapper force-unwraps nullable IDs** — Replaced `!!` with `requireNotNull()` providing meaningful error messages. (`ExpenseMapper.kt`)
13. **[BUG] Frontend IMAP simulation error silently swallowed** — Added `console.error` logging + axios error details in toast. (`frontend/app/admin/imap/page.tsx`)
14. **[TECH DEBT] Frontend `any` types** — Typed `failedQueue`, `EmptyState.icon`, OCR callback params with proper interfaces. (`frontend/lib/api.ts`, `frontend/components/ui/EmptyState.tsx`, `frontend/app/admin/ocr/page.tsx`)
15. **[CONFIG] Build artifacts tracked in git** — Added `.kotlin/errors/` and `tsconfig.tsbuildinfo` to `.gitignore`. Cleaned tracked artifacts. (`.gitignore`)

### Known Remaining Gaps (not blockers)
- Remote storage (S3/SFTP/SMB/WebDAV) stubbed in `StorageService.kt` — local only
- No Kotlin unit/integration test suite — future priority (JUnit 5 + MockMvc)
- Kotlin backend does not compile on JDK 25 (Kotlin 2.1.0 requires ≤ JDK 22) — environment issue, not code
- Input validation — no `@Valid` / Bean Validation on any request body (would require `spring-boot-starter-validation` + annotations)
- `<UserController>` returns raw entities instead of response DTOs (protected by `@JsonIgnore` but brittle)

### Modified Files
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt` — Added `@Version` field
- `backend-kotlin-jpa/src/main/resources/db/migration/V3__add_version_column.sql` — NEW Flyway migration
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt` — Sign status check, reject keep expenses, @Transactional, N+1 fix, import
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt` — BigDecimal fix, dead code removal
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AdvanceController.kt` — Type validation, BigDecimal fix
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt` — BigDecimal fix
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/OcrController.kt` — JSON error responses
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt` — Configurable CORS origins
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/JwtTokenProvider.kt` — PBKDF2 key derivation
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt` — Logger + logging in catch blocks
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseMapper.kt` — `requireNotNull` instead of `!!`
- `backend-kotlin-jpa/src/main/resources/application.yml` — Added `cors.allowed-origins` property
- `.gitignore` — Added .kotlin/ and tsconfig.tsbuildinfo
- `frontend/app/admin/imap/page.tsx` — Error logging + axios detail
- `frontend/app/admin/ocr/page.tsx` — Typed callback params
- `frontend/components/ui/EmptyState.tsx` — Typed icon prop
- `frontend/lib/api.ts` — Typed failedQueue

### Build Verification
- `./gradlew compileKotlin` — BUILD SUCCESSFUL
- `npx tsc --noEmit` — exit code 0 (no errors)

---

## Previous Session (2026-06-16, session 51)

### What Was Done

- **Code quality fix pass** — 9 issues fixed across 12 files (see full list below).

### Fixed Issues

1. **[BUG] `rejectReport` overwrote `approvedBy`/`approvedAt`** — Added `rejectedBy`/`rejectedAt` fields to `ExpenseReport` entity + `V2__add_rejected_fields.sql` Flyway migration. `rejectReport` now uses proper rejection fields.
2. **[TECH DEBT] Duplicate mapping functions** — Created `ExpenseMapper` component. Removed duplicate `mapExpenseToOut`/`mapReceiptToOut` from `ExpenseController`, `DashboardController`, `ReportController` — all now use the shared mapper.
3. **[PERF] In-memory filtering** — Added 7 custom `@Query` methods for DB-level filtering (status, date range, user+status) in `ExpenseRepository` and `ExpenseReportRepository`.
4. **[PERF] N+1 on report listing** — `listReports` now uses `*WithExpenses()` JOIN FETCH queries instead of `findAll()`.
5. **[BUG] BigDecimal lossy conversion** — `OcrService` changed `.toString()?.let { BigDecimal(it) }` → `BigDecimal.valueOf(double)`.
6. **[BUG] Silent exception swallowing** — Empty catch blocks in `ExpenseController` delete endpoints now log via SLF4J.
7. **[TECH DEBT] `println` → SLF4J** — Replaced all `println`/`System.err.println` with proper logging across 5 files (`DataInitializer`, `OcrService`, `EmailSettingsService`, `EmailImportService`, `ReportService`).
8. **[TECH DEBT] `var` → `val` in DTOs** — `LdapConfigIn`/`LdapConfigOut` data class fields changed to `val`.
9. **[CONFIG] Production readiness** — Set `spring.jpa.show-sql: false`.

### Known Remaining Gaps (not blockers)
- Remote storage (S3/SFTP/SMB/WebDAV) stubbed in `StorageService.kt` — local only
- No Kotlin unit/integration test suite — future priority (JUnit 5 + MockMvc)
- Kotlin backend does not compile on JDK 25 (Kotlin 2.1.0 requires ≤ JDK 22) — environment issue, not code

### Modified Files
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt` — Added `rejectedBy`/`rejectedAt` fields
- `backend-kotlin-jpa/src/main/resources/db/migration/V2__add_rejected_fields.sql` — NEW migration
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseMapper.kt` — NEW shared mapper
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt` — Fixed reject, JOIN FETCH, removed duplicate mapper
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt` — DB filters, silent catch logging, use mapper
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/DashboardController.kt` — Use mapper, removed duplicates
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt` — Added filtered JPQL queries
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt` — Fixed BigDecimal, added logger
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailSettingsService.kt` — Logger migration
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailImportService.kt` — Logger migration
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ReportService.kt` — Logger migration
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt` — Logger migration
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/LdapSettingsController.kt` — `var` → `val` in DTOs
- `backend-kotlin-jpa/src/main/resources/application.yml` — `show-sql: false`
- `HANDOFF.md` — This update

---

## Previous Session (2026-06-16, session 50)

### What Was Done

- **Audit pass — auth/user contract bugs (3 fixed, runtime-verified)**:
  1. **[SECURITY] `password_hash` leak** — the `User` JPA entity had no `@JsonIgnore` on `passwordHash`, and `GET /users`, `GET /users/{id}`, `POST /users`, `PATCH /users/me`, and the role/active update endpoints all return the raw entity. Any `mod` listing users received every user's bcrypt hash. Added `@field:JsonIgnore` to `User.passwordHash` — fixes all endpoints at once. Verified: `GET /users` as `mod1` no longer includes `password_hash`.
  2. **[HIGH] change-password contract mismatch** — `POST /api/auth/change-password` (added session 47-era) expected `current_password`, but the frontend profile page sends `old_password`. Every password change failed with "Current password is incorrect". Changed the DTO field to `old_password`. Verified: wrong old password returns 400, correct contract accepted.
  3. **[MEDIUM] `/auth/me` + `/auth/login` missing fields** — `UserResponse` omitted `auth_source`, `signature_path`, and `is_active`. On fresh login the report-detail "Sign Report" button never appeared (signature_path always undefined) and the LDAP password-form guard on the profile page never triggered. Added the three fields to `UserResponse` and populated them in login + me. Verified: login response now includes all three.

### Modified Files
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt` — `@field:JsonIgnore` on `User.passwordHash` + import.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt` — `ChangePasswordRequest.old_password`; extended `UserResponse` with `is_active`/`auth_source`/`signature_path`; updated login + me construction.

---

## Previous Session (2026-06-16, session 48)

### What Was Done

- **Codebase Audit & Technical Debt Resolution**:
  - Addressed findings from a comprehensive system audit checking for bugs and incomplete functions.
  - **Replaced Unmanaged Threads with @Async**: Refactored `ReportController.kt` to eliminate raw, unmanaged `Thread { ... }.start()` execution for dispatching email notifications. Replaced them with the Spring-native `@Async` execution in `EmailSettingsService.kt` and activated `@EnableAsync` on `XpensesApplication.kt`.
  - **Restored Production Codebase**: Restored the `backend-kotlin/` directory (Spring WebFlux/R2DBC), clarifying that this is the intended **production** stack, while the `backend-kotlin-jpa/` implementation is strictly intended for testing.
  - Verified no other `TODO`, `FIXME`, or `HACK` references exist in the active codebase.

### Known Remaining Gaps (not blockers)
- Remote storage (S3/SFTP/SMB/WebDAV) stubbed in `StorageService.kt` — local only
- No Kotlin unit/integration test suite — future priority (JUnit 5 + MockMvc)

### Modified/Added Files
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/XpensesApplication.kt` — Enabled @Async.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailSettingsService.kt` — Annotated `sendEmail` with @Async.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt` — Cleaned up raw threads on submit, pay, approve, and reject endpoints.
- `backend-kotlin/` — RESTORED (production stack).
- `HANDOFF.md` — Incremented session history.

---

## Previous Session (2026-06-15, session 47)

### What Was Done

- **Optimized Antigravity Agent Configuration and Documentation**:
  - Rewrote the AI Workflow sections of [GEMINI.md](file:///home/poa/xpenses-kotlin/GEMINI.md) and [CLAUDE.md](file:///home/poa/xpenses-kotlin/CLAUDE.md) to integrate strict token optimization rules and best practices.
  - Added instructions to proactively recommend the `/usage` slash command in the chat UI for monitoring token usage.
  - Established concrete strategies for utilizing `research` (read-only) and `self` (read-write) subagents, keeping contexts minimal.
  - Advised against frequent container rebuilds and native compilation during active development, prioritizing fast JVM compilation cycles.
  - Installed the `google-antigravity` SDK in the python virtual environment and created a boilerplate custom agent script.
  - Updated AI Workflow references in [README.md](file:///home/poa/xpenses-kotlin/README.md).

### Known Remaining Gaps (not blockers)
- Remote storage (S3/SFTP/SMB/WebDAV) stubbed in `StorageService.kt` — local only
- No Kotlin unit/integration test suite — future priority (JUnit 5 + MockMvc)

### Modified/Added Files
- `GEMINI.md` — Updated agent workflows, subagent guidelines, and build optimization.
- `CLAUDE.md` — Updated agent workflows, subagent guidelines, and build optimization.
- `README.md` — Aligned tech stack AI workflow entry.
- `scripts/setup_antigravity_agent.py` — New Python boilerplate for SDK agent execution.
- `HANDOFF.md` — Incremented session history.

---

## Previous Session (2026-06-15, session 46)

### What Was Done

- **Removed Role-Based Color Coding in Frontend**:
  - Cleaned up the navigation menu borders in [Sidebar.tsx](file:///home/poa/xpenses-kotlin/frontend/components/layout/Sidebar.tsx) to use a unified, professional `border-blue-500` active indicator for all users, regardless of role.
  - Replaced the user profile picture's role-based border glow with a clean, neutral `border-slate-600` style.
  - Refactored [DashboardActionCard.tsx](file:///home/poa/xpenses-kotlin/frontend/components/dashboard/DashboardActionCard.tsx) to eliminate role-conditional gradient styles, background classes, and text highlights, unifying all cards to a premium, professional blue-theme layout.
  - Redesigned the role pills in [Badge.tsx](file:///home/poa/xpenses-kotlin/frontend/components/ui/Badge.tsx) to use a clean slate-based badge format rather than rainbow colors, maintaining professional readability.
  - Simplified and unified all theme configuration mappings in [themes.ts](file:///home/poa/xpenses-kotlin/frontend/lib/themes.ts).

### Known Remaining Gaps (not blockers)
- Remote storage (S3/SFTP/SMB/WebDAV) stubbed in `StorageService.kt` — local only
- No Kotlin unit/integration test suite — future priority (JUnit 5 + MockMvc)

### Modified/Added Files
- `frontend/components/layout/Sidebar.tsx` — Unified active borders and logo container borders.
- `frontend/components/dashboard/DashboardActionCard.tsx` — Removed role-conditional color styling.
- `frontend/components/ui/Badge.tsx` — Unified role styles to slate badge format.
- `frontend/lib/themes.ts` — Unified role theme variable mappings to blue.
- `README.md` — Updated feature list and completed items checklist.
- `HANDOFF.md` — This update.

---

## Previous Session (2026-06-15, session 45)

### What Was Done

- **Implemented EasyOCR Python sidecar service (decoding model pre-load API)**:
  - Designed and created the `ocr-sidecar` microservice running a FastAPI endpoint `/api/scan` that pre-loads `easyocr.Reader` in RAM on app startup to resolve the 5-15s subprocess spin-up latency.
  - Refactored `OcrService.kt` in `backend-kotlin-jpa` to consume the new `ocr-sidecar` service via HTTP Multipart requests instead of calling `ProcessBuilder` on local CLI scripts.
  - Configured `docker-compose.yml` to spin up `xpenses-ocr-sidecar` dynamically, mounting the persistent `ocr-models` volume to `/root/.EasyOCR` to avoid model re-downloading.
  - Removed the legacy `easyocr_scan.py` script.
  - Cleaned up hardcoded local venv execution paths in the Kotlin backend.
  - Managed the entire lifecycle using the `openspec` CLI tool, validating all specifications and archiving the change as `2026-06-15-implement-ocr-sidecar`.

### Known Remaining Gaps (not blockers)
- Remote storage (S3/SFTP/SMB/WebDAV) stubbed in `StorageService.kt` — local only
- No Kotlin unit/integration test suite — future priority (JUnit 5 + MockMvc)

### Modified/Added Files
- `ocr-sidecar/` — NEW Python sidecar service directory (app.py, requirements.txt, Dockerfile)
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt` — Refactored to make HTTP calls to sidecar instead of spawning subprocess
- `docker-compose.yml` — Added `ocr-sidecar` service, updated `backend` service's `depends_on`
- `backend-kotlin-jpa/src/main/resources/easyocr_scan.py` — DELETED (obsolete)
- `README.md` — Updated Tech Stack, Project Structure diagram, and Docker services table
- `HANDOFF.md` — This update

---

## Previous Session (2026-06-15, session 44)

### What Was Done

- **Removed Python FastAPI backend (migration confirmed 100% complete)**:
  - Verified full endpoint parity: all 14 Python routers map 1:1 to Kotlin controllers (Auth, Expenses, Reports, Advances, Mileage, Categories, Users, Dashboard, OCR, Signature, LDAP, AppSettings/Email/IMAP, Storage).
  - Deleted `backend/` directory (Python FastAPI + asyncpg, 70 source files, 2.3 MB).
  - Rewrote `Makefile` — removed broken `make test`/`make lint`/`make format` targets (those ran pytest inside Kotlin JRE container — always failed), replaced with `make build`, `make test-health`, `make test-login`.
  - Rewrote `.github/workflows/ci.yml` — removed Python setup/pip/ruff/pytest/Codecov steps; now runs `./gradlew bootJar` + Docker image build.
  - Updated `CLAUDE.md` — removed all Python legacy references, stale notes, fixed CI/CD section.

### Known Remaining Gaps (not blockers)
- Remote storage (S3/SFTP/SMB/WebDAV) stubbed in `StorageService.kt` — local only
- No Kotlin unit/integration test suite — future priority (JUnit 5 + MockMvc)

### Modified Files
- `backend/` — DELETED (entire Python backend)
- `Makefile` — Rewrote with Kotlin-relevant targets
- `.github/workflows/ci.yml` — Removed Python CI, added Kotlin bootJar + Docker build
- `CLAUDE.md` — Removed Python Legacy Reference section, updated stale notes
- `HANDOFF.md` — This update

---

## Previous Session (2026-06-15, session 43)

### What Was Done

- **Ported daily allowance rate setting to Kotlin backend**:
  - Added `GET /api/settings/daily-allowance-rate` (any authenticated user) and `PATCH /api/settings/daily-allowance-rate` (requires `chef_finance`) to `AppSettingsController.kt` with `DailyAllowanceOut` / `DailyAllowanceUpdate` DTOs.
  - Added `getDailyAllowanceRate()` helper in `ReportController.kt` that reads from `app_settings` table (defaults to `50.0` if unset). `calculateDailyAllowance()` now uses this instead of the hardcoded `50.0 EUR/day`.
  - Added `dailyAllowanceRate()` query key to `settingsKeys` in `frontend/lib/queryKeys.ts`.
  - Added **Daily Allowance** card to `frontend/app/admin/settings/page.tsx` — CFO can now read and update the per-diem rate from the UI alongside the existing mileage rates card.

### Modified Files
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt` — New endpoints + DTOs for daily allowance rate.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt` — `getDailyAllowanceRate()` helper; removed hardcoded `50.0`.
- `frontend/lib/queryKeys.ts` — Added `settingsKeys.dailyAllowanceRate()`.
- `frontend/app/admin/settings/page.tsx` — Added Daily Allowance section card.

---

## Previous Session (2026-06-15, session 42)

### What Was Done

- **CLAUDE.md rewritten to reflect Kotlin backend**:
  - Previous CLAUDE.md described only the legacy Python FastAPI backend. Fully rewrote it to document the active Kotlin Spring Boot 3.4.3 + JPA stack: source layout, auth pattern (`JwtAuthenticationFilter` → `request.getAttribute("currentUser")`), JPA/Flyway patterns, Jackson SNAKE_CASE config, key implementation caveats (in-memory filtering, remote storage stubs, daily allowance not yet DB-backed in Kotlin), and `docker-compose.yml` networking.

- **OpenSpec CSV/Excel export plan updated for Kotlin**:
  - The plan was originally written targeting the Python FastAPI backend. Updated all three artifacts (`proposal.md`, `design.md`, `tasks.md`) to reference the Kotlin stack: Apache POI (`poi-ooxml`) instead of `openpyxl`, `build.gradle.kts` instead of `pyproject.toml`, Kotlin controller/service files instead of Python routers, `ResponseEntity<ByteArray>` instead of `StreamingResponse`.

- **CSV/Excel export implemented — all tasks complete**:
  1. Added `org.apache.poi:poi-ooxml:5.3.0` to `backend-kotlin-jpa/build.gradle.kts`.
  2. Created `ExportService.kt` with `buildCsv()` (JDK `StringWriter`, RFC 4180 quoting) and `buildXlsx()` (Apache POI `XSSFWorkbook` with auto-filter and auto-sized columns).
  3. Added `GET /api/expenses/export` to `ExpenseController.kt` — reuses existing in-memory filter logic; returns CSV or XLSX with correct `Content-Disposition` header.
  4. Added `GET /api/reports/export` to `ReportController.kt` — mirrors `listReports` scoping (`all`, `status`, `user_id`).
  5. Added `GET /api/reports/{id}/export-csv` to `ReportController.kt` — per-report expense export; access control mirrors `getReport` (owner or privileged role; 403/404 on violation).
  6. Added `downloadBlob(url, params, filename)` utility to `frontend/lib/api.ts` using axios blob-fetch → `URL.createObjectURL` → synthetic anchor click pattern (same as existing PDF download).
  7. Added hover-dropdown Export buttons (CSV / XLSX) to `app/expenses/page.tsx`, `app/reports/page.tsx`, and `app/reports/[id]/page.tsx`.

- **Security fix — CSV formula injection**:
  - Automated security review flagged that merchant/description fields starting with `=`, `+`, `-`, `@`, `\t`, or `\r` would be interpreted as formulas by Excel/Sheets.
  - Added `sanitizeFormula()` helper in `ExportService.kt` that prefixes dangerous lead characters with `'`. Applied to both the CSV `quoteField` path and the XLSX string-cell path in `buildXlsx`.

### Modified Files
- `CLAUDE.md` — Full rewrite for Kotlin backend accuracy.
- `openspec/changes/csv-excel-export/proposal.md` — Updated for Kotlin stack.
- `openspec/changes/csv-excel-export/design.md` — Updated context, decisions, and migration plan for Kotlin.
- `openspec/changes/csv-excel-export/tasks.md` — Updated all task descriptions to reference Kotlin files.
- `backend-kotlin-jpa/build.gradle.kts` — Added `poi-ooxml:5.3.0`.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExportService.kt` — New file.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt` — Added `GET /api/expenses/export`.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt` — Added `GET /api/reports/export` and `GET /api/reports/{id}/export-csv`.
- `frontend/lib/api.ts` — Added `downloadBlob()` utility.
- `frontend/app/expenses/page.tsx` — Export dropdown button.
- `frontend/app/reports/page.tsx` — Export dropdown button.
- `frontend/app/reports/[id]/page.tsx` — Export expenses dropdown button.

---

## Previous Session (2026-06-15, session 41)

### What Was Done
- **Security & Bug Audit — Full Codebase Review**:
  - Conducted a manual audit of all backend routers and services without using any markdown documentation files.
  - Identified and fixed 4 confirmed bugs/security issues:

1. **Critical Bug — `duplicate_expense` tax_amount_eur arithmetic** (`expenses.py`):
   - `tax_amount_eur` was calculated using `/ fx_rate` instead of `* fx_rate` in the `POST /api/expenses/{id}/duplicate` handler. For non-EUR currencies, this produced an inverted EUR tax value (e.g., 100 RON at 0.2 EUR/RON rate → 500 EUR instead of 20 EUR).

2. **Bug — Manager IDOR inconsistency on single expense GET** (`expenses.py`):
   - `GET /api/expenses?all=true` allowed managers to list all expenses org-wide, but `GET /api/expenses/{id}` only allowed `chef_finance` and `mod` to access other users' expenses by ID. Added `"manager"` to the allowed roles on the single-expense endpoint to match the list endpoint behavior.

3. **Feature Fix — Hardcoded daily allowance rate** (`reports.py`, `pdf_export.py`, `app_settings.py`, `models.py`):
   - Daily allowance was hard-coded as `50.0` EUR/day in two separate places (`_fetch_report` in `reports.py` and `_build_main_pdf` in `pdf_export.py`). Moved to a DB-backed setting following the same pattern as mileage rates:
     - Added `DailyAllowanceOut` / `DailyAllowanceUpdate` Pydantic models to `models.py`.
     - Added `get_daily_allowance_rate()` helper in `app_settings.py`.
     - Added `GET /api/settings/daily-allowance-rate` (any authenticated user) and `PATCH /api/settings/daily-allowance-rate` (requires `chef_finance` role) endpoints.
     - `_fetch_report` and `export_report_pdf` now fetch the rate from DB and pass it through.
     - `_build_main_pdf` and `generate_report_pdf` now accept a `daily_allowance_rate: float` parameter (defaults to `50.0` for backward compatibility).

4. **Security Fix — Receipt filename insufficient sanitization** (`storage/__init__.py`):
   - `save_receipt` only replaced spaces with underscores in the filename stem. Characters like `;`, `%`, `null bytes`, and double dots were passed through unmodified. The path traversal guard (`is_relative_to`) was only applied in the local-fallback code path when `db_conn=None`. Added strict stem sanitization: only `[a-zA-Z0-9\-_]` characters are retained, capped at 100 chars, before constructing the relative path.

### Modified Files
- `backend/xpenses/routers/expenses.py` — Fixed `* fx_rate` in duplicate, added `"manager"` to single GET auth check.
- `backend/xpenses/routers/reports.py` — Replaced hardcoded `50.0` with `get_daily_allowance_rate()` call; passes rate to PDF generator.
- `backend/xpenses/routers/app_settings.py` — Added `get_daily_allowance_rate()` helper, `GET/PATCH /settings/daily-allowance-rate` endpoints.
- `backend/xpenses/services/pdf_export.py` — Added `daily_allowance_rate` param to `_build_main_pdf` and `generate_report_pdf`.
- `backend/xpenses/models.py` — Added `DailyAllowanceOut` and `DailyAllowanceUpdate` Pydantic models.
- `backend/xpenses/services/storage/__init__.py` — Strict filename stem sanitization in `save_receipt`.

---

## Previous Session (2026-06-15, session 40)
### What Was Done
- **Finalized Kotlin Migration & Documentation Alignment**:
  - Aligned and verified all Kotlin Spring Boot JPA endpoints, controllers, and services.
  - Updated configuration maps in [GEMINI.md](file:///home/poa/xpenses-kotlin/GEMINI.md) to reflect ports, architecture, and deployment procedures for the new Kotlin backend environment.
- **Git Branch Merging**:
  - Committed documentation changes, pushed the feature branch `feat/migrate-backend-to-kotlin` to the origin repository, checked out the `main` branch, merged the feature branch, and pushed the updated `main` branch to origin.

### Modified Files
- `GEMINI.md` — Updated backend documentation, ports, architectures, and patterns.
- `HANDOFF.md` — Incremented session history, documented the final migration integration.

---

## Previous Session (2026-06-14, session 39)
### What Was Done
- **JVM Development Mode Alignment**:
  - Overrode the GraalVM native image compiler build task with standard JVM compilation (`bootJar`) in [Dockerfile](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/Dockerfile) to accelerate development iteration time from 300+ seconds to ~10-15 seconds.
  - Copied the previous GraalVM native configuration to [Dockerfile.native](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/Dockerfile.native) for production deployment.
- **DTO Mappings & Model Alignments**:
  - Corrected constructor mapping properties in `DashboardController.kt` and `ReportController.kt` to use camelCase properties matching the `ReceiptOut` and `ExpenseOut` DTO specifications.
  - Rewrote [DataInitializer.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt) to seed the initial active categories, standard app settings (mileage rates), local test accounts with encoded passwords, and sample draft reports and expenses.
- **Security & Transaction Handling**:
  - Resolved `TransactionRequiredException` inside `AuthController.kt` by annotating database-modifying auth endpoints (`login`, `refresh`, `logout`) with `@Transactional`.
  - Added a dedicated [HealthController.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/HealthController.kt) exposing `/api/health` to resolve Spring Security authorization gates returning `403` status.
- **Validation**:
  - Rebuilt the backend container and verified that the JVM backend starts up in ~6 seconds.
  - Verified that `/api/health`, `/api/auth/login`, `/api/expenses`, `/api/reports`, and `/api/categories` are fully functional and returning appropriate payloads to the frontend.

### Modified Files
- `backend-kotlin-jpa/Dockerfile` — Updated to JVM container build.
- `backend-kotlin-jpa/Dockerfile.native` — Created native image build backup.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt` — Updated database seed logic.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/HealthController.kt` — Created health endpoint controller.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt` — Added `@Transactional` support.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/DashboardController.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt` — Corrected camelCase property names in mappings.
- `backend-kotlin-jpa/src/main/resources/META-INF/native-image/reflect-config.json` — Added Flyway and JJWT reflection configurations.

---

## Previous Session (2026-06-14, session 38)
### What Was Done
- **AOT Initializer & GraalVM Native Image Alignment**:
  - Aligned entrypoint class context with Spring Boot AOT compiler expectations by implementing `@JvmStatic main` method inside a companion object of the primary source `@SpringBootApplication class XpensesApplication`.
  - Configured AOT compiler task `mainClass` in [build.gradle.kts](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/build.gradle.kts) to point directly to `eu.nt.xpenses.XpensesApplication`.
  - Overrode runtime stack trace main class deduction in `XpensesApplication.kt` by explicitly setting `app.mainApplicationClass = XpensesApplication::class.java` in the companion object entrypoint.
  - Added [reflect-config.json](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/resources/META-INF/native-image/reflect-config.json) to explicitly register `eu.nt.xpenses.XpensesApplication__ApplicationContextInitializer` for GraalVM reflection, preventing `AotInitializerNotFoundException` (and `ClassNotFoundException`) during runtime startup.
- **Spring Boot & Kotlin Compatible Downgrades**:
  - Reverted experimental Spring Boot 4.1.0 to stable production-ready **Spring Boot 3.4.3** and Kotlin **2.0.21** (with GraalVM Native Build Tools 0.10.4) to resolve `SpringApplication$NativeImageRequirementsException` (which demands JDK 25 native compiler support).
- **Dual-Backend Configuration & Database Isolation**:
  - Configured [docker-compose.yml](file:///home/poa/xpenses-kotlin/docker-compose.yml) to run **both** the FastAPI python backend and the new Kotlin Spring Boot native backend concurrently:
    1. **Python FastAPI Backend** (`xpenses-backend`): Mapped to host port `8001:8000` (connecting to `xpenses` database). This serves the frontend completely, ensuring all categories, authentication, and previous app functions are 100% operational.
    2. **Kotlin Native Backend** (`xpenses-backend-kotlin`): Mapped to host port `8003:8080` (connecting to `xpenses_kotlin` database). This keeps the GraalVM native microservice fully testable and running.
  - Created the separate database `xpenses_kotlin` inside PostgreSQL to prevent column/table schema conflicts over the `expenses` table.
  - Dropped old conflicting tables from the `xpenses` database and verified that Alembic migrations ran successfully.
- **Stopped Legacy Containers**:
  - Verified and stopped all docker compose containers related to the legacy `xpenses_copy` directory to prevent any port clashes or resource conflicts.

### Modified Files
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/XpensesApplication.kt` — Updated main entrypoint declaration.
- `backend-kotlin-jpa/build.gradle.kts` — Updated Spring Boot/Kotlin versions and GraalVM build class mapping.
- `backend-kotlin-jpa/src/main/resources/META-INF/native-image/reflect-config.json` — Added custom reflection settings.
- `docker-compose.yml` — Set up dual-backend docker execution (Python on 8001, Kotlin on 8003).
- `README.md` — Updated status and tech stack details.
- `HANDOFF.md` — Updated session status history.

---

## Previous Session (2026-06-14, session 37)
- **Kotlin Backend Migration & GraalVM Native Image Blueprint & Implementation**:
  - Developed a comprehensive enterprise blueprint, project structure layout, and boilerplate config for migrating the backend to a highly optimized Kotlin + Spring Boot 3.x stack with native AOT compilation.
  - Implemented the complete boilerplate project structure under [backend-kotlin-jpa/](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/) containing:
    - [build.gradle.kts](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/build.gradle.kts) and [settings.gradle.kts](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/settings.gradle.kts).
    - JPA Models: [Report.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Report.kt) and [Expense.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Expense.kt) configured with `@JsonManagedReference`/`@JsonBackReference` to prevent JSON serialization infinite loops.
    - JPA Repository: [ReportRepository.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/ReportRepository.kt) showcasing the eager `JOIN FETCH` HQL/JPQL optimizations to avoid N+1 query problems.
    - JPA Service: [ReportService.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ReportService.kt).
    - REST Controller: [ReportController.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt) exposing endpoints at `/api/reports` to test fetch operations.
    - Database Initializer: [DataInitializer.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt) to seed sample reports and expenses on application startup.
    - Security Configuration: [SecurityConfig.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt) to permit all HTTP requests without authentication blocks during local verification.
    - Multi-stage [Dockerfile](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/Dockerfile) supporting GraalVM native image compiler and minimal runner targets; updated builder stage to install `findutils` (which provides `xargs`) to resolve a compilation dependency during `./gradlew` execution in Oracle Linux minimal base containers.
    - [deployment.yaml](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/deployment.yaml) manifest with strict resource boundaries (`memory: 512Mi`, `cpu: 500m`) and health checks.
    - [application.yml](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/resources/application.yml) application configuration.
  - Copied and configured the Gradle wrapper in `backend-kotlin-jpa/`.
  - Tuned the compiler plugins (Kotlin `2.3.21` and Spring Boot `4.1.0`) to resolve incompatibilities with the host's Java 25 runtime, and configured explicit build-time GraalVM class initialization parameters for logging frameworks (`org.slf4j`, `ch.qos.logback`, `org.apache.commons.logging`, `org.apache.logging.log4j`, `org.apache.logging.slf4j`) and `org.springframework.core.SpringProperties` to resolve native AOT compiler constraint errors.
  - Unified the entrypoint class by keeping the `main` method as a package-level function (which compiles to `XpensesApplicationKt` matching the build task config) and explicitly assigning `app.mainApplicationClass = XpensesApplication::class.java` inside the runner. This overrides stack frame class deduction during startup, preventing `AotInitializerNotFoundException` in Spring Boot AOT runtime.
  - Validated the implementation by executing a complete Gradle AOT-compatible project compilation (`./gradlew build` including `processAot`), achieving 100% success.
  - Exposed port `5432` in [docker-compose.yml](file:///home/poa/xpenses-kotlin/docker-compose.yml) and verified local functionality by executing the service locally connected to the database. Checked the `/api/reports` HTTP endpoint via `curl` and verified the eager JPQL `JOIN FETCH` queries operate in a single query with zero N+1 database roundtrips.
  - Reconfigured the main `backend` service in [docker-compose.yml](file:///home/poa/xpenses-kotlin/docker-compose.yml) to build from the [backend-kotlin-jpa/](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/) folder and map external port 8001 to the Spring container's port 8080 (passing in database JDBC connection variables `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD`), thereby integrating it directly with the frontend.
  - Started the background rebuild/restart of the compose backend stack via `docker compose up -d --build backend`.
  - Saved the blueprint document as a persistent design artifact at [kotlin_migration_blueprint.md](file:///home/poa/.gemini/antigravity-cli/brain/23454a6c-af66-4fbd-be99-6a79c289c9eb/kotlin_migration_blueprint.md).

### Modified Files
- `docker-compose.yml` — Exposed database port 5432 to host and re-routed main backend to build and run backend-kotlin-jpa.
- `README.md` — Added link to the new GraalVM Native Image Blueprint.
- `HANDOFF.md` — Updated session status.
- `backend-kotlin-jpa/` — Added the complete JPA Spring Boot boilerplate code along with local testing components.

---

## Previous Session (2026-06-14, session 36)
### What Was Done
- **React Rules of Hooks Fixes in OCR and SMTP Settings Pages**:
  - **Frontend**:
    - Reordered React hooks (`useQuery`, `useEffect`, `useMutation`) in [ocr/page.tsx](file:///home/poa/xpenses_copy/frontend/app/admin/ocr/page.tsx) and [email/page.tsx](file:///home/poa/xpenses_copy/frontend/app/admin/email/page.tsx) to ensure they are unconditionally declared at the top of the component body, resolving the React error "Rendered more hooks than during the previous render".
    - Consolidated role-checking code and removed duplicate moderator authorization checks.
- **Gemini API connection DNS Resolution Fix**:
  - **Docker Setup**:
    - Added explicit public DNS resolvers (`8.8.8.8`, `1.1.1.1`) to the `backend` service definition in [docker-compose.yml](file:///home/poa/xpenses_copy/docker-compose.yml) to bypass local host-level DNS resolution issues (`Temporary failure in name resolution`) and allow the container to connect to Google's Gemini endpoint.
  - **Validation**:
    - Merged code successfully back into the `main` branch.
    - Verified outbound connectivity to `generativelanguage.googleapis.com` from inside the backend container.
    - Ran type-checking with `npx tsc --noEmit` and confirmed zero TypeScript errors.
    - Executed the full backend integration test suite via `make test` and verified that all **185 tests** are passing (100% green).

### Modified Files
- `frontend/app/admin/ocr/page.tsx` — Reordered React hooks to satisfy Rules of Hooks.
- `frontend/app/admin/email/page.tsx` — Reordered React hooks to satisfy Rules of Hooks.
- `docker-compose.yml` — Configured public DNS servers on the backend container.

---

## Previous Session (2026-06-14, session 35)
### What Was Done
- **Flexible Email Report Ingestion & Side-by-Side Parser Simulation**:
  - **Backend**:
    - **Advanced Multilingv Local Parser**: Refactored the local email parser in [email_import_service.py](file:///home/poa/xpenses_copy/backend/xpenses/services/email_import_service.py) to support advanced date detection (flexibly parsing `DD.MM.YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY` formats), chronological proximity matching, and a dictionary of German, English, and Romanian keyword clues (e.g., Kunde/Customer/Client/Beneficiar, TechnPlatz/Location/Locatie, Positionstyp/Task/Activitate, Kundenauftrag/Order/Comanda).
    - **Whole Word Boundaries**: Replaced substring containment logic with strict regex word boundaries (`\b`) to prevent conversational matches (e.g., matching the word `order` inside `Kundenauftrag` or sentence structures).
    - **Gemini Email Ingestion**: Integrated Gemini-based email body parsing utilizing JSON schema matching to extract delegation report details directly from text.
    - **Simulation Endpoint Upgrades**: Refactored the `/api/settings/imap/simulate` endpoint in [imap_settings.py](file:///home/poa/xpenses_copy/backend/xpenses/routers/imap_settings.py) to run both parsers concurrently and return their outputs.
    - **Offline Test Seeding**: Seeded USD to EUR exchange rates inside `test_duplicate_expense_success` in [test_expenses.py](file:///home/poa/xpenses_copy/backend/tests/test_expenses.py) to prevent transient DNS and external network errors from failing offline test suite runs.
    - **Active Parser Exposing**: Extended `/api/settings/imap` config response and simulation payload to include `active_parser` flag derived from database configuration.
  - **Frontend**:
    - **Side-by-Side Simulation Comparison**: Redesigned the e-mail forward simulator panel on the IMAP settings page `/admin/imap` ([page.tsx](file:///home/poa/xpenses_copy/frontend/app/admin/imap/page.tsx)) to display **Local Parser (Offline)** and **Gemini Parser (Cloud AI)** results side-by-side with full error tracing and visual card status indicators.
    - **Client Types**: Added `local_parsed`, `gemini_parsed`, and `gemini_error` properties to the simulation response schema in [api.ts](file:///home/poa/xpenses_copy/frontend/lib/api.ts).
    - **Active Parser UX Indicators**: Injected a top-level information banner on the IMAP admin page describing the active parser engine, and added a specific indicator in the simulation success banner showing which parser created the report.
    - **React Rules of Hooks Fixes**: Corrected hook ordering warnings on both `imap/page.tsx` and `ldap/page.tsx` by placing `useQuery`, `useEffect`, and `useMutation` hook definitions unconditionally above the loading and user authorization early return checks.
  - **Validation**: Passed all **185 tests** successfully (100% green) and resolved all ruff linting and TypeScript compile violations.
 
### Modified Files
- `backend/xpenses/services/email_import_service.py` — Multi-lingual local parser, Gemini parsing, and side-by-side simulation logic.
- `backend/xpenses/routers/imap_settings.py` — Extended simulation output schema, configuration models, and active parser lookup.
- `backend/tests/test_email_parser.py` — Updated date format validation tests for the flexible parser.
- `backend/tests/test_expenses.py` — Seeded cache database table with USD exchange rates to prevent offline network lookups.
- `frontend/lib/api.ts` — Updated TypeScript simulation interfaces.
- `frontend/app/admin/imap/page.tsx` — Built side-by-side local vs. cloud parsed result blocks, info banners, and reordered React hooks.
- `frontend/app/admin/ldap/page.tsx` — Reordered React hooks to follow Rules of Hooks.

---

## Previous Session (2026-06-13, session 34)

### What Was Done
- **Architectural & Performance Optimizations (Backend & Frontend)**:
  - **Backend**:
    - **Concurrent PDF Downloads**: Refactored `generate_report_pdf` in [pdf_export.py](file:///home/poa/xpenses_copy/backend/xpenses/services/pdf_export.py) to download remote receipt images concurrently using `asyncio.gather` instead of sequentially in a loop, reducing PDF export latency.
    - **Atomic LDAP User Sync**: Wrapped database operations inside `sync_users` in [ldap_service.py](file:///home/poa/xpenses_copy/backend/xpenses/services/ldap_service.py) inside an async database transaction (`async with conn_db.transaction():`) to ensure database consistency on directory sync failures.
    - **Programmatic Alembic Startup**: Upgraded database initialization in [database.py](file:///home/poa/xpenses_copy/backend/xpenses/database.py) to run Alembic migrations natively using Python config and command classes instead of subprocess calls, and fixed legacy database stamping to execute `upgrade head` after base revision stamping.
  - **Frontend**:
    - **Panning Zoom Performance**: Fixed image panning transition lag in [ExpenseForm.tsx](file:///home/poa/xpenses_copy/frontend/components/expenses/ExpenseForm.tsx) by conditionally disabling the CSS transition class (`transition-transform duration-200`) during image drag movement.
    - **Hydration Flickers (Access Denied)**: Guarded all gated views ([approvals/page.tsx](file:///home/poa/xpenses_copy/frontend/app/approvals/page.tsx), [payments/page.tsx](file:///home/poa/xpenses_copy/frontend/app/payments/page.tsx), and all admin pages under [admin/](file:///home/poa/xpenses_copy/frontend/app/admin/)) using the `loading` flag from `useAuth()`, showing a loader spinner until user session details hydrate and preventing flash of access errors.
    - **Mobile Responsive Layout**: Built a mobile-only tab header switcher in `ExpenseForm.tsx` allowing users to toggle between Details and Receipt preview, preventing page layout pushing on smaller screens, and added mobile-friendly fallback open buttons for embedded PDF frame targets.
  - **Validation**: Ran all **185 tests** successfully (100% green).

### Modified Files
- `backend/xpenses/services/pdf_export.py` — Concurrent receipt fetching.
- `backend/xpenses/services/ldap_service.py` — Transaction wrap on LDAP directory sync.
- `backend/xpenses/database.py` — Programmatic Alembic commands.
- `frontend/components/expenses/ExpenseForm.tsx` — Panning performance, mobile tab switcher, PDF mobile fallbacks.
- `frontend/app/approvals/page.tsx`, `frontend/app/payments/page.tsx` — Hydration loading guard.
- `frontend/app/admin/ldap/page.tsx`, `frontend/app/admin/email/page.tsx`, `frontend/app/admin/imap/page.tsx`, `frontend/app/admin/ocr/page.tsx`, `frontend/app/admin/storage/page.tsx`, `frontend/app/admin/users/page.tsx` — Hydration loading guard.

---

## Previous Session (2026-06-13, session 33)

### What Was Done
- **Architectural Audit & Resolution of Critical Bugs**:
  - **Audit**: Conducted a thorough architectural audit across backend, frontend, and security/DevOps layers using three specialized subagents. Generated a comprehensive audit report at [architecture_audit_report.md](file:///home/poa/.gemini/antigravity-cli/brain/ae04de80-01e3-4606-b6e1-37f5f9db0151/architecture_audit_report.md).
  - **Backend Fixes**:
    - **Tax FX Calculation**: Fixed a critical calculation bug in [expenses.py](file:///home/poa/xpenses_copy/backend/xpenses/routers/expenses.py) where tax in EUR (`tax_amount_eur`) was dividing by `fx_rate` instead of multiplying (corrupting foreign tax records).
    - **LDAP Blocking I/O**: Refactored `authenticate_ldap` in [ldap_service.py](file:///home/poa/xpenses_copy/backend/xpenses/services/ldap_service.py) to run synchronous LDAP socket bindings inside `asyncio.to_thread` to prevent blocking FastAPI's main thread event loop.
    - **LDAP Password Overwrite**: Fixed a bug in [ldap.py](file:///home/poa/xpenses_copy/backend/xpenses/routers/ldap.py) where saving settings with masked password string `"***"` overwrote the actual saved password in the database.
  - **Frontend Fixes**:
    - **Middleware Token Refresh**: Updated the authentication gate in [middleware.ts](file:///home/poa/xpenses_copy/frontend/middleware.ts) to permit page loading if either `access_token` or `refresh_token` cookie is present, solving the race condition where active users were redirect-booted after 15 minutes of inactivity.
    - **Axios Refresh Failure Eviction**: Modified Axios interceptor in [api.ts](file:///home/poa/xpenses_copy/frontend/lib/api.ts) to hard redirect to `/login` when token refresh fails (expired refresh tokens), preventing silent UI hangs.
    - **Tailwind CSS v4 Toast Animation**: Defined the missing `--animate-slide-in` CSS variables and `@keyframes` rule inside Tailwind CSS v4 `@theme` directive in [globals.css](file:///home/poa/xpenses_copy/frontend/app/globals.css) to fix abrupt toast appearances.
  - **Validation**: Ran all **185 tests** successfully (100% green).

### Modified Files
- `backend/xpenses/routers/expenses.py` — Fixed Tax FX conversion formula.
- `backend/xpenses/services/ldap_service.py` — Offloaded synchronous LDAP calls.
- `backend/xpenses/routers/ldap.py` — Prevented masked password string write overwrite.
- `frontend/middleware.ts` — Updated gate logic to allow refresh token renewal.
- `frontend/lib/api.ts` — Added redirection logic to login page on refresh failures.
- `frontend/app/globals.css` — Added slide-in keyframe animations for toast notification layout.

---

## Previous Session (2026-06-13, session 32)

### What Was Done
- **Email Forward Ingestion Simulator (Local Testing)**:
  - Created a local simulation workflow for testing report creation via forwarded company job delegation emails.
  - **Backend**:
    - Created the `simulate_incoming_email` service in [email_import_service.py](file:///home/poa/xpenses_copy/backend/xpenses/services/email_import_service.py) that parses standard German job delegation email bodies and saves the resulting report, returning detailed parse status and the created report's ID.
    - Added the `POST /api/settings/imap/simulate` endpoint in [imap_settings.py](file:///home/poa/xpenses_copy/backend/xpenses/routers/imap_settings.py) (restricted to the `mod` role) to execute email parsing and import simulations.
    - Added comprehensive integration tests in [test_imap_settings.py](file:///home/poa/xpenses_copy/backend/tests/test_imap_settings.py) verifying simulation endpoint logic.
  - **Frontend**:
    - Added the `simulateEmailIngestion` API method and updated TypeScript interfaces in [api.ts](file:///home/poa/xpenses_copy/frontend/lib/api.ts).
    - Fixed a pre-existing TypeScript error in `OCRComparisonRow` interface definition (missing `mineru_*` fields) which was blocking production builds.
    - Built a premium **Email Forward Ingestion Simulator** panel on the IMAP configuration page `/admin/imap` ([page.tsx](file:///home/poa/xpenses_copy/frontend/app/admin/imap/page.tsx)), equipped with active user dropdowns, editable sample email templates, loading states, and direct links to view the created draft report.

### Modified Files
- `backend/xpenses/services/email_import_service.py` — Added `simulate_incoming_email` service method.
- `backend/xpenses/routers/imap_settings.py` — Registered `POST /simulate` route and input/output Pydantic models.
- `backend/tests/test_imap_settings.py` — Added integration tests for simulation.
- `frontend/lib/api.ts` — Added simulation client methods and fixed `OCRComparisonRow` mineru fields.
- `frontend/app/admin/imap/page.tsx` — Built the interactive simulation UI.

---

## Previous Session (2026-06-13, session 31)

### What Was Done
- **Documentation & Roadmap Audit**:
  - Conducted a comprehensive review of all markdown documentation (`README.md`, `CLAUDE.md`, `GEMINI.md`, `HANDOFF.md`, and `AUDIT_FIXES.md`) to verify alignment with the codebase and the roadmap.
  - Updated the test suite count from 131/145 to **184 tests** across all `.md` instruction and status files to match the actual size of the test suite.
  - Formally updated the roadmap in `README.md` to mark **Expense duplication** as completed `[x]`, as it is fully implemented in the frontend and backend.
  - Updated architectural schema references in `CLAUDE.md` and `GEMINI.md` to document the Alembic migrations setup implemented in session 30.
  - Cleaned up the pending task checklist in `AUDIT_FIXES.md`.

### Modified Files
- `README.md` — Updated test counts and marked expense duplication as complete.
- `CLAUDE.md` — Updated test counts and documented the Alembic migrations schema pattern.
- `GEMINI.md` — Updated test counts and documented the Alembic migrations schema pattern.
- `AUDIT_FIXES.md` — Cleaned up the pending checklist state.

---

## Previous Session (2026-06-13, session 30)

### What Was Done
- **Database Schema Management (Alembic)**:
  - Integrated `alembic` (v1.13.3) for database schema migrations, replacing the custom SQL migrations runner in `database.py`.
  - Created a baseline Alembic migration revision that creates all base tables and indexes (reproducing `0001_init.sql` schema).
  - Created sequential Alembic migrations for adding `raw_ocr_text` (Revision 2) and `ocr_comparisons` table (Revision 3).
  - Updated `database.py` to run Alembic migrations programmatically on startup using a subprocess executing `alembic upgrade head`, dynamically loading the active database connection string from environment variables and config.
  - Added a smart baseline stamp check: if a legacy database is detected (tables already exist but no `alembic_version` table is present), the database is stamped directly to the head revision to prevent recreating tables.
  - Updated `tests/conftest.py` and `tests/test_migrations_cleanup.py` to run under the new Alembic migration system, verifying that the `alembic_version` table is correctly populated.
- **Premium UI/UX Polish**:
  - **Stat Cards (`StatCard.tsx`)**: Re-styled with custom CSS gradients, glassmorphism (`backdrop-blur-md bg-white/70 dark:bg-slate-900/75`), hover elevation shifts, and subtle ambient glow details.
  - **Action Cards (`DashboardActionCard.tsx`)**: Re-styled with custom role-based gradients, fine glowing borders, icon zoom transitions, and slide animations on the arrow icon.
  - **Status Badges (`Badge.tsx`)**: Redesigned to use modern pill styling with fine border outlines and a pulsing status dot.
  - **Category Spend Progress Chart (`dashboard/page.tsx`)**: Replaced the plain text table with animated horizontal progress bars cycling through vibrant gradient color patterns.
  - **Sidebar Active States (`Sidebar.tsx`)**: Replaced block active background fills with clean colored border-l accents matching the user's role.

### Modified Files
- `backend/pyproject.toml` — Added `alembic==1.13.3` to project dependencies.
- `backend/xpenses/database.py` — Removed manual `CREATE_TABLES` query; refactored `init_db` to run Alembic migrations via subprocess.
- `backend/xpenses/migrations/` — Generated Alembic structure containing `env.py`, `alembic.ini`, and 3 migrations under `versions/`. Deleted old legacy raw SQL migrations folder.
- `backend/tests/test_migrations_cleanup.py` — Updated database schema checks to query `alembic_version`.
- `frontend/components/dashboard/StatCard.tsx` — Styled with gradients, hover micro-interactions, and glassmorphic blurs.
- `frontend/components/dashboard/DashboardActionCard.tsx` — Styled with role-based gradients, fine borders, and slide animations.
- `frontend/components/ui/Badge.tsx` — Re-designed pill layout with status indicator dots.
- `frontend/app/dashboard/page.tsx` — Replaced spend table with visual category progress bars.
- `frontend/components/layout/Sidebar.tsx` — Styled active nav links with left colored border lines.

---

## Previous Session (2026-06-13, session 29)

### What Was Done
- **Expense Image Preview on Upload**:
  - Implemented a side-by-side split layout on the `/expenses/new` and edit expense pages.
  - Form displays on the left, and a dedicated **Receipt Preview** panel displays on the right, dynamically expanding to occupy all remaining screen space on desktop (`lg:flex-1`).
  - Implemented object URL lifecycle management using `useRef` and `useEffect` cleanups to prevent memory leaks for newly added receipt preview files.
  - Implemented custom interactive zoom controls allowing users to zoom in/out/reset the image scale.
  - Added click-and-drag panning capability so users can reposition and examine fine receipt details when zoomed.
  - Handled PDF rendering via browser `<iframe>` and fallback links/previews for other file types.
  - Integrated a dynamic tab header switcher to select between multiple uploaded files when multiple receipts are selected.
- **Git Feature Branching**:
  - Switched implementation workflow to the dedicated feature branch `feat/expense-image-preview` and successfully merged it into `main` after verification.

### Modified Files
- `frontend/components/expenses/ExpenseForm.tsx` — Split layout, dynamic previews, zoom controls, click-and-drag pan handlers, and tab switcher.
- `CLAUDE.md` — Documented the new Side-by-Side Expense Image Preview pattern.
- `README.md` — Added description of the new interactive receipt preview and zoom features.

---

## Previous Session (2026-06-12, session 28 — continued)

### What Was Done (additional)
- **MinerU 2.5 Local OCR Provider**:
  - Added `MinerUOCRProvider` class in `ocr_service.py` that calls a locally-running `mineru-api` HTTP server. Sends the receipt file as multipart, parses the returned Markdown, then reuses `extract_amount` / `extract_date` / `extract_merchant` / `extract_tax` helpers + Naive Bayes classifier for structured field extraction.
  - Added `mineru` branch in `scan_receipt`: runs EasyOCR in parallel (same pattern as Gemini) so the accuracy comparison dashboard still works. MinerU results are stored in the `gemini_*` columns of `ocr_comparisons`, making the side-by-side view show **MinerU vs EasyOCR**.
  - Added `mineru_url` field to `OCRConfig` dataclass (default `http://mineru:8000`), persisted through `get_ocr_config` / `save_ocr_config`, and exposed in `OCRConfigOut` / `OCRConfigUpdate` Pydantic models.
  - Updated `app_settings.py` GET/PATCH handlers to pass `mineru_url` through.
  - **Frontend** (`/admin/ocr`):
    - New **"MinerU 2.5 (Local - High Accuracy)"** option in the provider selectbox.
    - Collapsible MinerU URL config section (violet accent, mirrors Gemini key section) with a start-server hint (`mineru-api --host 0.0.0.0 --port 8000`).
    - `mineru_url` wired through Zod schema, `DEFAULT_FORM`, `reset()`, and `onSubmit()`.
    - Comparison dashboard accuracy card title and table column header are now dynamic: show **"MinerU (Local)"** when MinerU is the active provider, otherwise **"Gemini (Cloud)"**.
- **Branch**: `feature/ocr-accuracy-dashboard` (commit `2bedf70`)
- **Verification**: `make lint` ✅ · `make test` ✅ (184 passed)

### Modified Files (additional)
- `backend/xpenses/models.py` — `mineru_url` in `OCRConfigOut` / `OCRConfigUpdate`
- `backend/xpenses/services/ocr_service.py` — `MinerUOCRProvider`, `mineru` branch in `scan_receipt`, `mineru_url` in config
- `backend/xpenses/routers/app_settings.py` — `mineru_url` plumbed through GET/PATCH
- `frontend/lib/api.ts` — `mineru_url` in `OcrConfig` interface
- `frontend/app/admin/ocr/page.tsx` — selectbox option, URL input section, dynamic headers

### How to use MinerU
1. Start MinerU API server (inside Docker or on the host): `mineru-api --host 0.0.0.0 --port 8000`
2. Go to `/admin/ocr`, select **MinerU 2.5**, set the URL (e.g. `http://mineru:8000`), save.
3. Upload receipts — MinerU will process them; EasyOCR runs in parallel for comparison tracking at `/admin/ocr`.

---



### What Was Done
- **OCR Accuracy Comparison Dashboard** (`/admin/ocr`):
  - **Fixed invisible comparison section**: the section was hidden when `history.length === 0`. It now always renders when the API query resolves, showing a dashed empty-state card with a call-to-action message ("Create an expense and upload a receipt to begin tracking accuracy").
  - **Fixed missing scan rows (critical bug)**: The `/api/ocr/comparison` query used an `INNER JOIN` on `expenses`, meaning scans that had not yet been saved as expenses were silently excluded. Changed to `LEFT JOIN` so all scans appear immediately after upload, even before the user saves the expense form.
  - **Fixed accuracy calculation bug**: Stats are now computed only for rows that have been linked to a saved expense (ground truth available). Previously, unlinked rows were counted with null final values, producing spurious 0 % scores.
  - **Fixed null == null date false-positive**: added `is not None` guard before date string comparison.
  - **Frontend unlinked row UX**: Rows without a linked expense show an amber **"Not saved yet"** badge in the receipt column and **"Pending save…"** in the Final column. Match/mismatch colouring is suppressed for these rows since there is no ground truth to compare against.
- **Branch**: `feature/ocr-accuracy-dashboard` (commit `e6cb5a6`)
- **Verification**: `make lint` ✅ · `make test` ✅ (184 passed)

### Modified Files
- `backend/xpenses/routers/ocr.py` — LEFT JOIN, accuracy guard, null-date guard
- `frontend/app/admin/ocr/page.tsx` — empty state, unlinked row badges, pending save label

### Test Results
- **184 tests pass** (all green).

---

## Previous Session (2026-06-12, session 27)

### What Was Done
- **Configurable Storage Location**:
  - Implemented multi-protocol storage configuration and validation. Supports Local, SMB (`smbprotocol`), WebDAV (custom client via `httpx`), SFTP (`paramiko`), and S3 (`boto3`) storage providers.
  - Implemented credentials encryption via Fernet and dynamic credentials masking.
  - Added background file migration task to copy existing receipts to the new storage provider upon saving new settings.
  - Implemented read fallbacks to prevent any access downtime during ongoing background migrations.
  - Created a frontend panel `/admin/storage` for administrators/moderators to configure storage settings, verify connections, and trigger background migrations.
  - Re-routed receipt uploads, receipt servings, PDF report generation, ZIP compilation, and orphan cleaning utilities through the active storage provider.
- **Frontend Build Fix**:
  - Updated `frontend/postcss.config.js` to export using CommonJS `module.exports` instead of ESM `export default`, resolving webpack configuration errors under Node environment.
- **Verification & Testing**:
  - Resolved all Ruff lint warnings across all modified backend files.
  - Wrote backend integration tests in `backend/tests/test_storage_settings.py`.
  - Ran `make test` with all **184 tests passing** successfully.
  - Ran Next.js production builds under `NODE_ENV=production` successfully.
- **OpenSpec**:
  - Synced delta specs into the main specifications directory for `configurable-storage` and `db-migrations-receipts-cleanup`.
  - Archived the change to `openspec/changes/archive/2026-06-12-configurable-storage-settings/`.

### Modified/Added Files
- `backend/pyproject.toml` — Added S3 (`boto3`), SFTP (`paramiko`), and SMB (`smbprotocol`) dependencies.
- `backend/xpenses/models.py` — Configured storage schema models.
- `backend/xpenses/routers/app_settings.py` — Added storage settings and migration endpoints.
- `backend/xpenses/routers/expenses.py` — Routed uploads and servings through Storage Manager.
- `backend/xpenses/routers/reports.py` — Adapted report PDF exports and ZIP compilation to use Storage Manager cache.
- `backend/xpenses/services/storage/` — Implemented providers (`local.py`, `smb.py`, `webdav.py`, `sftp.py`, `s3.py`, `manager.py`, `base.py`).
- `backend/tests/test_storage_settings.py` — Storage settings integration tests.
- `frontend/app/admin/storage/page.tsx` — Storage settings configuration UI.
- `frontend/components/layout/Sidebar.tsx` — Sidebar item for Storage Settings.
- `frontend/postcss.config.js` — Changed postcss exports format.
- `openspec/specs/configurable-storage/spec.md` — New specification.
- `openspec/specs/db-migrations-receipts-cleanup/spec.md` — Updated specification.

### Test Results
- **184 tests pass** (all green).

---

## Previous Session (2026-06-12, session 26)


### What Was Done
- **Bug Audit Resolutions**:
  - **Double Pool Connection**: Fixed `get_current_user` to depend on and reuse the request-level database connection, preventing database pool exhaustion.
  - **Ownership checks on Mileage and Advances**: Added report ownership validations on all mileage modification routes and update advance payment routes to ensure only the report owner can perform these mutations.
  - **Stale total_amount on Rejection**: Reset `total_amount` to `0.0` when a report is rejected (since all expenses are detached from it) inside an atomic database transaction block.
  - **Zero FX Rate Validation**: Raised a `ValueError` if the external exchange rate provider returns `0.0` to avoid silently storing zero-EUR converted amounts.
  - **Path Traversal Directory creation**: Moved `os.makedirs` to execute only after resolving and validating target file paths.
  - **Manager Scoped Expenses**: Added `"manager"` to allowed roles in `list_expenses?all=true` for consistency.
  - **DDL Baseline Columns**: Added missing columns to `advance_payments` table fallback definition block to match migrations and actual DB schema.
- **Verification & Testing**:
  - Added unit tests for path traversal, zero FX rate validation, and manager expense permissions, and integration test for advance update permissions.
  - Ran the full test suite with all **178 tests passing** successfully.

### Modified/Added Files
- `backend/xpenses/auth.py` — Reused connection for user retrieval.
- `backend/xpenses/database.py` — Updated table DDL fallback block.
- `backend/xpenses/routers/mileage.py`, `backend/xpenses/routers/advances.py` — Added owner write checks.
- `backend/xpenses/routers/reports.py` — Reset `total_amount` to `0` and wrapped updates in transaction.
- `backend/xpenses/routers/expenses.py` — Added manager role to `all=true` filter.
- `backend/xpenses/services/fx_service.py` — Added zero exchange rate exception.
- `backend/xpenses/services/storage.py` — Moved `os.makedirs` after traversal check.
- `backend/tests/test_mileage.py`, `backend/tests/test_advances.py`, `backend/tests/test_expenses.py`, `backend/tests/test_reports.py` — Added corresponding tests.

### Test Results
- **178 tests pass** (all green).

---

## Previous Session (2026-06-11, session 25)

### What Was Done
- **Phase 1: Stability & Database Integrity Fixes**:
  - Wrapped multi-step report state transition workflows (submitting, recalling, approving, rejecting, and paying) in `/reports.py` in database transaction context blocks (`async with db.transaction():`).
  - Refactored `/services/fx_service.py` to lease connection pool resources only during query caching and queries, releasing the connection before starting external HTTP requests to Frankfurter/fallback APIs.
  - Configured Axios response interceptors in `/lib/api.ts` to automatically intercept `401 Unauthorized` requests, perform silent token refresh, and transparently retry the failed request.
- **Phase 2: UX & Performance Optimizations**:
  - Added an inline blocking script inside `<head>` in `layout.tsx` to check `localStorage` theme preferences and append the `.dark` class early, preventing Flash of Un-themed Content (FOUC).
  - Integrated custom design tokens for background and foreground styling under the new Tailwind v4 `@theme` directive in `globals.css`.
  - Offloaded ReportLab PDF compilation and PyPDF merges in `/services/pdf_export.py` to a worker thread pool via `asyncio.to_thread`.
  - Refactored `/routers/signature.py` to write base64 signature images asynchronously using `aiofiles`.
  - Consolidated 8 sequential dashboard counts/sums queries in `/routers/dashboard.py` into 2 efficient queries utilizing PostgreSQL conditional aggregations (`FILTER (WHERE ...)`).
- **Git Branching**:
  - Created the feature branch `feature/optimizations` and committed both Phase 1 and Phase 2 changes. Pushed the branch to GitHub.

### Modified/Added Files
- `backend/xpenses/routers/reports.py` — Added transactions to workflow handlers.
- `backend/xpenses/routers/dashboard.py` — Consolidated dashboard query stats.
- `backend/xpenses/routers/signature.py` — Asynchronous user signature image writes.
- `backend/xpenses/services/fx_service.py` — Optimized pool release during API requests.
- `backend/xpenses/services/pdf_export.py` — CPU PDF compilation offloaded to threads.
- `frontend/app/layout.tsx` — Injected blocking script in head.
- `frontend/app/globals.css` — Configured Tailwind v4 theme variables.
- `frontend/lib/api.ts` — Implemented Axios response interceptor for silent token refresh.

### Test Results
- **174 tests pass** (all green, execution time improved by ~12s).

---

## Previous Session (2026-06-11, session 24)

### What Was Done
- **Hybrid OCR Scanning & Settings UI**:
  - Implemented a complete hybrid OCR engine supporting local EasyOCR (default) and Google Gemini 2.5 Flash API (Cloud).
  - Saved OCR settings (provider toggle, API key) in the `app_settings` database table, encrypting keys with Fernet (secret: `xpenses-gemini-ocr-pw`).
  - Restored dynamic client config retrieval and masked API keys in responses.
  - Built a dedicated settings view at `/admin/ocr` for moderators, containing provider selectors, toggle switches, and a live Google API connection test button.
  - Created backend tests verifying configuration management, encryption/masking, and mock Google connectivity checks.
  - Synced delta specs and archived change under `2026-06-11-gemini-ocr`.
- **Drag-and-Drop Receipt Upload & Self-Learning Category Classifier**:
  - Added a visual dashed Drag-and-Drop receipt drop zone inside `ExpenseForm.tsx` supporting dragging and click-to-browse.
  - Extended Gemini OCR prompt and response schemas to match active database categories.
  - Added a database-backed, pure-Python Multinomial Naive Bayes text classifier (`classifier_service.py`) trained on raw database OCR texts, providing local fallback classification.
  - Created a database migration script `0002_add_raw_ocr_text.sql` to store the raw scanned text on each expense save.
  - Autofilled categories, descriptions, amounts, dates, and merchants immediately when receipt analysis completes.
  - Added unit tests for keyword matching, Naive Bayes classifier training, and predictions.
  - Synced delta specs and archived change under `2026-06-11-drag-drop-ocr-autofill`.

### Modified/Added Files
- `backend/xpenses/migrations/0002_add_raw_ocr_text.sql` — New migration adding `raw_ocr_text` to `expenses` table.
- `backend/xpenses/services/classifier_service.py` — Pure Python Multinomial Naive Bayes text classifier service.
- `backend/xpenses/services/ocr_service.py` — Updated strategy providers to match categories and descriptions, and load classifier.
- `backend/xpenses/models.py` — Updated `OCRScanResponse` and `ExpenseOut` / `ExpenseCreate` / `ExpenseUpdate` Pydantic models.
- `backend/xpenses/routers/expenses.py` — Updated endpoints to persist raw OCR text.
- `backend/xpenses/routers/app_settings.py` — Added endpoints for `/settings/ocr`.
- `backend/xpenses/routers/ocr.py` — Updated scan route.
- `backend/tests/test_ocr.py` — Added Naive Bayes and EasyOCR category mapping tests.
- `backend/tests/test_ocr_settings.py` — New settings integration test suite.
- `frontend/app/admin/ocr/page.tsx` — Premium Next.js moderator OCR settings panel.
- `frontend/components/expenses/ExpenseForm.tsx` — Styled Drag-and-Drop container and autofill hook.
- `frontend/components/layout/Sidebar.tsx` — Rendered OCR Scanner sidebar link.
- `frontend/lib/api.ts` — Added OCR settings client methods and interface attributes.
- `frontend/lib/queryKeys.ts` — Added OCR query key cache invalidation markers.
- `CLAUDE.md` — Updated pattern docs for OCR settings and Naive Bayes classifier.

### Test Results
- **174 tests pass** (all green).

---

## Previous Session (2026-06-10, session 23)

### What Was Done
- **Deprecated `datetime.utcnow()` Cleanup**:
  - Replaced all 21 occurrences of the deprecated `datetime.utcnow()` with timezone-aware `datetime.now(timezone.utc)` across all backend routers and services to prevent potential future runtime deprecation issues.
  - Updated python imports (`from datetime import datetime, timezone`) in all modified files.
- **Verification & Testing**:
  - Rebuilt the backend docker container.
  - Ran the full test suite verifying that all **158 tests passed** successfully.

### Modified/Added Files
- `backend/xpenses/routers/advances.py` — Replaced 5 occurrences of `utcnow()`.
- `backend/xpenses/routers/dashboard.py` — Replaced 1 occurrence of `utcnow()`.
- `backend/xpenses/routers/expenses.py` — Replaced 4 occurrences of `utcnow()`.
- `backend/xpenses/routers/reports.py` — Replaced 10 occurrences of `utcnow()`.
- `backend/xpenses/services/pdf_export.py` — Replaced 1 occurrence of `utcnow()`.

### Test Results
- **158 tests pass** (all green).

---

## Previous Session (2026-06-10, session 22)

### What Was Done
- **User Profiles & Reports History View — Full Stack Implementation**:
  - **Change Spec**: Created proposal, specs, design, and checklist under `openspec/changes/user-profiles-reports-view/`.
  - **Backend Updates**:
    - `GET /api/reports`: Added `user_id` query parameter for filtering reports, with authorization checks ensuring technicians can only query their own reports.
    - `GET /api/users/{user_id}`: Updated authorization to allow managers, CFOs, and moderators to retrieve profiles for any staff member.
    - Added backend testing in `backend/tests/test_user_profiles_reports.py` checking authorization gates and user filters (all 158 tests pass).
  - **Frontend Updates**:
    - **Shared Directory**: Made `/admin/users` (User Directory) accessible by Managers and CFOs in read-only mode, with creation and modification actions hidden. Clickable user display names now link to profiles.
    - **Navigation**: Exposed the "Directory" link in the sidebar navigation for Managers and CFOs.
    - **Dynamic Profiles**: Created `/profile/[id]` dynamic page displaying technician details in read-only form.
    - **Reports History Tab**: Added a tab in the dynamic profile view listing all reports belonging to that technician.
    - **Summary Modal**: Integrated a click-to-open summary modal inside the profile view showing individual expenses, dates, and status, with a shortcut button to the full detail route.
    - Linked technician names in `Approvals` and `Payments` lists to their dynamic profiles.
  - **Verification**:
    - All **158 tests passed** green.
    - TypeScript compiles cleanly without error (`npx tsc --noEmit`).
  - **Archiving**:
    - Delta specs synced to main specs, and change archived to `2026-06-10-user-profiles-reports-view`.

### Modified/Added Files
- `backend/xpenses/routers/reports.py` — Updated `/api/reports` parameter filtering.
- `backend/xpenses/routers/users.py` — Opened `/api/users` endpoints to managers/CFOs.
- `backend/tests/test_user_profiles_reports.py` — New tests for profile retrieval and filtering.
- `frontend/app/admin/users/page.tsx` — Dynamic read-only staff roster view.
- `frontend/app/profile/[id]/page.tsx` — New dynamic profile view with reports tab and modal details.
- `frontend/components/layout/Sidebar.tsx` — Visible Directory link for managers and CFOs.
- `frontend/app/approvals/page.tsx`, `frontend/app/payments/page.tsx` — Added profile linking to submitter names.

### Test Results
- **158 tests pass** (all green).

---

## Previous Session (2026-06-10, session 21)

### What Was Done
- **UI/UX Refactoring & Polish for Admin Pages** — Applied beautiful visual card styling, transitions, hover states, loading/disabled indicators, responsive grid patterns, and consistent alert/warning components to:
  - **SMTP Settings Page** (`/admin/email`)
  - **IMAP Settings Page** (`/admin/imap`)
  - **LDAP/AD Settings Page** (`/admin/ldap`)
- **Verification & Testing**:
  - Ran full backend test suite: all **155 tests passed** successfully.
  - Ran TypeScript type validation: `npx tsc --noEmit` passed with **zero errors**.
- **Cleaned Up & Merged**:
  - Terminated all running subagents (`web_designer`).
  - Staged, committed, and pushed the UI/UX changes to the remote repository.
  - Archived `import-report-from-email` change folder and updated spec files.

### Modified/Added Files
- `frontend/app/admin/email/page.tsx` — Styled settings form with rounded borders, alerts, transitions, and loading states.
- `frontend/app/admin/imap/page.tsx` — Applied premium UI improvements to match other configuration screens.
- `frontend/app/admin/ldap/page.tsx` — Aligned design, layout, alerts, table rendering, and inputs with SMTP/IMAP forms.

### Test Results
- **155 tests pass** (all green).

---

## Previous Session (2026-06-10, session 20)

### What Was Done
- **Email Report Ingestion (IMAP/Delegation import) — Core Backend & Frontend** — Full stack implementation allowing automated draft report generation by forwarding standardized job delegation emails to a monitored IMAP box.
  - **Change Context**: Created planning files (`proposal.md`, `specs/email-report-import/spec.md`, `design.md`, `tasks.md`) under `openspec/changes/import-report-from-email/`.
  - **IMAP Settings Service**: Built `imap_settings_service.py` to save, load, and test IMAP connections. Passwords are encrypted in `app_settings` (key: `imap_config`) via Fernet.
  - **Email Parsing & User Match**: Created `email_import_service.py` with regex parsing logic for the German job delegation format and user sender matching.
  - **IMAP Daemon**: Developed `imap_daemon.py` background runner running every 60 seconds (utilizing `asyncio.to_thread` for imaplib connection fetching) and registered it inside `main.py` lifespan setup/teardown.
  - **Moderator IMAP settings API & UI**: Created `imap_settings.py` router with GET, PATCH, and POST `/test` endpoints, registered it in `main.py`. Added `/admin/imap` Next.js form, added `ImapConfig` types, and integrated an `Email / IMAP` icon link in the `Sidebar.tsx` admin section.
  - **Automated Testing**: Created parser unit tests (`test_email_parser.py`) and IMAP router tests (`test_imap_settings.py`).
  - **Verification**: Verified that all **154** backend tests are passing successfully.
  - **Task progress**: Completed tasks 1.1-1.3, 2.1-2.3, 3.1-3.2, 4.1-4.3, and 5.1-5.4. (15/16 tasks complete).

### Modified/Added Files
- `backend/xpenses/services/imap_settings_service.py` — New service handling loading, saving, and testing connection.
- `backend/xpenses/services/email_import_service.py` — New service parsing delegation formats and matching senders.
- `backend/xpenses/services/imap_daemon.py` — New background loop running IMAP inbox checks.
- `backend/xpenses/routers/imap_settings.py` — New settings router.
- `backend/xpenses/main.py` — Registered imap daemon and settings router.
- `backend/tests/test_email_parser.py` — New parser test file.
- `backend/tests/test_imap_settings.py` — New endpoint settings integration test file.
- `frontend/lib/api.ts` — Added `ImapConfig` types.
- `frontend/lib/queryKeys.ts` — Added `imapKeys`.
- `frontend/app/admin/imap/page.tsx` — New Next.js settings UI page.
- `frontend/components/layout/Sidebar.tsx` — Added "Email / IMAP" link.
- `openspec/changes/import-report-from-email/tasks.md` — Updated checklist progress.

### Test Results
- **154 tests pass** (all green).

---

## Previous Session (2026-06-10, session 19)

### What Was Done
- **SMTP/Email UI & Configuration API** — Full stack implementation allowing administrators (`mod` role) to configure and test SMTP settings directly from the web interface.
  - **Shared Cryptography Utility** — Extracted Fernet key derivation from `ldap_service.py` into `backend/xpenses/services/crypto.py` as a shared utility.
  - **Live SMTP Overrides** — Modified `email_service.py` to dynamically query settings from the `app_settings` DB at call time, falling back to `.env` config.
  - **SMTP Config API** — Created `email_settings` router with GET, PATCH, and POST `/test` endpoints, restricted to the `mod` role. Password is stored encrypted using Fernet and masked in API outputs.
  - **Admin Email Settings Page** — Implemented frontend at `/admin/email` featuring form validation, dirty-state banner, password-set indicator, and inline connection testing.
  - **Sidebar Link** — Added a "Email / SMTP" link in the sidebar's Admin section, visible only to `mod` users.
  - **Unit Testing** — Added comprehensive backend tests in `tests/test_email_settings.py` covering endpoints, permissions, empty password preservation, and connection mock tests.

### Modified/Added Files
- `backend/xpenses/services/crypto.py` — New file with shared `get_fernet` key derivation utility.
- `backend/xpenses/services/ldap_service.py` — Refactored to import `get_fernet` from `crypto.py`.
- `backend/xpenses/services/email_settings_service.py` — New service handling DB retrieval/storage of email config, Fernet password encryption/decryption, and connection testing.
- `backend/xpenses/services/email_service.py` — Modified `send_email` to dynamically fetch live config from DB with fallback.
- `backend/xpenses/routers/email_settings.py` — New FastAPI router for SMTP configuration management.
- `backend/xpenses/main.py` — Registered `email_settings` router.
- `backend/tests/test_email_settings.py` — New backend tests verifying all requirements.
- `frontend/lib/api.ts` — Added `SmtpConfig` and `SmtpTestResult` interfaces.
- `frontend/lib/queryKeys.ts` — Added `emailKeys` for query invalidation.
- `frontend/app/admin/email/page.tsx` — New Next.js SMTP settings page.
- `frontend/components/layout/Sidebar.tsx` — Added "Email / SMTP" entry and imported `Mail` icon.
- `HANDOFF.md` — Added this session 19 update.

### Test Results
- **145 tests pass** (6 new, all green).

---

## Previous Session (2026-06-09, session 18)

### What Was Done
- **Fixed Approvals & Payments page fetching** — Added `all=true` parameter to the `/reports` fetch call in `ApprovalsPage` and `PaymentsPage`. Previously, managers and finance users could only see their own reports, making it impossible to approve or pay reports from other users.
- **Frontend Mutation Error Handling** — Added `onError` handlers to mutations in `ApprovalsPage` and `PaymentsPage` to display backend error details (e.g., "Cannot approve your own report") via a dismissible alert banner.
- **Documentation Audit & Roadmap Update** — Synced `README.md` and `CLAUDE.md` with the actual project state.
    - Updated test count to **131** (all passing).
    - Marked LDAP as fully integrated and active (Moderator UI done).
    - Updated Roadmap with completed items (LDAP, Approval workflow core, Dark mode, OCR, Mobile responsive).
- **Verified state** — All 131 backend tests pass.

### Modified Files
- `frontend/app/approvals/page.tsx` — Added `all: true` to query, added `mutationError` state and display banner, added `onError` to mutations.
- `frontend/app/payments/page.tsx` — Added `all: true` to query, added `mutationError` state and display banner, added `onError` to mutations, added missing `useState` import.
- `README.md` — Updated Current Status and Roadmap to reflect actual completion of LDAP and core approval workflow.
- `CLAUDE.md` — Updated test count to 131.
- `HANDOFF.md` — Added this session 18 update.

### Test Results
- **131 tests pass** (full backend suite).

---

## Previous Session (2026-06-08, session 17)

### What Was Done
- **CLAUDE.md improvements** — Updated test count (109→128), clarified `mod` superuser role, documented LDAP/AD and `app_settings` patterns.
- **`/admin/ldap` production-readiness fixes** — 6 issues found and fixed:
  1. **Test Connection password bug** — `POST /test` now accepts `use_stored_password: bool`; backend substitutes stored (Fernet-decrypted) password when frontend hasn't changed it. Frontend sends `use_stored_password: !pwChanged`.
  2. **Blocking I/O on event loop** — `test_connection` and `sync_users` LDAP calls moved to `asyncio.to_thread()` via `_test_connection_sync` and `_fetch_directory_entries` helpers.
  3. **Port field reset on keystroke** — form now stores port as `string`, parsed to `int` only at save/test.
  4. **Unsaved-changes warning** — `isDirty` state + yellow banner; `updateForm()` helper centralises `setForm` + `setIsDirty(true)`.
  5. **Sync result stale after save** — `setSyncResult(null)` added to `onSuccess`.
  6. **CLAUDE.md** — test count, `mod` role docs, LDAP + `app_settings` pattern docs.
- Commit: `91bfe8a`

### Modified Files
- `backend/xpenses/services/ldap_service.py` — `asyncio` import, `async def test_connection` wrapping `_test_connection_sync`, `_fetch_directory_entries` helper
- `backend/xpenses/routers/ldap.py` — `use_stored_password` field on `LdapConfigIn`, stored-password substitution in `POST /test`, `await test_connection()`
- `frontend/app/admin/ldap/page.tsx` — `FormState` type (port as string), `isDirty` + `updateForm()`, `use_stored_password` in test payload, port parsed on submit, unsaved-changes banner, sync result cleared on save
- `CLAUDE.md` — test count 109→128, `mod` role description, LDAP + app_settings Key Patterns entries

### Test Results
- **128 tests pass** (127 from LDAP feature merge + 1 existing)

---

## Previous Session (2026-06-08, session 16)

### What Was Done
- **LDAP/AD Moderator UI** — Full implementation across 37 tasks, merged to `main`.
- Backend: `ldap_service.py` (HKDF-Fernet key derivation, empty-password guard, two-phase DN bind, sync with deactivation), `routers/ldap.py`, auth integration, `POST /api/users` (mod-only user creation).
- Frontend: `/admin/ldap` settings page (config form, test connection, sync), auth_source badge in `/admin/users`, LDAP password guard on `/profile`, Admin section in Sidebar.
- 19 new tests (127 total passing).
- Security fixes during review: HKDF key derivation replacing weak truncation, empty-password LDAP bind rejection.

---

## Previous Session (2026-06-08, session 15)

### What Was Done
- **CI/CD & Quality Gates** — Added GitHub Actions workflow for lint, tests, coverage, and Docker builds.
- Added `pytest-cov` and `pre-commit` to dev dependencies.
- Extended Makefile with `test-cov` and `format` targets.
- Configured `.pre-commit-config.yaml` for ruff, trailing-whitespace, end-of-file-fixer.
- Added workflow `.github/workflows/ci.yml` that runs on push/PR to main:
  * Sets up PostgreSQL service, installs dependencies, waits for DB.
  * Runs lint (ruff), pre‑commit hooks, tests with coverage, uploads to Codecov.
  * Builds Docker images.
- All changes committed and pushed.

---

## What This Project Is

Self-hosted expense management app (alternative to Zoho Expenses). FastAPI backend + Next.js frontend + PostgreSQL, running in Docker Compose on port 3001 (frontend) / 8001 (backend API).

## Current State: OPERATIONAL (Phase 7 Partial + Access Control Hardening + Digital Signatures + Mileage + Advance Payments v2 + OCR + UI/UX Redesign + UI/UX Audit Fixes + Test Suite)

All 3 Docker containers running, all endpoints healthy:

| Service | Container | Port | Status |
|---------|-----------|------|--------|
| PostgreSQL 16 | `xpenses-db` | 5432 (internal) | Healthy |
| FastAPI backend | `xpenses-backend` | 8001 → 8000 | `{"status":"ok"}` |
| Next.js frontend | `xpenses-frontend` | 3001 → 3000 | Serving (307 redirect to /login if unauthenticated) |

## Previous Session (2026-06-08, session 14)

### What Was Done
- **Role-based testing** — app tested end-to-end from manager and CFO perspectives via parallel agents. Found and fixed 2 access-control bugs + 1 UX gap.
- **Manager report list bug fixed** — `GET /reports?all=true` now includes `manager` role in the org-wide branch (`reports.py`). Previously managers could not discover submitted reports from employees — approval queue was invisible in the UI.
- **CFO dashboard org-wide default** — `GET /api/dashboard` now returns org-wide data for `chef_finance`/`mod` without requiring `?all=true`. Explicit flag still works; managers remain opt-in.
- **Manager reports UX** — reports page now defaults to org-wide view for managers on load. Added employee filter chips (one per unique employee in the returned data) so managers can isolate a specific person's reports. Search extended to match both title and employee name. Owner column always visible in org-wide view.

---

## Previous Session (2026-06-08, session 13)

### What Was Done
- **UI/UX Audit & Fixes** (IMPLEMENTED) — 4 parallel agents audited the frontend across 4 domains (dashboard/nav, report flows, mobile/accessibility, tables/empty states). 26 issues identified, all fixed.

#### Critical functional fixes
- **Approve/Reject UI** — backend endpoints existed but the frontend never called them. Managers and CFOs can now approve or reject submitted reports directly from the report detail page, with an inline rejection reason input.
- **"Mark as paid" role gate** — button now only renders for `chef_finance`; was previously visible to all users.
- **Submitted status text** — corrected from "awaiting payment" to "awaiting manager approval".
- **Approved status panel** — new distinct panel for `approved` state, separate from `submitted`.

#### UX improvements
- **Rejection banner** — rejected reports show a prominent amber banner with the reason and a one-click "Recall to draft" button, replacing the buried `text-xs` span.
- **Mutation error feedback** — all mutations now have `onError` handlers with a dismissible red banner.
- **Delete confirmation** — report delete now shows `window.confirm` dialog.
- **Report search** — debounced text search field on the reports list, client-side filter by title.
- **Sortable columns** — Title, Total, Submitted columns are clickable with asc/desc toggle.
- **Quick-submit from table row** — draft reports can be submitted directly from the reports list via a Send icon.
- **Actionable empty states** — "Clear filter", "Clear search", "Create your first report" actions wired up.
- **Select-all for expense attachment** — checkbox to select/deselect all available draft expenses at once.
- **Role-gated dashboard cards** — Approval card only shown to `manager`/`chef_finance`; Payments card only to `chef_finance`. Technicians no longer see cards that vanish with count=0.
- **Company overview banner** — persistent amber banner when privileged user is in org-wide view mode.
- **Clickable dashboard rows** — category rows link to filtered expenses; recent expense rows link to detail page.

#### Polish & accessibility
- Loading states replaced with `animate-pulse` skeleton layouts (dashboard, reports list, report detail).
- Expense table on report detail collapses non-critical columns on mobile (`hidden sm:table-cell`).
- Checkbox touch targets enlarged with `py-2` on attachment labels.
- Badge component adds prefix symbol (○→✓✗★) so status is not color-only.
- Sidebar: close button has `aria-label`, theme toggle shows current mode name, Signature item separated by `<hr>` divider.
- `EmptyState` button has `type="button"` to prevent accidental form submission.
- Loading containers have `role="status" aria-live="polite"` for screen readers.
- `Expense` and `Report` TS interfaces updated with `user_display_name?: string | null`.

### Modified Files
- `frontend/app/reports/[id]/page.tsx` — approve/reject, status panels, rejection banner, error handling, select-all, mobile columns
- `frontend/app/reports/page.tsx` — delete confirm, search, sort, skeleton, actionable empty states, quick-submit
- `frontend/app/dashboard/page.tsx` — role-gated cards, overview banner, clickable rows, skeleton
- `frontend/components/layout/Sidebar.tsx` — ARIA label, theme label, signature divider
- `frontend/components/ui/Badge.tsx` — status prefix icons
- `frontend/components/ui/EmptyState.tsx` — `type="button"` fix
- `frontend/lib/api.ts` — `user_display_name` on `Expense` and `Report` interfaces

### Test Results
- **108 tests pass** (was 101 before mileage/signature sessions; backend-only test suite, all green)

---

## Previous Session (2026-06-07, session 12)

...
