# Codebase Concerns

**Analysis Date:** 2026-08-14

## Tech Debt

**Bypassed `@Async` Proxying via Self-Invocation in Report Notifications:**
- Issue: `ReportLifecycleNotificationAdapter.dispatch()` invokes internal methods (`notifySubmitted`, `notifyApproved`, `notifyRejected`, `notifyPaid`) directly on `this`, completely bypassing Spring's CGLIB/JDK proxy mechanism for `@Async`.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ReportLifecycleNotificationAdapter.kt`
- Why: Implemented as a quick event dispatcher inside the same bean without injecting a self-reference or delegating to a dedicated notification service.
- Impact: Email dispatches (which involve blocking SMTP network I/O) execute synchronously on the incoming HTTP request thread, increasing API response times and risking request thread starvation under load.
- Fix approach: Inject self-reference via `@Lazy` or move the notification delivery logic into a dedicated `@Service` component so Spring's proxy intercepts async invocations.

**Database Connection Held Across Async OCR Processing:**
- Issue: `@Transactional` is placed at the method level on `AsyncOcrService.processOcr()`, keeping a HikariCP database transaction and connection open while executing the multi-tier OCR pipeline (Gemini / Tesseract / Vision).
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- Why: Wrapped around the entire task lifecycle for convenient status updates (`processing` -> `completed` / `failed`).
- Impact: Because Gemini API calls can take 10–60+ seconds per receipt, background OCR jobs exhaust the HikariCP connection pool, stalling ordinary user HTTP requests and database operations.
- Fix approach: Remove `@Transactional` from `processOcr()`; use granular `TransactionTemplate` or isolated `@Transactional(propagation = Propagation.REQUIRES_NEW)` helper methods strictly for state transitions (`processing`, `completed`, `failed`).

**External FX Rate HTTP Calls Inside Open Transactions:**
- Issue: `ExpenseService.updateExpense()` executes under `@Transactional` while invoking `fxService.getRate()`, making synchronous HTTP requests to external exchange rate providers (BNR/ECB) while holding database connection locks.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AdvanceController.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt`
- Why: FX conversion was placed directly inline with entity mutation logic.
- Impact: If external rate providers latency-spike or timeout (up to 40s), database connections remain tied up, degrading overall database throughput.
- Fix approach: Resolve and cache the exchange rate before opening or committing the database transaction, passing the resolved rate into the mutating transactional method.

**Storage Provider Fallback and Non-Atomic Upload Staging:**
- Issue: In `StorageService`, unsupported storage provider configurations (`smb`, `webdav`, `sftp`) silently fall back to `LocalStorageProvider`. Furthermore, `ExpenseService.uploadReceipts()` writes files to disk/cloud storage iteratively before saving database records.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/StorageService.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/LocalStorageProvider.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt`
- Why: Incremental implementation of multi-file upload and storage backend adapters.
- Impact: If the database transaction fails on file N of M, previously written files are orphaned in storage. Unsupported cloud configurations quietly store sensitive receipts on the local filesystem.
- Fix approach: Explicitly reject unsupported storage provider types with configuration errors. Stage uploads in temporary storage or execute cleanup hooks if the enclosing transaction rolls back.

**Frontend Query Key Inconsistencies and Cache Fragmentation:**
- Issue: Query keys in React Query are constructed inconsistently across views (e.g. `["expenses", "list", { status: "", category_id: "" }]` vs `["expenses", "list", statusFilter, categoryFilter]`, and unnormalized `list()` vs `list({})`).
- Files: `frontend/app/expenses/page.tsx`, `frontend/app/expenses/ExpensesClient.tsx`, `frontend/lib/queryKeys.ts`, `frontend/app/reports/[id]/ReportDetailClient.tsx`
- Why: Handcrafted query key factories without unified normalizer functions.
- Impact: Server-side prefetch cache misses on the client, causing double-fetching on page transitions, redundant network calls, and hydration state mismatches.
- Fix approach: Standardize query key factories in `frontend/lib/queryKeys.ts` with consistent serialization and object normalization.

---

## Known Bugs

**Rate Limiter IP Spoofing and Unbounded Memory Retention:**
- Symptoms: Rate limiting on `/api/auth/login`, `/api/auth/refresh`, and `/api/ocr/scan` can be bypassed by sending arbitrary `X-Forwarded-For` or `X-Real-IP` headers from untrusted clients. Additionally, internal timestamp tracking structures can leak memory.
- Trigger: Issuing requests with rotating fake headers when `rate-limiting.trusted-proxies` is empty or misconfigured.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/RateLimitingFilter.kt`
- Workaround: Deploy strictly behind a reverse proxy that strips client-supplied `X-Forwarded-For` headers.
- Root cause: `extractClientIp()` trusts forwarded headers without verifying whether `request.remoteAddr` originates from a validated reverse proxy IP. In-memory rate limit maps lacked automated TTL eviction.
- Fix: Enforce proxy IP whitelist verification before reading header IP values, and ensure all rate limit stores prune expired timestamps.

**Stuck Drag-and-Drop Overlay in Expense Bulk Upload:**
- Symptoms: When dragging files over `BulkUploadZone` and dropping onto the portal overlay, the full-screen drop overlay remains permanently visible and blocks user interaction.
- Trigger: Dragging files over the browser window and releasing the mouse button directly over the portalled drag overlay.
- Files: `frontend/components/expenses/BulkUploadZone.tsx`, `frontend/app/expenses/ExpensesClient.tsx`
- Workaround: Refreshing the browser page.
- Root cause: `dragCounterRef` is only decremented by the wrapper element's `onDragLeave` and `onDrop`, which do not trigger when the portalled backdrop intercepts the drop event.
- Fix: Reset drag counter states inside `handleFilesDropped` and add an explicit `onDragLeave` / `onDrop` handler to the portalled overlay element.

**Silent Failure on Bulk Upload Mutations:**
- Symptoms: When bulk expense creation fails on the server, the drawer shows "No expenses created" without displaying error feedback or retry options.
- Trigger: Uploading receipts with invalid data or triggering a 400/500 response from `/api/expenses/bulk`.
- Files: `frontend/components/expenses/BulkReviewDrawer.tsx`
- Workaround: Inspecting developer tools network console.
- Root cause: Missing `onError` callback handler on the React Query mutation in `BulkReviewDrawer.tsx`.
- Fix: Add structured error handling and banner alerts displaying failed items and backend validation messages.

**Proactive Refresh Token Race Condition:**
- Symptoms: Users intermittently get logged out unexpectedly while actively browsing the application.
- Trigger: Proactive timer refresh (`PROACTIVE_REFRESH_MS`) fires simultaneously with an API call receiving a 401 response.
- Files: `frontend/lib/auth.ts`, `frontend/lib/api.ts`, `frontend/components/AuthProvider.tsx`
- Workaround: Re-logging into the application.
- Root cause: Proactive `refreshTokens()` call in `AuthProvider` bypasses the Axios interceptor's `isRefreshing` synchronization queue, triggering concurrent refresh requests that invalidate one another's refresh tokens.
- Fix: Route proactive refreshes through the centralized Axios refresh queue in `frontend/lib/api.ts`.

**Unbounded In-Memory PDF Receipt Merging:**
- Symptoms: Server encounters high GC pressure or `OutOfMemoryError` during report PDF export.
- Trigger: Exporting an expense report that contains dozens of multi-megabyte PDF receipt attachments.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt`
- Workaround: Limit receipt attachment sizes before report compilation.
- Root cause: `generateReportPdf()` loads all PDF receipt files into a `mutableListOf<ByteArray>` in JVM heap before performing PDFBox document concatenation.
- Fix: Stream PDF merge operations using temporary files or PDFBox `MemoryUsageSetting.setupTempFileOnly()`.

---

## Security Considerations

**Stored XSS and Insecure Content-Type in Insurance File Downloads:**
- Risk: Attackers can upload HTML/SVG files disguised as images or documents. When downloaded, the server echoes the client-supplied `fileType` without `Content-Disposition: attachment` or `X-Content-Type-Options: nosniff`, allowing JavaScript execution in the origin context.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt`
- Current mitigation: Basic file extension and size checks.
- Recommendations: Enforce server-side magic-byte MIME detection, force `Content-Disposition: attachment; filename="..."`, serve generic binary streams as `application/octet-stream`, and append `X-Content-Type-Options: nosniff` headers.

**CSV / Formula Injection in Expense and Report Exports:**
- Risk: Malicious expense descriptions, merchants, or user display names starting with `= `, `+ `, `- `, `@ `, or `\t` can execute arbitrary formulas or commands when opened in Microsoft Excel / LibreOffice.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt`
- Current mitigation: Standard string escaping for commas and quotes.
- Recommendations: Prefix all formula-triggering characters (`=`, `+`, `-`, `@`, `\t`, `\r`) with a single quote (`'`) during CSV serialization.

**Local Storage Path Traversal Vulnerability:**
- Risk: In `LocalStorageProvider`, receipt or export paths constructed with relative segments (`../`) could escape the configured storage base directory if sanitization is bypassed.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/StorageService.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/LocalStorageProvider.kt`
- Current mitigation: Remote/S3 paths canonicalize paths, but local operations rely on caller-provided normalized paths.
- Recommendations: Explicitly check that `destinationPath.toRealPath().startsWith(baseStorageDir.toRealPath())` on all file read/write/delete operations.

**CSRF Origin Validation Breaking Non-Browser Clients:**
- Risk: Strict `Origin` and `Referer` matching in `SecurityConfig` returns 403 Forbidden to automated API integrations, background workers, or CLI tools that do not emit browser headers.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt`
- Current mitigation: Origin check on state-changing requests.
- Recommendations: Allow requests presenting valid Bearer tokens or explicit API keys to bypass browser-specific CSRF origin validation.

---

## Performance Bottlenecks

**JPA N+1 Lazy Loading in Report and Expense Listing:**
- Problem: Fetching lists of expense reports or expenses executes one query for the primary entities and dozens/hundreds of subsequent queries for associated relations.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ExpenseMapper.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt`
- Measurement: 800ms–2.5s response time on report list queries with 50+ items.
- Cause: `ReportMapper.mapReportToOut()` iterates over `report.expenses`, `report.advances`, `report.mileageRecords`, and invokes `expenseMapper.toExpenseOut()` which touches `expense.receipts`. In addition, `calculateDailyAllowance` performs an `appSettingRepository.findById` lookup for each report.
- Improvement path: Apply JPA `@EntityGraph` (e.g. `["expenses", "expenses.receipts", "advances", "mileageRecords"]`), fetch daily allowance settings once prior to mapping, and execute queries in `@Transactional(readOnly = true)` contexts with Open-Session-in-View (OSIV) disabled.

**Unbounded Pagination and Memory Aggregation in Dashboard:**
- Problem: Large data sets cause significant latency and excessive JVM memory allocation on dashboard and search endpoints.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/DashboardController.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/SearchController.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt`
- Measurement: Dashboard manager overview loads the entire table into memory before calling `.take(10)`.
- Cause: Missing database-level SQL aggregation (`SUM`, `COUNT`, `GROUP BY`) and missing upper bounds on `page` / `size` request parameters.
- Improvement path: Migrate dashboard analytics to JPQL/native SQL aggregations with Spring Data `Pageable` limits (clamped to max 100).

**Synchronous OCR Execution Thread Saturation:**
- Problem: `/api/ocr/scan` handles OCR processing synchronously on incoming Tomcat HTTP request threads.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/OcrController.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- Measurement: 10 concurrent scan requests can lock 10 Tomcat worker threads for 30–60 seconds each.
- Cause: Direct HTTP blocking call to Gemini API rather than enqueuing into async job processors.
- Improvement path: Throttle synchronous scan endpoints with a semaphore and encourage the async queue workflow (`/api/ocr/jobs`) with webhook/polling notifications.

---

## Fragile Areas

**Expense Report State Machine and Optimistic Locking:**
- Why fragile: State transitions (`draft` -> `submitted` -> `approved` -> `paid` -> `rejected` -> `recalled`) involve complex validations across multiple entities (expenses, advances, mileage, signatures).
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/ExpenseReport.kt`
- Common failures: Concurrent operations (such as approving while adding an expense, or double-submitting) trigger raw `OptimisticLockException` resulting in 500 errors instead of user-friendly 409 Conflict messages. Recall operations may leave stale signature or rejection metadata.
- Safe modification: Encapsulate state mutations in dedicated domain methods, handle `OptimisticLockException` with retry hints or clean 409 status codes, and add exhaustive concurrency unit tests.
- Test coverage: Basic lifecycle flows tested; concurrent modification and race condition edge cases lack integration tests.

**FX Rate Provider Fallback and Caching:**
- Why fragile: Multi-source fallback (BNR -> ECB -> configured defaults) with margin calculations and historical date lookups.
- Files: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fx/FxRateProvider.kt`
- Common failures: Fallback rates obtained from previous banking days could be erroneously cached under requested weekend/holiday dates rather than the source rate date.
- Safe modification: Ensure database schema preserves both `rate_date` and `source_date`, and verify cache keys against ADR 0001 specifications.
- Test coverage: Unit tests exist in `FxServiceTest`, but live provider fallback network partitions need mocking.

---

## Scaling Limits

**HikariCP Database Connection Pool:**
- Current capacity: 10–20 connections (default Hikari pool configuration).
- Limit: ~15 concurrent long-running requests (OCR sync scans, slow FX lookups, or heavy PDF exports).
- Symptoms at limit: `ConnectionTimeoutException` ("Connection is not available, request timed out after 30000ms"), causing 500 errors across unrelated endpoints.
- Scaling path: Isolate external network calls outside transactions, reduce transaction holding times, and configure dedicated thread pools for background operations.

**Single-Instance File Storage:**
- Current capacity: Local disk capacity (e.g. 50–100 GB).
- Limit: Multi-replica containerized deployment without distributed shared storage.
- Symptoms at limit: Receipts uploaded on Node A are missing when requested from Node B.
- Scaling path: Configure `S3StorageProvider` with AWS S3, MinIO, or Cloudflare R2 for multi-node deployments.

---

## Dependencies at Risk

**Gemini API SDK / Model Deprecations:**
- Risk: Fast iteration on Google Gemini model endpoints (e.g. `gemini-1.5-flash` / `gemini-2.0-flash`) can lead to deprecated API endpoints or changing response schemas.
- Impact: Receipt OCR scanning could fail silently or return invalid structured JSON.
- Migration plan: Maintain strict contract versions (`CACHE_CONTRACT_VERSION`), encapsulate model names in `application.yml` settings, and enforce JSON schema response modes.

**PDFBox 3.x Migration / Memory Management:**
- Risk: Large receipt image embedding and font loading in Apache PDFBox can trigger significant heap fragmentation.
- Impact: Exporting consolidated reports with large receipt archives degrades server throughput.
- Migration plan: Configure stream-based scratch files and enforce strict image compression before PDF rendering.

---

## Missing Critical Features

**Asynchronous File Upload Processing and Virus Scanning:**
- Problem: Uploaded attachments are processed directly in request memory without async queueing or antivirus/malware inspection.
- Current workaround: File size and MIME type checks.
- Blocks: Enterprise security compliance.
- Implementation complexity: Medium (ClamAV container or S3 bucket event trigger).

**Automated Stuck OCR Job Reaper:**
- Problem: If a backend node crashes while processing an asynchronous OCR job, the job record remains in `status = "processing"` indefinitely.
- Current workaround: Manual database status updates.
- Blocks: Clean async queue monitoring and automatic user retries.
- Implementation complexity: Low (Scheduled Spring task finding jobs in `processing` for > 15 minutes and resetting to `failed`).

---

## Test Coverage Gaps

**Concurrent Report State Transitions:**
- What's not tested: Simultaneous approval, rejection, expense attachment, and advance settlement on the same report instance.
- Risk: Race conditions resulting in unhandled `OptimisticLockException` or inconsistent financial totals.
- Priority: High
- Difficulty to test: Requires multi-threaded Spring integration tests using `CountDownLatch` or `CompletableFuture`.

**Storage Provider Failover and Migration Engine:**
- What's not tested: Live migration between `LocalStorageProvider` and `S3StorageProvider` during active user uploads.
- Risk: Corrupted file references or dropped receipts during storage migration.
- Priority: Medium
- Difficulty to test: Requires Testcontainers with MinIO and fault injection.

---

*Concerns audit: 2026-08-14*
*Update as issues are fixed or new ones discovered*
