# Technical audit

**No source or configuration files were edited during the audit.** This audit covers the **current working tree**, including its substantial uncommitted OCR and frontend changes. It does not assume the running production images contain those changes.

**Overall assessment:** The application has meaningful security and lifecycle safeguards. The largest remaining risks are **destructive receipt handling, concurrent stale writes, browser-side confidentiality, and inconsistent financial calculations**. A broad rewrite is not justified; focused corrections would reduce risk substantially.

Confidence below refers to the traced implementation. Unless stated otherwise, concurrency and failure scenarios were not reproduced end-to-end.

## 1. How the application actually works

### Repository and technology

- `backend-kotlin-jpa/`: Kotlin/Spring Boot application, Gradle, Java 21.
  - Current build uses **Kotlin 2.4.0 / Spring Boot 3.5.16**; README versions lag behind.
  - Spring MVC, Security, JPA/Hibernate, Flyway, PostgreSQL, Redis, Caffeine.
  - Gemini OCR, LDAP, Jakarta Mail/IMAP, local/S3 storage, PDFBox/OpenPDF, Apache POI.
- `frontend/`: **Next.js 16, React 19, TypeScript**, TanStack Query, Tailwind, English/Romanian translations.
  - Separate frontend application—not Kotlin-rendered templates.
  - Server-prefetched pages, client components, IndexedDB queues, service worker.
- `docker-compose.yml`: frontend, backend, PostgreSQL and Redis; persistent database, Redis and application-data volumes.
- `CONTEXT.md` and `docs/adr/`: important domain decisions, including intentionally at-least-once expense recovery.

### Main workflows

**Authentication**

1. Login checks a local password or LDAP.
2. Access JWT and random refresh token are issued in cookies.
3. Refresh tokens are stored as hashes.
4. Each authenticated request reloads the user and checks active status and token version.
5. Backend permissions—not frontend visibility—govern access.

**Expenses and receipts**

- `ExpenseController` delegates to `ExpenseService`.
- Owners create/edit/delete draft expenses and attach receipts.
- FX rates and EUR amounts are stored with expenses.
- Receipt writes have rollback cleanup; normal deletion schedules file removal after commit.

**Asynchronous OCR**

- An upload creates a durable `OcrJob` and stages its source.
- Workers advance through `OCR → EXPENSE → RECEIPT`.
- Database compare-and-set operations fence stages with lease tokens.
- Completion supplies the frontend with the created expense and receipt IDs.
- Failed extraction can produce a photo-only draft.

**Reports and approval**

- `ExpenseReportLifecycle` owns attachment, submission, recall, approval, rejection, payment and signing.
- Submission changes attached expenses to submitted and snapshots their expense-only EUR total.
- Managers/finance approve or reject; finance marks reports paid.
- Rejection intentionally returns expenses to draft.
- Advances and mileage still contain substantial business logic in controllers.
- Final reimbursement is calculated separately in the API mapper and PDF service.

**Email**

- Report notifications use asynchronous, best-effort SMTP.
- Delegation emails use an IMAP processing ledger.
- Intended design: commit report creation and ledger completion together, then acknowledge the mailbox separately.

## 2. Verification performed

| Check | Result |
| --- | --- |
| Backend `bootJar`, incremental Gradle build | Passed |
| Seven targeted backend unit-test classes | **98 tests passed** |
| PostgreSQL-backed `OcrJobRepositoryTest` | Passed |
| PostgreSQL-backed `ExpenseReportLifecycleTest` | **13 tests passed** |
| Frontend TypeScript check | Passed |
| Frontend ESLint | Passed |
| Translation parity | Passed: **924 keys** |
| Three targeted mobile Chromium tests | Passed |
| Translation/audit-policy script tests | Passed |
| `npm audit` | **Two fixable HIGH advisories** |
| Production-only npm audit | **One HIGH advisory** |

Gradle used `--no-daemon`, one worker, and in-process Kotlin compilation. Database tests used disposable PostgreSQL, not production. Production services remained healthy.

**Not run:** full backend suite, full browser suite, frontend production build, Docker rebuild, deployed security/concurrency exercises, or backup restoration. This follows the production-host guardrails.

There is no configured coverage report establishing a meaningful line/branch coverage percentage. Passing tests therefore should not be interpreted as comprehensive coverage.

---

# P0 — Critical

Backend paths below are relative to:

`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/`

## P0.1 — Stale authentication principals can overwrite account-security changes

**Files/classes:** `security/JwtAuthenticationFilter.kt`; `model/User.kt`; `controllers/UserController.kt:updateMe`; `controllers/SignatureController.kt`; `controllers/AuthController.kt:changePassword`.

- **Current behavior:** Authentication stores a complete `User` entity on the request. Several endpoints mutate and save that earlier snapshot. `User` has no optimistic version.
- **Problem:** Saving profile/signature fields can also merge stale role, active status, password hash or token version.
- **Scenario:** A manager starts a delayed profile update; an administrator deactivates/demotes them; the profile update finishes and restores the previous security fields.
- **Recommended fix:** Use an immutable authenticated actor. Reload users inside mutation transactions, update only permitted fields, and add version/locking protection with concurrent revocation tests.
- **Complexity:** medium. **Confidence:** high.

## P0.2 — Browser caches can expose another account’s financial data

**Files/classes:** `frontend/lib/queryPersister.ts`; `frontend/lib/queryKeys.ts`; `frontend/components/Providers.tsx`; `frontend/components/AuthProvider.tsx`; `frontend/public/sw.js`; authenticated server-prefetched pages.

- **Current behavior:** Personalized queries share one IndexedDB record and identity-independent keys. Automatic authentication failure does not purge these caches. The service worker also caches navigation HTML containing dehydrated authenticated data.
- **Problem:** Account isolation is missing across both persisted query data and cached HTML. Explicit logout cleanup also races pending persistence writes.
- **Scenario:** Manager A’s session expires; Technician B signs in on the same browser and receives A’s cached reports/dashboard, particularly offline.
- **Recommended fix:** Scope private caches to verified identity; cancel persistence and purge private cache layers on every identity transition. Cache a static offline shell rather than authenticated HTML.
- **Complexity:** medium. **Confidence:** high.

**Boundary:** This is browser-side confidentiality exposure, not a demonstrated remote backend authorization bypass.

## P0.3 — Receipt filenames collide and overwrite accounting evidence

**Files/classes:** `services/StorageService.kt:StorageContext.RECEIPT,storeFile`; `services/ExpenseService.kt:uploadReceipts,deleteSingleReceipt`; `services/storage/LocalStorageProvider.kt:upload`; `services/storage/S3StorageProvider.kt`; `controllers/InsuranceController.kt:uploadFile`.

- **Current behavior:** Normal receipt paths use year/month, expense ID and sanitized filename—without a unique object identifier. Providers overwrite existing objects. Insurance paths use second-resolution timestamps.
- **Problem:** Different database records can reference the same bytes. Rollback cleanup or deletion of one record can remove another record’s evidence.
- **Scenario:** Two different `receipt.jpg` files are attached to one expense during the same month. The second replaces the first; deleting either attachment removes the shared file.
- **Recommended fix:** Generate immutable UUID/object-ID paths, retain original names as metadata, and enforce path uniqueness. Cleanup must only remove objects owned by the failed operation.
- **Complexity:** medium. **Confidence:** high.

## P0.4 — “Orphan receipt” cleanup deletes valid files from other workflows

**Files/classes:** `services/AppSettingsService.kt:findOrphanReceiptFiles,cleanOrphanReceipts`; `controllers/AppSettingsController.kt:cleanOrphans`; `repositories/ReceiptRepository.kt`; `controllers/InsuranceController.kt`; `services/OcrJobLifecycle.kt`.

- **Current behavior:** Cleanup recursively scans the shared storage root and considers only paths referenced by receipt rows valid.
- **Problem:** Insurance documents, active OCR sources and in-flight staged receipt objects are not receipt-row references.
- **Scenario:** An administrator runs cleanup while OCR is processing. Its source disappears; insurance documents can also be deleted despite valid insurance records.
- **Recommended fix:** Make cleanup storage-context-aware and account for every owning table and active staging operation. Use a quarantine/grace period and recheck references before deletion.
- **Complexity:** medium. **Confidence:** high.

**Operational recommendation:** Do not use the current destructive cleanup action until this is corrected.

## P0.5 — Custom soft deletion does not safely enforce optimistic locking

**Files/classes:** `model/Expense.kt:13`; `model/ExpenseReport.kt:13`; `model/Receipt.kt`; `services/ExpenseService.kt:deleteExpense`; `report/lifecycle/ExpenseReportLifecycle.kt:deleteDraft`.

- **Current behavior:** Custom delete SQL checks the old version but does not increment it or require an affected-row count. Hibernate’s default custom-delete outcome verification is none.
- **Problem:** A stale delete can silently affect zero parent rows while receipt deletion commits. Conversely, deletion leaves the version unchanged, allowing a stale update to potentially restore `deleted=false`.
- **Scenario:** Submission wins a race against deletion; the expense remains active, but its receipts and physical files are removed.
- **Recommended fix:** Use version-incrementing, row-count-verified soft deletion or explicit versioned transitions. Failed parent deletion must roll back child mutations and prevent file cleanup.
- **Complexity:** medium. **Confidence:** high.

---

# P1 — Important bugs and reliability problems

## P1.1 — Report transitions race child mutations

**Files/classes:** `report/lifecycle/ExpenseReportLifecycle.kt`; `services/ExpenseService.kt:doCreateExpense`; `controllers/MileageController.kt`; `controllers/AdvanceController.kt`; `repositories/ExpenseReportRepository.kt`.

- **Current behavior:** Child operations check report status without locking/updating the parent; transitions use ordinary reads.
- **Problem:** Row-level `@Version` does not enforce cross-row report invariants.
- **Scenario:** Expense creation reads “draft”; submission commits; creation then inserts a draft expense into the submitted report. Advance payment can similarly change settlement after report payment.
- **Recommended fix:** Adopt one report-aggregate locking/version protocol across transitions and all child mutations.
- **Complexity:** medium. **Confidence:** high.

## P1.2 — Lost responses create duplicate expenses, receipts and OCR jobs

**Files/classes:** `frontend/lib/expenseSaving.ts`; `frontend/lib/offlineQueue.ts`; `frontend/lib/receiptCapture.ts`; `services/ExpenseService.kt`; `controllers/OcrController.kt`.

- **Current behavior:** Local operation UUIDs are not sent as server idempotency keys. Retries repeat POST operations when acknowledgements are lost.
- **Problem:** Committed work and failed responses are indistinguishable to recovery.
- **Scenario:** An expense commits, mobile connectivity drops before its response, and reconnection creates another expense.
- **Recommended fix:** Owner-scoped operation keys, transactional uniqueness, and replayable results for expense creation, OCR submission and receipt batches.
- **Complexity:** medium. **Confidence:** high.

This limitation is explicitly accepted by ADR 0002; it remains a material risk, not an accidental exactly-once implementation failure.

## P1.3 — PDF reimbursement excludes mileage (Intentional Accounting Policy)

> [!NOTE]
> **Resolution / Domain Rule:** This is **not a bug**. Accounting explicitly requested and confirmed that mileage is excluded from the PDF reimbursement settlement summary (`totalReimbursable`). Mileage is tracked and itemized separately. See `CONTEXT.md`.

**Files/classes:** `services/PdfService.kt:558–562`; `services/mapper/ReportMapper.kt:107–111`; `src/test/kotlin/eu/nt/xpenses/services/PdfServiceTest.kt`.

- **Current behavior:** PDF computes mileage but excludes it from reimbursement. The API includes it.
- **Problem:** Accounting documents and application totals disagree.
- **Scenario:** €100 expenses + €50 allowance + €30 mileage − €20 advances produces **€160 in the API, €130 in the PDF**.
- **Accounting policy:** Accounting intentionally specified that mileage is handled separately and must not be folded into the PDF net reimbursable total.
- **Complexity:** None needed (intentional behavior). **Confidence:** high.

## P1.4 — Historical settlement and signature evidence are mutable

**Files/classes:** `services/mapper/ReportMapper.kt`; `services/PdfService.kt`; `model/ExpenseReport.kt`; `report/lifecycle/ExpenseReportLifecycle.kt:recall,sign`; `controllers/SignatureController.kt`.

- **Current behavior:** Historical allowance uses today’s global rate. Signing stores a user reference/time; recall does not invalidate it, and PDFs load the user’s current signature image.
- **Problem:** Paid totals and signed evidence can change without a new approval/signature.
- **Scenario:** A rate increase changes an old paid report’s reimbursement. Separately, a signed report is recalled, increased from €100 to €500, and resubmitted with its old signature timestamp.
- **Recommended fix:** Snapshot allowance/settlement at an agreed lifecycle boundary; bind signatures to report content/version and immutable signature objects; invalidate them after relevant changes.
- **Complexity:** medium. **Confidence:** high.

## P1.5 — Historical FX fallback can use today’s rate

**Files/classes:** `services/fx/FxRateProvider.kt:fetchCurrencyApi,CurrencyApiRateProvider.parse`; `services/FxService.kt:getRate`.

- **Current behavior:** Failed dated lookup falls back to a latest-rate endpoint. The parser permits future source dates and substitutes the requested date when provenance is missing.
- **Problem:** Today’s rate can be permanently cached under a historical expense date.
- **Scenario:** An old UAH receipt falls through to the latest provider and receives an incorrect historical reimbursement rate.
- **Recommended fix:** Require valid dated provenance no later than the requested date; use historical/prior-day fallback, not latest.
- **Complexity:** small. **Confidence:** high.

## P1.6 — FX cache contention cannot recover inside an aborted transaction

**Files/classes:** `services/FxService.kt:35–59`; `services/ExpenseService.kt`; transactional advance/mileage operations; `model/FxRate.kt`.

- **Current behavior:** Concurrent cache inserts can violate uniqueness. The catch block tries to read the winning row in the same enclosing business transaction.
- **Problem:** PostgreSQL has already aborted that transaction; catching the exception does not repair it.
- **Scenario:** Concurrent expenses for a newly encountered currency/date fail despite a usable rate having just been cached.
- **Recommended fix:** Conflict-safe SQL upsert or isolated cache-insertion transaction, followed by a valid read.
- **Complexity:** medium. **Confidence:** high.

## P1.7 — Final submission does not consistently reject incomplete expenses

**Files/classes:** `report/lifecycle/ExpenseReportLifecycle.kt:submit,attachDraftExpenses`; `services/ExpenseService.kt`; `services/OcrJobLifecycle.kt:processExpenseStage`.

- **Current behavior:** Positive amounts are required when attaching supplied IDs, but preattached expenses are not revalidated. OCR FX failure persists rate `1` for non-EUR currencies and marks it manual.
- **Problem:** Incomplete drafts or placeholder conversions can become approved financial claims.
- **Scenario:** A preattached expense is edited to zero and submitted. Alternatively, FX failure turns 120 RON into €120 and submission has no unresolved-FX guard.
- **Recommended fix:** Validate every final expense at submission, including amount, date, currency and confirmed FX. Persist unresolved FX explicitly rather than masquerading as an accepted manual rate.
- **Complexity:** medium. **Confidence:** high.

## P1.8 — IMAP body reads acknowledge messages before durable processing

**Files/classes:** `ingestion/JavaMailMailboxAdapter.kt:readUnseen,withFolder,getText`; `ingestion/TechnicianEmailIngestionService.kt:poll`.

- **Current behavior:** Messages are read in a writable folder with default non-PEEK content reads, before ledger claims.
- **Problem:** Mail content retrieval can set `SEEN`; polling subsequently considers only unseen messages.
- **Scenario:** A crash while materializing a batch leaves earlier messages seen without a ledger entry or report.
- **Recommended fix:** PEEK/read-only retrieval, separate explicit acknowledgement, and ledger-driven recovery independent of unseen search.
- **Complexity:** medium. **Confidence:** high.

## P1.9 — Parser outages become permanent delegation rejection

**Files/classes:** `services/EmailImportService.kt:parseDelegationEmailGemini,parseDelegationEmailAsync`; `ingestion/DelegationEmailParserAdapter.kt`; `ingestion/TechnicianEmailIngestionService.kt`.

- **Current behavior:** Provider exceptions become `null`; unsuccessful local fallback becomes permanent rejection.
- **Problem:** Timeouts, 429s and provider outages are treated like invalid content.
- **Scenario:** A valid unstructured delegation requires Gemini during an outage and is acknowledged/rejected instead of retried.
- **Recommended fix:** Preserve typed transient/permanent provider outcomes through the concrete parser adapter.
- **Complexity:** medium. **Confidence:** high.

## P1.10 — Default IMAPS connections lack the intended timeouts

**Files/classes:** `ingestion/JavaMailMailboxAdapter.kt:withFolder`; `services/EmailSettingsService.kt:testImapConnection`.

- **Current behavior:** Timeout properties use `mail.imap.*`, while port 993 selects `imaps`.
- **Problem:** Protocol-specific `mail.imaps.*` settings are missing.
- **Scenario:** A stalled server leaves polling or an administrator’s connection test blocked indefinitely.
- **Recommended fix:** Configure connect/read/write timeouts for the selected protocol; test stalled-server behavior.
- **Complexity:** small. **Confidence:** high.

## P1.11 — LDAP user bind can hold database transactions indefinitely

**Files/classes:** `controllers/AuthController.kt:login`; `services/LdapService.kt:authenticateLdap,bindServiceAccount`.

- **Current behavior:** Service-account bind is bounded, but the separate user bind lacks timeouts. Login already holds a database transaction. Ordinary LDAP authentication exceptions also become “unavailable.”
- **Problem:** Directory failures can exhaust request threads/JDBC connections and misreport bad passwords as 503.
- **Scenario:** Several stalled LDAP logins affect unrelated expense requests.
- **Recommended fix:** Bound every LDAP operation, classify credential failures correctly, and authenticate outside the short token-persistence transaction.
- **Complexity:** medium. **Confidence:** high.

## P1.12 — Concurrent legitimate refreshes can invalidate sessions

**Files/classes:** `controllers/AuthController.kt:refresh`; `repositories/RefreshTokenRepository.kt`; `frontend/lib/api.ts`; `frontend/components/AuthProvider.tsx`.

- **Current behavior:** Refresh lookup/delete/insert is unlocked. A missing token clears cookies and can revoke the user’s sessions. Frontend coordination is not cross-tab.
- **Problem:** Legitimate simultaneous refreshes resemble replay.
- **Scenario:** Two tabs wake after expiry; one rotates successfully and the other clears shared cookies or revokes the successor session.
- **Recommended fix:** Atomic consumption/token-family handling, a deliberate concurrency policy, and cross-tab refresh coordination.
- **Complexity:** medium. **Confidence:** high.

## P1.13 — Secret masking mutates the cached storage configuration

**Files/classes:** `controllers/AppSettingsController.kt:readStorageSettings`; `services/AppSettingsService.kt:maskStorageSecrets,restoreStoredSecrets`; `services/StorageService.kt:getStorageConfig`; `config/CacheConfig.kt`.

- **Current behavior:** Configuration is cached by reference; response masking mutates that same object.
- **Problem:** Later connection tests/configuration updates retrieve placeholder passwords instead of real decrypted secrets.
- **Scenario:** Opening storage settings causes a subsequent “keep existing secret” update or connection test to fail.
- **Recommended fix:** Immutable internal configuration and separately constructed redacted response DTOs; never mutate cached secrets for presentation.
- **Complexity:** small. **Confidence:** high.

## P1.14 — Storage migration switches configuration before successful migration

**Files/classes:** `services/AppSettingsService.kt:updateStorageSettings`; `services/StorageService.kt:saveStorageConfig,startMigration`; `services/storage/StorageMigrationEngine.kt`; `JdbcStorageMigrationStateStore.kt`.

- **Current behavior:** The new provider/root becomes active before copying completes. Work runs in an executor; durable file claims have no automatic restart/reclaim workflow.
- **Problem:** Interrupted migration can leave valid files inaccessible and status stuck. Migration includes receipts, not all objects sharing storage.
- **Scenario:** Changing a custom local root and restarting mid-copy leaves uncopied files only in the old root.
- **Recommended fix:** Two-phase migration/cutover, temporary old-provider reads, complete object inventory, and persisted resumable jobs with lease recovery.
- **Complexity:** large. **Confidence:** high.

## P1.15 — Toast rendering aborts unrelated offline synchronization

**Files/classes:** `frontend/components/ToastProvider.tsx:76`; `frontend/components/OfflineSyncProvider.tsx:syncOnce` and synchronization effect.

- **Current behavior:** Toast context is a fresh object every render. Synchronization depends on it; effect cleanup aborts active work.
- **Problem:** Showing/dismissing a notification changes synchronization lifecycle.
- **Scenario:** A slow upload is aborted when an unrelated toast disappears, potentially after backend commit.
- **Recommended fix:** Memoize context values, depend on stable functions, and tie cancellation to identity/unmount rather than notifications.
- **Complexity:** small. **Confidence:** high.

## P1.16 — Expense PATCH cannot reliably clear fields or reset manual FX

**Files/classes:** `frontend/components/expenses/ExpenseForm.tsx`; `FxRateInput.tsx`; `BulkReviewDrawer.tsx`; `dto/expense/ExpenseUpdate.kt`; `services/ExpenseService.kt:updateExpense`.

- **Current behavior:** Explicit null and omission are indistinguishable; non-null checks preserve fields users cleared. “Revert to automatic” omits FX fields while the backend preserves the existing rate.
- **Problem:** Successful saves do not perform the requested changes.
- **Scenario:** Incorrect OCR merchant/category remains after clearing; an accidental manual FX override remains after choosing automatic.
- **Recommended fix:** Presence-aware PATCH semantics and explicit automatic/manual FX commands; initialize UI mode from persisted state.
- **Complexity:** medium. **Confidence:** high.

## P1.17 — Month export boundaries shift in Romanian time zones

**Files/classes:** `frontend/app/expenses/ExpensesClient.tsx:exportRangeToParams`.

- **Current behavior:** Local-midnight month boundaries are converted to UTC before extracting the date.
- **Problem:** Positive UTC offsets shift boundaries backward.
- **Scenario:** September export becomes **August 31–September 29**, including/excluding the wrong expenses.
- **Recommended fix:** Format calendar dates without UTC conversion; test multiple time zones.
- **Complexity:** small. **Confidence:** high — reproduced with `Europe/Bucharest`.

## P1.18 — Forwarded-header processing undermines proxy trust checks

**Files/classes:** `backend-kotlin-jpa/src/main/resources/application.yml`; `security/RateLimitingFilter.kt:extractClientIp`; `config/SecurityConfig.kt`.

- **Current behavior:** Framework forwarding rewrites `remoteAddr` before the limiter examines whether the immediate peer is trusted.
- **Problem:** The limiter may inspect a client-supplied rewritten address rather than the socket peer.
- **Scenario:** An ingress that does not overwrite malicious forwarded headers permits rotating rate-limit identities.
- **Recommended fix:** Establish one trusted forwarding boundary using the original peer, and require ingress header stripping/overwriting. Test the complete filter chain.
- **Complexity:** medium. **Confidence:** medium — filter interaction is established; deployed ingress exploitability was not verified.

---

# P2 — Architecture, maintainability and hardening

## P2.1 — Mail TLS is optional rather than required

**Files/classes:** `services/EmailSettingsService.kt`; `ingestion/JavaMailMailboxAdapter.kt`.

- **Current behavior:** STARTTLS is enabled but not required; connection-test behavior also differs from runtime.
- **Problem:** Credential-bearing connections can continue without TLS.
- **Scenario:** A misconfigured server or downgrade removes STARTTLS.
- **Recommended fix:** Explicit transport-security modes; require TLS for remote credential-bearing connections and share test/runtime configuration.
- **Complexity:** small. **Confidence:** high.

## P2.2 — Delegation sender trust depends on an undocumented ingress guarantee

**Files/classes:** `ingestion/JavaMailMailboxAdapter.kt`; `TechnicianEmailIngestionService.kt:hasExplicitAuthenticationFailure`; `services/EmailImportService.kt:hasActiveSender`; ADR 0003.

- **Current behavior:** Ownership derives from `From`; only selected SPF/DKIM failure strings are rejected. DMARC alignment/trusted authentication-service identity is not evaluated.
- **Problem:** Authentication success for an unrelated domain does not authenticate the technician’s `From`.
- **Scenario:** A delivered forged-From message with DMARC failure creates a technician-owned draft.
- **Recommended fix:** Enforce/document aligned sender verification at a trusted gateway or parse only trusted authentication results.
- **Complexity:** medium. **Confidence:** medium — delivery policy is unknown.

Missing authentication headers alone are intentionally allowed by ADR 0003; this is not a payment-approval bypass.

## P2.3 — External I/O remains inside business transactions

**Files/classes:** `services/ExpenseService.kt`; `controllers/AdvanceController.kt`; `controllers/MileageController.kt`; `services/fx/FxRateProvider.kt`.

- **Current behavior:** Transactions wait for FX providers and receipt storage operations.
- **Problem:** Slow providers consume database connections and enlarge conflict windows.
- **Scenario:** Concurrent mobile saves during FX/S3 degradation exhaust the connection pool.
- **Recommended fix:** Prepare external results outside transactions; authorize/revalidate/persist in short transactions with compensation.
- **Complexity:** medium. **Confidence:** high.

## P2.4 — Date and financial-unit validation is inconsistent

**Files/classes:** expense/report DTOs; `services/FxService.kt:getRate`; `repositories/ExpenseRepository.kt`; `services/mapper/ReportMapper.kt`; `controllers/ReportController.kt`.

- **Current behavior:** Dates are strings; EUR bypasses date parsing. Invalid allowance dates become zero. Report currency can label a total calculated in EUR.
- **Problem:** Invalid chronology or incorrect monetary labels persist silently.
- **Scenario:** `01.06.2026` is stored for a EUR expense and disappears from expected date filters; a USD-labelled report exports an EUR-summed total.
- **Recommended fix:** Typed `LocalDate`, effective-field range validation, and an explicit canonical EUR total currency.
- **Complexity:** medium. **Confidence:** high.

## P2.5 — Legacy mileage edits retain incompatible old amounts

**Files/classes:** `controllers/MileageController.kt:updateMileage,recalculate`; migrations `V31__add_mileage_fx_snapshot.sql`, `V32__add_mileage_fuel_calculation_snapshots.sql`.

- **Current behavior:** Historical rows have null fuel/tax snapshots. Distance changes persist, but recalculation returns early.
- **Problem:** Displayed distance and reimbursement no longer correspond.
- **Scenario:** An old draft changes from 50 km to 100 km but retains its previous amount.
- **Recommended fix:** Explicit legacy calculation handling, deliberate upgrade, or rejection of unsupported edits—not silent partial mutation.
- **Complexity:** small. **Confidence:** high.

## P2.6 — Tests miss the highest-risk production boundaries

**Files/classes:** `src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt`; lifecycle/controller/PDF tests; `frontend/playwright.config.ts`; `.github/workflows/ci.yml`.

- **Current behavior:** Many backend tests share rollback transactions and mocked providers. Browser tests block service workers. CI browser coverage runs only the mobile smoke file.
- **Problem:** Commit behavior, contention, cache isolation and real adapter side effects are under-tested.
- **Scenario:** Soft-delete corruption or cross-account offline data exposure ships despite green suites.
- **Recommended fix:** Independent committed PostgreSQL transactions, real protocol-adapter tests, and single-worker service-worker/account-switch/lost-response tests in CI.
- **Complexity:** medium. **Confidence:** high.

## P2.7 — Ownership of business logic remains fragmented

**Files/classes:** `controllers/AdvanceController.kt`; `controllers/MileageController.kt`; `services/mapper/ReportMapper.kt`; `services/PdfService.kt`; `services/ReportService.kt`; `services/StorageService.kt`; `frontend/components/expenses/ExpenseForm.tsx`; `frontend/app/expenses/capture/page.tsx`.

- **Current behavior:** Settlement and mileage mapping are duplicated; controllers own business transactions; two UI surfaces coordinate OCR leases/recovery. `ReportService` has no production callers found. `ReceiptArchive` operations are currently test-only.
- **Problem:** Rules drift and interfaces suggest guarantees not exercised by production paths.
- **Scenario:** A recovery fix reaches one capture surface but not the other; PDF arithmetic diverges from API arithmetic.
- **Recommended fix:** Extract authoritative settlement, advance/mileage and capture-lifecycle seams; remove unused wrappers after confirming callers. Avoid a generic workflow framework or microservice split.
- **Complexity:** medium. **Confidence:** high for duplication; medium for the preferred refactoring boundary.

## P2.8 — Dependency audit currently fails the repository’s policy

**Files/classes:** `frontend/package-lock.json`; `frontend/package.json`; `scripts/check-npm-audit.mjs`; `.github/workflows/ci.yml`.

- **Current behavior:** Audit reports fixable HIGH advisories for `brace-expansion@5.0.9` and `fast-uri@3.1.6`.
- **Problem:** The configured security gate blocks these versions.
- **Scenario:** CI fails; vulnerable dependency behavior remains available wherever those code paths are used.
- **Recommended fix:** Upgrade the relevant dependency chains and rerun audit/tests.
- **Complexity:** small. **Confidence:** high.

`brace-expansion` is under ESLint; `fast-uri` is production-transitive through resolvers/AJV. **Application exploitability was not established.**

## P2.9 — Image compression changes bytes without changing filename metadata

**Files/classes:** `frontend/lib/receiptCapture.ts:compressImage,scanReceipt`; `services/OcrService.kt:scanGemini`; `services/ExpenseService.kt:getReceiptBytes`.

- **Current behavior:** PNG/WebP images become JPEG blobs but retain their original filename. Backend provider/download MIME selection uses filename extensions.
- **Problem:** Stored bytes, extension and declared MIME can disagree.
- **Scenario:** A compressed PNG is sent to OCR as `image/png` despite JPEG contents.
- **Recommended fix:** Rename converted uploads and use detected/validated content type consistently through storage, OCR and download.
- **Complexity:** small. **Confidence:** high for mismatch; medium for provider-specific failure consequences.

---

# P3 — UX, performance and cleanup

| Finding | Files / current behavior | Problem and realistic scenario | Recommended fix | Complexity / confidence |
| --- | --- | --- | --- | --- |
| **P3.1 Unbounded lists and ineffective SSR prefetch** | `frontend/app/expenses/page.tsx`, `app/reports/page.tsx`, their client components; backend list methods. Server keys/shapes differ from client queries; omitted pagination returns full history. | Initial navigation serializes historical detail, then fetches again. Mobile latency/memory grows with data. | Shared query-option factories, bounded default pagination and list projections. | medium / high |
| **P3.2 Receipt download crashes immediately after OCR** | `frontend/components/expenses/ExpenseForm.tsx:1150–1164` uses `expense!.id`, although OCR-created expense is in `currentExpense`. | Scan on `/expenses/new`, then click its receipt: undefined-property exception. | Use `currentExpense.id`; extend OCR regression test to download. | small / high |
| **P3.3 Capture feed labels original amounts as EUR** | `frontend/app/expenses/capture/page.tsx:270–275,633–641` assigns OCR amount to `amountEur`. | 120 RON displays as €120; persisted conversion is separate. | Display original currency or canonical expense EUR amount. | small / high |
| **P3.4 Queued OCR lacks cancellation and timed retry** | `frontend/app/expenses/capture/page.tsx` retries on mount/online/visibility; queued items lack cancel action. | Wrong offline photo uploads later; an online 503 can remain waiting until focus/navigation changes. | Owner-safe discard/cancel and bounded retry scheduling. | medium / high |
| **P3.5 Dialog focus behavior is inconsistent** | `ReceiptLightbox.tsx`, `BulkReviewDrawer.tsx`, `ReportReceiptsDrawer.tsx`, `SlideOverReviewDrawer.tsx`. | Keyboard users tab into obscured background controls; focus is not consistently restored. | Shared accessible dialog lifecycle: initial focus, trapping, inert background and restoration. | medium / high |
| **P3.6 Receipt ZIP silently omits failed downloads** | `controllers/ReportController.kt:receipts-zip` ignores individual failures and checks archive byte length. | All files fail but a nonempty, zero-entry ZIP still returns 200. | Count entries; report zero/partial failure and include a missing-file manifest. | small / high |
| **P3.7 Error/log payloads expose unnecessary detail** | `config/ValidationExceptionHandler.kt`; `services/EmailSettingsService.kt`; `EmailImportService.kt`. | Malformed JSON returns parser internals; routine logs retain recipient addresses/report subjects. | Stable public errors; bounded private diagnostics, redaction and retention policy. | small / high |
| **P3.8 Notifications have no durable delivery guarantee** | `ReportLifecycleNotificationAdapter.kt`; `EmailSettingsService.kt:sendEmail`. | SMTP failure is logged/swallowed; crash after report commit loses notification. | If delivery is operationally required, use an outbox and bounded retry; otherwise document best-effort semantics. | medium / high |

---

## Things that looked suspicious but are implemented correctly

1. **JWT role claims are not the authorization authority.** Subsequent requests use the current database role and active flag.
2. **Refresh tokens are hashed**, not persisted as reusable plaintext.
3. **Production secrets and cookie handling have real safeguards:** explicit secrets, HTTP-only cookies, secure production configuration.
4. **Disabling Spring CSRF does not mean no CSRF defense exists.** Protected mutations have Origin/Referer checks and Lax cookies. I found no verified authenticated cross-site mutation bypass.
5. **Manager visibility is not expense mutation permission.** Expense mutations remain owner-only.
6. **Report self-approval/rejection/payment is prohibited.** Manager approval and finance payment are explicitly separated.
7. **Rejected expenses returning to draft is intentional**, allowing correction.
8. **Financial entities generally have optimistic versions.** The findings concern custom deletion and aggregate boundaries—not completely absent locking.
9. **Ordinary receipt deletion waits for commit**, and uploads register rollback cleanup. Those structures are sound; path collisions and silent stale deletion undermine them.
10. **OCR stage promotion is genuinely lease-fenced.** Stale workers cannot simply commit results after losing their lease.
11. **OCR form saving normally updates the promoted expense**, rather than creating another one. An existing browser regression test covers this.
12. **Acknowledged expense creation is retained before receipt recovery.** Known-ID retries reuse it; the remaining problem is lost acknowledgement.
13. **Offline queues have owner checks and transactional lease claims.** The confidentiality finding concerns separate read caches.
14. **OCR unmount and explicit cancellation are intentionally different.** Unmount preserves durable remote work for resumption.
15. **Server QueryClients are per-request**, not a cross-user server singleton.
16. **Storage has canonical path containment**, including existing symlink escape protection.
17. **S3 receipts can be materialized locally for PDFs.** Local-path use is not inherently an S3 omission.
18. **CSV/XLSX formula protection exists.**
19. **IMAP report creation and ledger completion share a transaction.** The mailbox adapter’s early acknowledgement is the actual problem.
20. **SMTP sending is asynchronous**, despite misleading self-invoked `@Async` annotations in the notification adapter.

## Areas not established as broken

- Deployed reverse-proxy header sanitization.
- Actual exploitability of npm advisories.
- Backup scheduling, receipt/object backups, key preservation and restore capability. The provided script backs up PostgreSQL only.
- Desired logout semantics: deleting refresh tokens does not immediately revoke an already-issued access JWT.
- Upgrade compatibility against a copy of the existing production database.
- Full iOS/WebKit behavior and production service-worker behavior.

These need targeted verification or policy decisions, not speculative defect claims.

# TOP 5 improvements

1. **Make stored evidence collision-free and cleanup ownership-aware.**  
   Unique immutable object paths; protect insurance, OCR sources and staged files from orphan cleanup.

2. **Correct versioned persistence boundaries.**  
   Stop saving authentication snapshots; add user concurrency protection and row-count-verified, version-incrementing soft deletion.

3. **Isolate browser data by identity.**  
   Fix account transitions and replace authenticated HTML caching with a static offline shell.

4. **Create one authoritative, historically stable report settlement.**  
   Fix PDF mileage immediately; snapshot allowance/settlement/signature evidence and enforce aggregate concurrency.

5. **Add server-backed operation idempotency.**  
   Prevent lost mobile responses from duplicating expenses, receipts and OCR jobs.

**Recommended first step:** address the P0 storage and persistence defects before further architectural expansion, with committed-transaction regression tests alongside each fix.
