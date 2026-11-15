# Codebase Audit Remediation Checklist (`xpenses-kotlin`)

Generated from comprehensive security, business logic, async/OCR pipeline, and frontend audit.

---

## 1. Critical Bugs & Security Issues (Must Fix Immediately)

- [x] **C1. Fix 60s OCR Job Lease Timeout Cascade & Infinite Retry Storms**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt:118-148, 317-334`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/OcrJobRepository.kt:109, 272, 288-337`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OpenAiCompatibleClient.kt:54-108`
  - **Issue:** `AsyncOcrService.processJob` acquires a 60s lease while `OpenAiCompatibleClient` uses a 60s timeout per call across up to 2 attempts/model and 4 models. Failure updates require `lease_until > :now` so timed-out updates affect 0 rows, and `reclaimExpired` ignores `MAX_ATTEMPTS`, causing infinite retry storms.
  - **Fix:** Increase OCR stage lease to `300s`, remove `AND lease_until > :now` from `recordPermanentFailure`/`recordTransientFailure` (keep `status = 'PROCESSING' AND lease_token = :leaseToken`), and enforce `attemptCount >= MAX_ATTEMPTS` before `reclaimExpired`.

- [x] **C2. Reset `OcrJob.attemptCount` on Stage Completion and Manual Recovery**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/OcrJobRepository.kt:97-147, 205-220`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrRecoveryService.kt:69-77, 130-138`
  - **Issue:** `claimEligible` increments `attempt_count` on every stage (`OCR`, `EXPENSE`, `RECEIPT`), never resetting it on stage advance or manual retry/completion, exhausting `MAX_ATTEMPTS` (3) on healthy 3-stage jobs and failing retried jobs immediately.
  - **Fix:** Reset `attempt_count = 0, next_attempt_at = NULL` in `completeOcrStage` and `completeExpenseStage`, and reset `job.attemptCount = 0` in `OcrRecoveryService.retry()` and `completeManually()`.

- [x] **C3. Stop In-Place Secret Masking from Corrupting Cached `StorageConfigDto`**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/CacheConfig.kt:28-31`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AppSettingsService.kt:226-289`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt:384-412`
  - **Issue:** `storage-config-cache` uses `storeByValue(false)`. `maskStorageSecrets` mutates the cached `StorageConfigDto` in place with `"••••••••"`, poisoning S3/SMB/WebDAV/SFTP credentials for 5 minutes and causing test/save failures.
  - **Fix:** Return a defensive deep copy when masking secrets (`maskStorageSecrets` / `maskedCopy`) so the cached DTO is never mutated.

- [x] **C4. Close Rate-Limiting Bypasses (`ForwardedHeaderFilter`, XFF Leftmost Spoofing, Missing PDF Export & Per-User Login Limits)**
  - **Location:** `backend-kotlin-jpa/src/main/resources/application.yml:91-92`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/RateLimitingFilter.kt:33, 38-44, 97-119`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt:49-85`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/InMemoryRateLimitStore.kt`
  - **Issue:** `server.forward-headers-strategy: framework` overwrites `remoteAddr` from untrusted `Forwarded` headers; `extractClientIp` picks the leftmost (client-controlled) XFF IP; login has no per-account limit; `EXPORT_REPORT_PATH` misses `/export` & `/export-csv`; and `InMemoryRateLimitStore` evicts keys in arbitrary hash order on overflow.
  - **Fix:** Remove `forward-headers-strategy: framework`, walk `X-Forwarded-For` right-to-left skipping trusted proxies, include `export|export-csv` and `/api/reports/import-order` in `RateLimitingFilter`, add per-username login rate limiting, and evict oldest entries in `InMemoryRateLimitStore`.

- [x] **C5. Fix Advance Payment Authorization & Tampering Flaws**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AdvanceController.kt:64-65, 138-357`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt:219-240`
  - **Issue:** `AdvanceController` uses `canViewAll` instead of `canManage` (allowing `mod` to pay/edit/delete advances); report owners can edit or hard-delete manager-paid advances on draft/recalled reports or delete the draft report to wipe paid advances; and managers/CFO can pay/reject their own advance requests.
  - **Fix:** Use `authorization.canManage` for privileged advance writes, forbid owners from editing/deleting advances with `paidBy != null` or `status == "paid"`, forbid self-payment/rejection on `payAdvance`/`rejectAdvance`, and block `deleteDraft` when paid advances exist.

- [x] **C6. Restrict Local Storage Root Path Reconfiguration & Validate S3 Endpoint Against SSRF**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt:95-151`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/S3StorageProvider.kt:39-41`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt:392-412`
  - **Issue:** `PATCH /api/settings/storage` lets `mod` set `local.path` to arbitrary container paths (enabling orphan scan/delete on arbitrary directories) and accepts unvalidated `s3.endpoint` URLs allowing internal SSRF.
  - **Fix:** Restrict `local.path` in `StorageService.validateConfig` to canonical paths inside `/app/data` (or temp dir in tests), and validate `s3.endpoint` via `PublicAddressDnsResolver`.

- [x] **C7. Cap Unbounded PDF Render Dimensions in `OcrService.renderPdfPages` (OOM / PDF Bomb)**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt:818-837`
  - **Issue:** `.coerceIn(1.5f, 2.5f)` forces a minimum `1.5x` render scale even on oversized PDF `mediaBox` pages, causing multi-GB `BufferedImage` allocations and JVM OOM.
  - **Fix:** Change scale clamp to `.coerceIn(0.1f, 2.5f)` so large PDF pages scale down to ~1800px max dimension.

- [x] **C8. Fix `LazyInitializationException` Risks in `AsyncOcrService` and `OcrController` with `open-in-view: false`**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt:186, 210, 226`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/OcrController.kt:142-153, 354-379`
  - **Issue:** Field-access entity proxies (`user`, `report.user`, `expense.category`) have `.id` / properties accessed outside open Hibernate sessions.
  - **Fix:** Resolve `current.user` inside `transactionTemplate.execute` in `AsyncOcrService.processExpenseStage`, wrap `OcrController.validateReportContext` in a read transaction, and annotate `getOcrComparisons` `@Transactional(readOnly = true)` with `LEFT JOIN FETCH e.category`.

- [x] **C9. Fix Frontend `useFormGuard` Navigation Trap & Broken Dashboard "Approve Advance" / "Download Report" Buttons**
  - **Location:** `frontend/lib/useFormGuard.ts:27-51, 71-74`, `frontend/components/expenses/ExpenseForm.tsx:807-814`, `frontend/app/reports/new/page.tsx:268-273`, `frontend/app/dashboard/DashboardClient.tsx:174-186, 508-514`
  - **Issue:** Confirming browser Back in `useFormGuard` strands the user on the form and Cancel triggers duplicate confirms; Dashboard "Approve Advance" sends an empty body to `/pay` (always `400`); Dashboard "Download Report" calls non-existent `/expenses/export-csv` without `.catch()`.
  - **Fix:** Trigger `window.history.back()` when leaving via `popstate` confirm and call `clearDirty()` before navigating on Cancel; send `{ amount, currency, date }` in `handlePayAdvance`; fix `downloadBlob` target to `/expenses/export?format=csv` with error toast handling.

- [x] **C10. Purge Offline Receipt & OCR IndexedDB Stores and Sync Status on Logout**
  - **Location:** `frontend/components/AuthProvider.tsx:473-516`, `frontend/lib/offlineQueue.ts:11-52`, `frontend/lib/ocrSourceQueue.ts:106-108`
  - **Issue:** Logout clears React Query cache (`xpenses-cache`) but retains `xpenses-offline`, `xpenses-ocr-sources`, and `xpenses_offline_sync_status`, exposing previous users' receipt photos and expense drafts on shared devices.
  - **Fix:** Delete `xpenses-offline` and `xpenses-ocr-sources` IndexedDB databases and remove `xpenses_offline_sync_status` from `localStorage` during `logout()`.

---

## 2. Moderate Bugs & Edge Cases (Likely to Cause Issues in Production)

- [x] **M1. Close State-Machine Holes on Rejected & Recalled Reports (Mutations & Stale Signatures)**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt:78-93, 130-163`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt:186-188, 242-253, 497-499`
  - **Issue:** Expenses on rejected reports can be edited/deleted/moved without recalling the report; `recall`/`reject` retain stale `signer`/`signedAt`.
  - **Fix:** Block mutations in `ExpenseService` when `expense.report != null && expense.report?.status != "draft"` (and block moving already-attached expenses), and clear `signer` / `signedAt` on `recall` and `reject`.

- [x] **M2. Prevent `submit()` / Child Mutation Races, Stale `totalAmount`, and Zero-Amount Pre-Attached Expenses**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt:38-75, 264-296`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt:130-165, 178-256`
  - **Issue:** Concurrent child mutations race with `submit()`, `totalAmount` stays `0.00`/stale on draft/recalled reports, and pre-attached zero-amount expenses bypass `submit()` validation.
  - **Fix:** Lock parent draft report on child attachment/mutation, recompute `totalAmount` on attach/recall/expense edits, and reject zero/non-positive expenses in `submit()`.

- [x] **M3. Prevent `CurrencyApiRateProvider` `latest` Historical Poisoning & Invalidate/Correct `fx_margins` Behavior**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fx/FxRateProvider.kt:118-144, 211-242`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt:33-68`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AppSettingsService.kt:137-221`
  - **Issue:** `fetchCurrencyApi` falls back to `latest` for historical dates without checking `sourceDate <= requestedDate`, caching today's rate permanently under historical dates; `fx_margins` updates don't invalidate `fx_rates`, and USD default margin differs between `FxService` and `AppSettingsService`.
  - **Fix:** Use dated fallback `https://$requestedDate.currency-api.pages.dev/...`, enforce `sourceDate <= requestedDate`, invalidate cached `fx_rates` when margins change, and unify USD default margin.

- [x] **M4. Convert Non-EUR `requestedAmount` to EUR in `DashboardController.getManagerDashboard`**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/DashboardController.kt:141-159`
  - **Issue:** Pending advances in non-EUR currencies (e.g. `5,000 RON`) are summed directly as EUR into `pendingAdvancesTotalEur` and `PendingAdvanceSummary.amountEur`.
  - **Fix:** Convert `requestedAmount` from `requestedCurrency` via `fxService.convert(...)`.

- [x] **M5. Fix Idempotent `/api/ocr/scan` Replay Race, Stuck `PAUSED` Jobs, and Deleted-Expense Wedge in `RECEIPT` Stage**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/OcrController.kt:120-215`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt:268-315`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrRecoveryService.kt:103-122`
  - **Issue:** Concurrent idempotent `scanReceipt` calls while uploading overwrite job state; crashes leave `PAUSED` jobs with `expires_at = NULL` un-cancellable; deleting a draft expense before `RECEIPT` stage permanently wedges `OcrJob` in `PERMANENT_FAILURE`.
  - **Fix:** Set `expiresAt` on `OcrJob` creation, allow cancelling `PAUSED` jobs, lock in `acceptExisting`, cancel cleanly in `processReceiptStage` when the expense is missing, and check `existsById` in `OcrRecoveryService`.

- [x] **M6. Fix Infinite IMAPS Timeouts (`mail.imaps.*`), Missing TLS Hostname Checks, `@Async`+`@Scheduled` Overlap & `DuplicateKeyException` in Email Ingestion**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/ingestion/JavaMailMailboxAdapter.kt:58-75`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailSettingsService.kt:165-183`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/ingestion/TechnicianEmailIngestionScheduler.kt:11-15`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/ingestion/ImapIngestionLedger.kt:16-67`
  - **Issue:** Port 993 uses `imaps` which ignores `mail.imap.*` timeouts; `ssl.checkserveridentity` is unset; `@Async` + `@Scheduled(fixedDelay)` causes overlapping IMAP polls and `DuplicateKeyException` in `ImapIngestionLedger.claim()`; failed emails retry forever.
  - **Fix:** Configure both `mail.imap.*` and `mail.imaps.*` timeouts and `ssl.checkserveridentity = "true"`, remove `@Async` from `poll()`, use `ON CONFLICT (message_key) DO NOTHING`, and cap max attempts.

- [x] **M7. Sanitize/Bound LLM Strings & Amounts to Prevent `ocr_result_cache` Poisoning and Negative-Amount Bulk Upload Crashes**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt:446, 537-571, 839-855`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/BulkExpenseController.kt:144-168`
  - **Issue:** Oversized `merchant` (>255) or `amount` (>= 10^10) cached in `ocr_result_cache` crashes `saveComparisonFromResult` on every subsequent cache hit; negative OCR amounts pass to `ExpenseCreate` in bulk upload and fail DB check constraint.
  - **Fix:** Truncate `merchant`/`filename` to 255 chars and bound `amount` in `OcrService`, wrap `saveComparisonFromResult` in `runCatching`, and clamp `.max(BigDecimal.ZERO)` in `BulkExpenseController`.

- [x] **M8. Increment `tokenVersion` on Role/Active Changes, Remove Pre-Auth Enumeration Timing Oracle, and Cap BCrypt Password Size at 72 Bytes**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/UserController.kt:92-143`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/LdapService.kt:225-252`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt:55-84`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/auth/LoginRequest.kt`, `ChangePasswordRequest.kt`, `UserCreateRequest.kt`
  - **Issue:** Role changes and deactivation don't bump `tokenVersion`; inactive/LDAP checks short-circuit BCrypt timing; >72-byte passwords throw unhandled `IllegalArgumentException` (HTTP 500) in `BCryptPasswordEncoder`.
  - **Fix:** Bump `tokenVersion` and delete refresh tokens on role change and deactivation; run dummy BCrypt check on inactive users before returning 403; add `@field:Size(max = 72)` on password DTO fields.

- [x] **M9. Fix `OcrComparison` `comparison_id` IDOR, HTTP 500s on Invalid `page`/`size`/`date`, `fxRateManual` Reset, and Non-Unique `findByEmail` Crash**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt:68-70, 166-172, 193-223`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt:96-98`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/FxController.kt:26-43`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/UserRepository.kt:16-19`
  - **Issue:** `comparison_id` overwrites unowned `OcrComparison.expense`; invalid `page`/`size` or `date` causes 500s; `updateExpense` ignores `fx_rate_manual=false`; duplicate/blank emails crash `findByEmail`.
  - **Fix:** Guard `comparison.expense == null || comparison.expense?.id == savedExpense.id`, clamp `page`/`size`, catch `DateTimeParseException` in `FxController.quote`, handle `body.fxRateManual` in `updateExpense`, and safely query non-blank emails ordered by `isActive DESC, id ASC`.

- [x] **M10. Fix `PdfService` Dropped Receipt Images & Storage Access, Insurance Filename Collisions, and ZIP Entry Sanitization**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt:669-707`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt:94-144`, `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt:504-526`
  - **Issue:** Missing images on disk cause `PdfPTable(2)` incomplete-row drop of the last receipt image; `getLocalPath` bypasses S3 and calls `mkdirs()`; insurance uploads collide within 1s and lack magic-byte check; ZIP entries need full path-char sanitization and failure logging.
  - **Fix:** Track `addedCells` and load image bytes via `storageService.downloadFile` in `PdfService`; add UUID + magic-byte validation to `InsuranceController.uploadFile`; sanitize ZIP entry names and log catch warnings.

- [x] **M11. Fix Frontend Raw `<img>`/`<iframe>` Auth & CSP Failures, Uncompressed Edit/Retry Uploads, Blob URL Leak, SSR Hydration Mismatches & Comma-Decimal Parsing**
  - **Location:** `frontend/components/expenses/ReceiptPreview.tsx:94-140`, `frontend/components/expenses/BulkReviewDrawer.tsx:351-368, 589-611`, `frontend/app/profile/signature/page.tsx:100-104`, `frontend/next.config.ts:17-39`, `frontend/components/expenses/ExpenseForm.tsx:184-199, 268-273`, `frontend/i18n/LocaleProvider.tsx`, `frontend/components/layout/Sidebar.tsx:51-56`, `frontend/lib/format.ts`
  - **Issue:** Raw `<img>` tags fail after 15-min cookie expiry and PDF `<iframe>` hits CSP/X-Frame-Options; edit/retry uploads skip `compressImage`; `ExpenseForm` leaks `blob:` URLs on file removal; `LocaleProvider` & `Sidebar` mismatch SSR hydration; numeric inputs truncate Romanian comma decimals (`"12,5"` -> `12`).
  - **Fix:** Use `<AuthorizedImage />`, update CSP (`frame-src 'self' blob:`, `connect-src 'self'`), compress edit/retry uploads, revoke `fileUrls` in `useEffect`, fix `isDesktop` & locale initialization, and add `parseLocaleNumber`.

---

## 3. Performance & Architecture Improvements (High-ROI Refactors)

- [x] **P1. Move Blocking External HTTP, LDAP & Storage I/O Out of `@Transactional` Database Transactions**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailImportService.kt:434-457, 521-615`, `ExpenseService.kt:97-114`, `AuthController.kt:50-81`, `LdapService.kt:284-293`, `AppSettingsService.kt:390-415`
  - **Issue:** Long external LLM, FX, LDAP (missing user-bind timeout), and file-cleanup calls run inside active `@Transactional` blocks, risking HikariCP pool exhaustion.
  - **Fix:** Remove outer `@Transactional` around external I/O, use `TransactionTemplate` for DB writes, and add 5s LDAP user-bind timeouts + `config.userFilter` check.

- [x] **P2. Eliminate Hibernate In-Memory Pagination (`HHH90003004`) on Dashboard & Unbounded Queries in OCR/IMAP/Search**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/ExpenseReportRepository.kt:78-84`, `DashboardController.kt:62-70, 173-193`, `OcrController.kt:357`, `ImapIngestionLedger.kt:193-213`, `SearchController.kt:26-56`
  - **Issue:** `@EntityGraph(attributePaths = ["expenses", "user"])` combined with `Pageable` forces Hibernate to load all reports in memory; `findLatestWithExpenses(1)` returns `0.00` when the newest draft is empty; OCR comparisons, IMAP recovery, and search run without SQL `LIMIT`.
  - **Fix:** Drop `"expenses"` from `@EntityGraph` on `Pageable` queries (relying on batch fetch), fetch page size 5 for last non-empty report, and add `Pageable`/`LIMIT` bounds to OCR comparisons, IMAP ledger recovery, and search.

- [x] **P3. Replace Per-Request Thread Pools in `BulkExpenseController` with `ocrTaskExecutor` & Fix Per-File Quota Counting**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/BulkExpenseController.kt:67-134`
  - **Issue:** Spawns unbounded `Executors.newFixedThreadPool` per request instead of shared `ocrTaskExecutor`, and charges 1 OCR quota hit for up to 20 files.
  - **Fix:** Dispatch onto injected `ocrTaskExecutor` and charge quota per OCR-eligible file.

- [x] **P4. Close AWS `S3Client` & Mail `Store`/`Transport` Resources and Bound IMAP Folder Reads**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/StorageProvider.kt`, `S3StorageProvider.kt:27-44`, `StorageService.kt`, `EmailSettingsService.kt:112-117, 229-234`, `JavaMailMailboxAdapter.kt:19-56`
  - **Issue:** `S3Client` pools and SMTP/IMAP transports leak on error/test/reconfigure; `readUnseen()` buffers entire inbox bodies at once and `markSeen()` reconnects per message.
  - **Fix:** Implement `AutoCloseable` on `StorageProvider`/`S3StorageProvider` and close temporary instances, wrap mail transports/stores in `try/finally`, and batch `readUnseen()`.

- [x] **P5. Fix SSR `HydrationBoundary` Query Key Mismatches & Conditionally Mount Dynamic Drawers**
  - **Location:** `frontend/app/expenses/page.tsx:20` vs `ExpensesClient.tsx:244`, `frontend/app/reports/page.tsx:15` vs `ReportsClient.tsx:176`, `frontend/app/profile/[id]/ProfileDetailClient.tsx:49`, `frontend/app/expenses/ExpensesClient.tsx:400`, `DashboardClient.tsx:838`, `ReportsClient.tsx:1049`, `app/approvals/page.tsx:203`
  - **Issue:** SSR prefetches seed query keys that don't match client `useQuery` keys (100% cache miss + orphaned IndexedDB entries); dynamic drawers mount eagerly when closed.
  - **Fix:** Align SSR & client query keys and gate dynamic drawers behind open-state conditionals.

---

## 4. Quick Wins & Cleanup (Low-Effort Polish)

- [x] **Q1. Harden Production Defaults (`DataInitializer`, Swagger, `.env.example`)**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt:22`, `SecurityConfig.kt:59`, `application-prod.yml`, `.env.example:31`
  - **Issue:** `DataInitializer` runs in `prod` if `SEED_DEMO_USERS=true`; `.env.example` defaults `SWAGGER_ENABLED=true` while `application-prod.yml` doesn't force `springdoc` disabled.
  - **Fix:** Block demo user seeding under `prod` profile, set `SWAGGER_ENABLED=false` in `.env.example`, and disable springdoc in `application-prod.yml`.

- [x] **Q2. Clean Up Kotlin Compiler Warnings (Dead Elvis Operators, Deprecated `JsonNode.asText()` & `HttpStatus` Constants)**
  - **Location:** `InsuranceController.kt`, `ReportController.kt`, `AsyncOcrService.kt`, `OcrService.kt`, `LdapService.kt`, `SaveIdempotencyService.kt`, `FxRateProvider.kt`
  - **Issue:** `compileKotlin` emits 48 compiler warnings for redundant `?:`, unnecessary `!!`, and deprecated Jackson 3 / Spring 7 calls.
  - **Fix:** Remove dead Elvis operators / `!!` and migrate `.asText()` -> `.asString()`.

- [x] **Q3. Forward Search/Verification Filters in `ExpenseController.exportExpenses` & Compute Real `avgTurnaroundDays`**
  - **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt:209-236`, `ExpenseService.kt:704-720`, `DashboardController.kt:170`, `MileageController.kt:173-186`
  - **Issue:** Expense CSV/XLSX export omits `q` and `verification_state`; `avgTurnaroundDays` is hardcoded `1.2`; `MileageController.updateMileage` skips recalculation on pre-V32 rows and recalculates twice on date+distance change.
  - **Fix:** Forward `q` and `verification_state` in export, compute turnaround from `submittedAt`/`approvedAt` (with fallback `1.2`), and consolidate mileage recalculation.

- [x] **Q4. Improve Frontend Modal Accessibility (`role="dialog"`, `Escape`, Scroll Lock) & Replace Hardcoded Date Locales**
  - **Location:** `frontend/components/dashboard/SlideOverReviewDrawer.tsx:41-43`, `frontend/app/profile/[id]/ProfileDetailClient.tsx:242-244`, `frontend/app/insurance/page.tsx:136-140`, `frontend/app/dashboard/DashboardClient.tsx:260`, `frontend/app/reports/new/page.tsx:68`, `frontend/app/reports/[id]/ReportDetailClient.tsx:701`, `frontend/app/reports/[id]/mileage/page.tsx:21`
  - **Issue:** Modals lack ARIA dialog roles/Escape dismissal/scroll lock, and date formatters hardcode `"en-US"`/`"en-GB"` instead of the active locale.
  - **Fix:** Add `role="dialog" aria-modal="true"`, Escape listeners, and `useBodyScrollLock`, and route date formatting through the active locale (`useLocaleContext` / `lib/format.ts`).
