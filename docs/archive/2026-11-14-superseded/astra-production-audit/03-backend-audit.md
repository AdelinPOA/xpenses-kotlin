# Backend production audit

> **Baseline report:** source findings and line numbers below refer to `87bec5a15457c3c74ebec613f2459ac1306093a5` (2026-09-06). Another workstream added remediation after this review. Current-state reconciliation for `bdb6fcba9845be7053b0087253bb4a1c191d96e3` is in `00-executive-summary.md`, notably partial fixes to BE-003/004/007. `06-test-and-verification-plan.md` distinguishes the initial 213-test run with 2 failures from the fresh current-HEAD 223-test pass. Existing suite success does not close the financial, crash-recovery or race findings without their targeted acceptance tests.

## Scope and evidence standard

Read-only review of business rules, persistence, integrations and existing tests. No backend source changes, migration changes, database writes or provider calls were made by this reviewer. Test execution belongs to `06-test-and-verification-plan.md`; none of the findings below is represented as a reproduced production incident. **Confirmed** means the behavior follows directly from the inspected source; concurrency and failure-injection consequences still require the specified tests.

Paths below use **B = `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/`**, **M = `backend-kotlin-jpa/src/main/resources/db/migration/`**, and **T = `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/`**. These prefixes are exact repository-relative path expansions.

The README's claims that IMAP ingestion is already ledger-backed and all provider calls are outside transactions are not true for the active call graph. Existing `.planning/PROJECT.md` verification statements are historical milestone records, not evidence for this checkout.

## Inventory and architecture map

| Surface | Entry points and responsibilities |
|---|---|
| Expenses/receipts | `B/controllers/ExpenseController.kt` delegates list/CRUD/receipt/download/export to `B/services/ExpenseService.kt`; `B/controllers/BulkExpenseController.kt` orchestrates OCR → expense creation → separate receipt upload. `B/services/mapper/ExpenseMapper.kt` produces API DTOs. |
| Reports/review | `B/controllers/ReportController.kt` owns list, metadata CRUD, PDF/CSV/XLSX/ZIP; lifecycle mutations delegate to `B/report/lifecycle/ExpenseReportLifecycle.kt`. `B/services/ReportService.kt` is a second lifecycle facade. `B/controllers/ReviewQueueController.kt` → `B/report/review/ReviewQueueReader.kt` / `ReviewQueueProjection.kt`. Notifications: `B/report/lifecycle/ReportLifecycleNotificationAdapter.kt`. |
| Advances/mileage/FX | `B/controllers/AdvanceController.kt`, `MileageController.kt`, `FxController.kt` contain financial orchestration. `B/services/FxService.kt` → `B/services/fx/FxRateProvider.kt`; `B/services/MileageCalculationService.kt` calculates mileage snapshots. `B/services/mapper/ReportMapper.kt` computes report reimbursement on read. |
| Dashboard/search | `B/controllers/DashboardController.kt`, `SearchController.kt`; repositories supply aggregates, report projections and filtered entity queries. |
| Identity/admin | `B/controllers/AuthController.kt`, `UserController.kt`, `SignatureController.kt`, `CategoryController.kt`, `AppSettingsController.kt`, `LdapSettingsController.kt`; `B/services/Authorization.kt`, `AppSettingsService.kt`, `LdapService.kt`, `CryptoService.kt`. JWT/cookie/filter security is covered separately in report 04. |
| Other HTTP | `B/controllers/InsuranceController.kt`, `OcrController.kt`, `HealthController.kt`; insurance files remain, inventory was dropped by V101. |
| OCR/email | `B/services/OcrService.kt` performs Gemini fallback/cache/comparisons; `AsyncOcrService.kt` uses in-process executor; `EmailImportService.kt` parses delegation emails into reports; `EmailSettingsService.kt` owns mail configuration. `B/ingestion/ImapIngestionLedger.kt` and `ImapMessageKey.kt` exist but are not connected to polling. |
| Storage/export | `B/services/StorageService.kt`; `B/services/storage/{StorageProvider,LocalStorageProvider,S3StorageProvider,StoragePathResolver,StorageMigrationEngine,StorageMigrationStateStore,JdbcStorageMigrationStateStore,NoopStorageMigrationStateStore}.kt`; `B/services/{PdfService,ExportService}.kt`. Signature controller separately accesses local files. |
| Entities | `B/model/{User,Expense,ExpenseReport,Receipt,Category,AdvancePayment,MileageRecord,FxRate,AppSetting,InsuranceFile,OcrComparison,OcrJob,OcrResultCache,RefreshToken}.kt`. `Expense` and `ExpenseReport` use soft deletion; expenses, reports, advances and mileage have `@Version`. Advances/mileage do not have entity-level soft-delete annotations. |
| Repositories | `B/repositories/` has matching repositories for those 15 entities. Filtered expense/report list queries, OCR cache locks, status aggregations and review projections live here. Native/JDBC worker ledgers live at their integration seams rather than entity repositories. |
| Transport/config | `B/dto/{auth,dashboard,expense,report,search,settings,user}/`; `B/models/{PagedResponse,RawUpload,StorageConfigDto}.kt`; `B/config/{AsyncConfig,CacheConfig,DataInitializer,SecurityConfig,ValidationExceptionHandler}.kt`; runtime configuration in `backend-kotlin-jpa/src/main/resources/application.yml`. |
| Migrations | `M/V1__init.sql`; V2–V17 lifecycle/delegation/insurance/OCR/schema work; V20 monetary NUMERIC; V21 status; V22 financial versions; V23 soft-delete timestamp; V24–V29 OCR/provider/cache and manual FX; V30 FX source snapshots/cache reset; V31 mileage FX snapshots; V32 nullable mileage fuel/tax snapshots; V99 IMAP ledger; V100 storage migration ledger; V101 inventory drop. Versions are intentionally non-contiguous; gaps alone are not a defect. |
| Tests | `T/controllers/` covers Advance, Auth, Category, Dashboard, Expense, FX/margins, Insurance, Mileage, ReviewQueue, Signature, User. `T/report/{ReportStateMachineTest,lifecycle/ExpenseReportLifecycleTest}.kt`; `T/services/` covers Authorization, Expense, FX, MileageCalculation, OCR, PDF, Storage plus FX provider/local storage/path safety; `T/ocr/AsyncOcrTest.kt`; `T/ingestion/ImapMessageKeyTest.kt`; `T/migrations/HistoricalFxMigrationRegressionTest.kt`; `T/repositories/OcrResultCacheRepositoryTest.kt`; rate-limit tests in `T/security/`; integration fixtures in `T/IntegrationTestBase.kt`, `TestAuthHelper.kt`, `ContextLoadsTest.kt`. |

## Findings

### BE-001 — PDF reimbursement omits mileage
- **Severity:** High
- **Area:** Backend
- **Status:** Confirmed source defect.
- **Evidence:** `B/services/PdfService.kt:134` derives `totalEur` exclusively from expenses. At lines 558–562 it computes `totalMil` but uses `totalEur.add(allowance).subtract(totalAdv)` for reimbursement. In contrast, `B/services/mapper/ReportMapper.kt`, `mapReportToOut`, includes `totalMileage`. `T/services/PdfServiceTest.kt:103,195` supplies empty mileage lists in both reimbursement tests.
- **User impact / production risk:** Finance relying on exported PDFs underpays by exactly the mileage amount; web detail and signed/exported document disagree.
- **Recommended fix:** Centralize one report calculation and consume it in DTO, PDF, review and export presentation; include mileage as an explicit summary line.
- **Acceptance criteria:** With expenses €100, mileage €40, allowance €50 and paid advances €20, both PDF and API show €170; no duplicate mileage inclusion.
- **Suggested tests:** PDF text extraction for nonzero mileage, API/PDF parity, zero/negative reimbursement, mixed original currencies.
- **Dependencies or sequencing:** Phase 0 financial correctness gate; combine with BE-002 snapshot design rather than independently duplicating formulas.

### BE-002 — Changing allowance settings rewrites historical reimbursement
- **Severity:** High
- **Area:** Backend
- **Status:** Confirmed source behavior.
- **Evidence:** `B/services/mapper/ReportMapper.kt`, `calculateDailyAllowance` and `mapReportToOut`, read `daily_allowance_rate` on every response regardless of report status. `B/services/PdfService.kt:559,759–778` recalculates from current settings. `B/services/AppSettingsService.kt:44–53` updates the global rate. `B/model/ExpenseReport.kt` has no allowance/rate/net-reimbursement snapshot; lifecycle `submit` saves only expense sum in `totalAmount`.
- **User impact / production risk:** Approved/paid report amounts change after an administrator changes policy; regenerated reimbursement evidence differs without an audited financial amendment. This violates the stated historical-stability goal.
- **Recommended fix:** Snapshot applicable allowance rate, eligible days, component totals and net settlement at a defined lifecycle boundary. Preserve posted records; do not blindly backfill history from today's rate.
- **Acceptance criteria:** Changing global allowance settings never changes an already-posted report's API or PDF amounts; draft recalculation policy is explicit; historical unknown snapshots are visible and reconciled.
- **Suggested tests:** Submit/approve/pay → change allowance setting → re-read/export; lifecycle recall/amendment; migration fixtures with historical rates.
- **Dependencies or sequencing:** Phase 0 containment and Phase 2 audited snapshot migration. Requires finance to select posting/amendment policy; use BE-001's shared calculator.

### BE-003 — Advance endpoints can change a settled report
- **Severity:** High
- **Area:** Backend
- **Status:** Confirmed source behavior; whether any post-settlement adjustment is legitimate needs finance policy, but no adjustment history exists in these paths.
- **Evidence:** `B/controllers/AdvanceController.kt:70–97` permits owner advance requests without checking report status. `createAdvance:98–130` requires draft only for `isOwner`; a privileged non-owner can create a paid advance on a paid report. `payAdvance:236–284` checks only advance status `requested`, not report status. `B/services/mapper/ReportMapper.kt`, `mapReportToOut`, subtracts every currently paid advance from reimbursement on every read.
- **User impact / production risk:** A technician can request an advance after report payment and a manager can pay it; privileged users can directly add a paid advance to a settled report, altering its settlement amount without reopening it.
- **Recommended fix:** Put advance transitions and report-state policy in a single domain seam. Freeze settled report membership; use explicit audited adjustments for allowed corrections.
- **Acceptance criteria:** A paid report rejects ordinary create/request/pay advance mutations; any authorized adjustment has an immutable actor/reason/amount record and does not silently rewrite prior settlement.
- **Suggested tests:** Cross-product of report states, advance states, owner/manager/finance/admin actors; direct HTTP calls, not only UI visibility; requested-before-payment then pay-after-payment case.
- **Dependencies or sequencing:** Phase 0 restrict settled mutations; coordinate BE-002 and BE-009 aggregate locking.

### BE-004 — IMAP ledger exists but active polling never uses it
- **Severity:** High
- **Area:** Backend
- **Status:** Confirmed wiring defect; duplicate/retry outcomes need integration reproduction.
- **Evidence:** `B/services/EmailImportService.kt:546–611`, `pollAndProcessEmails`, searches unseen messages, invokes `processIncomingEmail`, saves a report, then marks the mail seen. Neither `ImapMessageKey` nor `ImapIngestionLedger` is injected/called. Repository-wide source references to those names are only their declarations and the key unit test. `B/ingestion/ImapIngestionLedger.kt` and `M/V99__create_imap_ingestion_ledger.sql` are therefore inactive safeguards. The method is both `@Async` and scheduled; replicas can inspect the same unseen mail.
- **User impact / production risk:** Two replicas or a crash after DB save but before setting SEEN can create duplicate reports. Unparseable messages remain unseen and are retried indefinitely, potentially re-calling Gemini each poll.
- **Recommended fix:** Wire deterministic mailbox/message keys and durable claims into the real poller. Atomically bind report creation and processed ledger state; acknowledge IMAP only afterward. Add bounded retries, terminal failure visibility and stale-claim recovery (the existing ledger only reclaims FAILED rows, not abandoned CLAIMED rows).
- **Acceptance criteria:** Same message across two replicas or crash/restart creates one report; exhausted messages stop provider retries and are operator-visible; stale claims recover safely.
- **Suggested tests:** PostgreSQL-backed poller test, concurrent claims, crash after report creation/before SEEN, provider timeout, malformed mail, stale lease; prove the ledger row is actually written by polling.
- **Dependencies or sequencing:** Phase 0 disable multi-replica/overlapping ingestion until fixed, then Phase 2 durable ingestion. Do not treat the existing key-only test as coverage of this integration.

### BE-005 — Async OCR holds a DB transaction across provider calls
- **Severity:** High
- **Area:** Backend
- **Status:** Confirmed transaction annotations/call graph; rollback/failure state needs Spring integration tests.
- **Evidence:** `B/services/AsyncOcrService.kt:20–48`: `processOcr` is `@Transactional`, loads and flushes the job, calls `ocrService.scanReceipt`, then saves completion. `saveJobFailure` is annotated `REQUIRES_NEW` but invoked on the same instance. `B/services/OcrService.kt:129–133` claims provider I/O is outside transactions, but its `TransactionTemplate` preparation/finalization does not remove the caller's transaction. Other external calls inside transactions: `ExpenseService.createExpense/updateExpense` → FX; `AdvanceController.createAdvance/updateAdvance/payAdvance` → FX; `MileageController.createMileage/updateMileage` → FX; proxied email simulation → Gemini.
- **User impact / production risk:** Slow OCR/FX consumes database connections; flushed `processing` status is not independently committed during the provider wait. A database failure can leave a job pending because same-instance failure handling does not establish the claimed independent transaction.
- **Recommended fix:** Nontransactional orchestrator for network work; separate proxied transactional methods or explicit independent templates for claim, result and failure. Revalidate state/version on the short commit step.
- **Acceptance criteria:** Provider stub observes no active DB transaction; `processing` is visible to a second connection while provider is blocked; failure status survives rollback; concurrency revalidation prevents writing stale calculations.
- **Suggested tests:** Spring-proxied PostgreSQL tests with blocked/throwing provider, `TransactionSynchronizationManager` assertion, second-connection status reads, DB failure injection and bounded pool load.
- **Dependencies or sequencing:** Phase 0/4 outage prevention. `T/ocr/AsyncOcrTest.kt` constructs `AsyncOcrService` directly with Mockito and cannot test proxy/transaction behavior. Split transactions before adding retries.

### BE-006 — Accepted OCR jobs are not restart-durable
- **Severity:** High
- **Area:** Backend
- **Status:** Confirmed design gap.
- **Evidence:** `B/controllers/OcrController.kt`, `scanReceipt`, persists job metadata then passes `file.bytes` into `AsyncOcrService.processOcr`; `B/config/AsyncConfig.kt` uses a process-local executor with queue capacity 50. `B/model/OcrJob.kt` stores filename/status/result/error, not durable input storage; `B/repositories/OcrJobRepository.kt` has no recovery worker. No restart/reclaim loop exists in the inspected source.
- **User impact / production risk:** A deployment/process crash loses queued receipt bytes and leaves accepted jobs pending forever; the client cannot retrieve a result for its accepted job. Queue memory alone can retain up to roughly 500 MB of 10 MB inputs before running-task/encoding overhead.
- **Recommended fix:** Store validated job input durably before accepting it, claim via bounded lease, persist attempts/deadlines and terminal errors, clean retained inputs under an explicit policy; constrain aggregate queued bytes.
- **Acceptance criteria:** Restart during pending/processing leads to bounded recovery or explicit failure, never infinite polling; queue saturation does not exhaust heap; input retention is controlled.
- **Suggested tests:** Kill/restart worker, lease expiry, duplicate worker execution, 10 MB queue saturation and 503 rejection; ensure no duplicate expense if subsequent workflows retry.
- **Dependencies or sequencing:** Phase 1 technician reliability / Phase 4 worker scaling; implement BE-005's transaction separation first.

### BE-007 — Receipt deletion can remove bytes before DB rollback; S3 upload failure still reports success
- **Severity:** High
- **Area:** Backend
- **Status:** Confirmed non-atomic sequencing; data-loss scenarios need failure injection.
- **Evidence:** `B/services/ExpenseService.kt:287–314,361–389` deletes storage objects within the surrounding DB transaction, before commit. Optimistic-lock/commit failure can restore DB rows but cannot restore deleted files. `uploadReceipts:316–358` can write an early file then fail later in the batch, leaving unreferenced bytes on rollback. `B/services/StorageService.kt:296–315` writes local bytes, catches remote upload errors, logs and returns success; no normal-upload retry ledger is written.
- **User impact / production risk:** An expense that remains in the DB can lose its receipt after a failed deletion. In configured S3 mode, a successful upload can exist only on one local replica and disappear with local-disk loss or fail on another replica.
- **Recommended fix:** Durable storage operation/outbox state, after-commit deletion with retries, upload staging and compensation. Clearly define remote durability policy; do not report durable success until its required storage copy exists or expose a pending replication state.
- **Acceptance criteria:** Forced DB rollback preserves referenced receipts; failed remote upload is retried/visible; another replica can retrieve an acknowledged durable upload; orphan cleanup never deletes a referenced object.
- **Suggested tests:** Commit failure after delete, second file invalid in multi-upload, S3 timeout, local disk loss, concurrent edit/delete, outbox retry idempotency.
- **Dependencies or sequencing:** Phase 0 data-loss containment; Phase 2 storage transaction redesign. Preserve existing canonical path/magic-byte defenses.

### BE-008 — Editing legacy mileage changes distance without changing payment
- **Severity:** High
- **Area:** Backend
- **Status:** Confirmed source defect for pre-V32 rows with null fuel snapshots.
- **Evidence:** `M/V32__add_mileage_fuel_calculation_snapshots.sql` adds nullable fields without backfill. `B/controllers/MileageController.kt:169–183` sets `rec.distanceKm` then calls `recalculate`. At `recalculate:274–284`, `fuelConsumption = rec.fuelConsumptionLitersPer100Km ?: return` exits for legacy rows before updating financial totals. If only distance changes, no later amount computation runs.
- **User impact / production risk:** An editable legacy draft can show, for example, double the distance but unchanged gross/net amount, producing an incorrect claim and document.
- **Recommended fix:** Explicit calculation-version branch: recalculate legacy records using their persisted legacy rates, or reject unsupported edits with a clear audited upgrade flow. Do not silently backfill/recompute posted historical records.
- **Acceptance criteria:** Updating legacy draft distance recalculates consistently or returns an actionable validation error without partial mutation; legacy approved/paid records remain frozen.
- **Suggested tests:** Pre-V32 null-snapshot fixtures; distance-only, date-only and distance+date updates; assert all amount and rate fields; migration regression coverage.
- **Dependencies or sequencing:** Phase 0 financial fix; preserve `.planning/PROJECT.md` historical-rate constraints.

### BE-009 — Child mutations are not serialized with report lifecycle transitions
- **Severity:** High
- **Area:** Backend
- **Status:** Needs verification: confirmed missing aggregate lock; a deterministic concurrent PostgreSQL test is required to establish runtime interleaving.
- **Evidence:** `B/controllers/MileageController.kt`, create/update/delete, reads draft report then only saves/deletes mileage. `B/controllers/AdvanceController.kt` similarly mutates children without a shared report lock/version increment. `B/services/ExpenseService.kt`, `doCreateExpense`, reads draft report then inserts a child. `B/report/lifecycle/ExpenseReportLifecycle.kt`, submit/approve/pay, loads report with ordinary `findById`; `B/repositories/ExpenseReportRepository.kt` declares no lock query. Each entity has `@Version`, but child-only inserts/updates do not necessarily dirty the already-read parent entity.
- **User impact / production risk:** A request can pass a draft check, pause, then commit financial content after another request submits/approves the report. Lifecycle totals/approvals may no longer match reviewed membership. Per-entity optimistic versions alone do not protect this cross-entity invariant.
- **Recommended fix:** Acquire a consistent report aggregate lock, or force parent version conflict, on every membership/financial child change and lifecycle transition; use consistent lock ordering and recheck state inside the protected transaction.
- **Acceptance criteria:** Controlled submit-vs-add-mileage, submit-vs-add-expense and pay-vs-advance scenarios serialize to a valid state or return conflict; no submitted report has unreviewed late children.
- **Suggested tests:** Barrier/latch-driven two-transaction Testcontainers tests; test insert paths, not only two updates of the same row; retry/409 UI contract.
- **Dependencies or sequencing:** Phase 2, coordinated with BE-003/005. Do not claim an exploit was reproduced in this audit.

### BE-010 — Report signatures are mutable user files, not signed-record snapshots
- **Severity:** High
- **Area:** Backend
- **Status:** Confirmed source behavior; legal/signature policy needs owner confirmation.
- **Evidence:** `B/report/lifecycle/ExpenseReportLifecycle.kt`, `sign`, records only `signer` and `signedAt`; `recall` leaves signature metadata intact. `B/controllers/SignatureController.kt`, `putSignature`, overwrites `${currentUser.id}.png`; delete removes it. `B/services/PdfService.kt:617–635` loads the signer's current `signaturePath` whenever exporting. No signed content hash or immutable signature snapshot exists on `ExpenseReport`.
- **User impact / production risk:** Replacing/deleting a profile signature changes/removes it on old signed exports. Recall/edit/resubmit can retain a prior signing timestamp without requiring signature of changed content.
- **Recommended fix:** Immutable signature object and signed-content/version binding per report; invalidate/re-sign on content changes; profile signature remains only a reusable input, not historical evidence.
- **Acceptance criteria:** Profile changes cannot alter a previously signed artifact; recalled/changed content is visibly unsigned until re-signed; archive includes signer, time and signed revision.
- **Suggested tests:** Sign→replace/delete profile signature→export; sign→recall→edit→resubmit; storage migration/restore of signature evidence.
- **Dependencies or sequencing:** Phase 2 historical integrity with BE-002. Avoid retroactively presenting newly generated signatures as historically signed evidence.

### BE-011 — API accepts currency/date values that violate report accounting semantics
- **Severity:** Medium
- **Area:** Backend
- **Status:** Confirmed validation/contract gap.
- **Evidence:** `B/dto/report/ReportCreate.kt` and `ReportUpdate.kt` use unrestricted nullable date strings and unrestricted currency. `B/controllers/ReportController.kt:105–125,149–184` persists currency after uppercase only; lifecycle totals always sum `Expense.amountEur`, while report export writes that total alongside `r.currency`. `B/dto/expense/ExpenseCreate.kt` validates date only as nonblank; `B/services/FxService.kt:getRate` returns EUR identity before parsing date, and manual-rate creation also avoids parsing. Thus malformed dates can persist for EUR/manual expenses; report allowance parsing catches errors and returns zero.
- **User impact / production risk:** A caller can label an EUR report total USD/RON without conversion; invalid dates silently remove allowance or break date-based queries/exports. Frontend controls are not a server validation boundary.
- **Recommended fix:** Enforce EUR report currency under the documented canonical policy; use validated `LocalDate` transport/domain values and cross-field ordered date ranges; validate manual/ingestion paths at the owning domain seam too.
- **Acceptance criteria:** Unsupported report currency and impossible/malformed dates return structured 4xx errors before persistence; valid Romanian/English UI submissions retain exact business dates; invalid date ranges never silently yield zero reimbursement.
- **Suggested tests:** Direct HTTP invalid currency, EUR expense with `date:"not-a-date"`, impossible dates, manual FX path, reversed report dates, ingestion schema validation.
- **Dependencies or sequencing:** Phase 2 data validation; assess legacy malformed values before schema type changes.

### BE-012 — Receipt ZIP export silently omits failures and cannot detect empty archives
- **Severity:** Medium
- **Area:** Backend
- **Status:** Confirmed source defect.
- **Evidence:** `B/controllers/ReportController.kt:371–432`, `downloadReceiptsZip`, catches every per-receipt exception with an empty body. It checks `zipBytes.isEmpty()` after closing `ZipOutputStream`; even a zero-entry ZIP has an end-of-central-directory record, so that test does not indicate whether a receipt was included.
- **User impact / production risk:** Finance receives a successful empty or incomplete receipt archive with no warning and may assume the reimbursement evidence is complete.
- **Recommended fix:** Track successful/failed entry counts; return an explicit error for no entries; fail or include a machine-readable missing-receipt manifest for partial archives; log sanitized failures with request/report IDs.
- **Acceptance criteria:** No-receipt report and all-downloads-failed cases do not return a misleading successful empty export; partial failure is obvious and names missing receipt IDs safely.
- **Suggested tests:** Empty report, missing object, one failed of two receipts, duplicate entry names, corrupt storage stream, retry.
- **Dependencies or sequencing:** Phase 2/4 evidence/export reliability; align response errors with frontend download handling.

### BE-013 — Report lists and exports materialize unbounded nested graphs
- **Severity:** Medium
- **Area:** Backend
- **Status:** Confirmed query/response design; production impact needs load/SQL measurements.
- **Evidence:** `B/controllers/ReportController.kt:56–100` permits no-page list of all reports and accepts caller page size without an upper bound. Each `ReportMapper.mapReportToOut` expands expenses/receipts, advances and mileage and queries allowance settings. `B/repositories/ExpenseReportRepository.kt` eager-fetches expenses/user for unpaged lists but not all nested data; paged query fetches user only. `ExpenseService.listExpenses` also preserves an unbounded no-page branch. `ReportController.downloadReceiptsZip` constructs the entire archive in a byte array, and list exports similarly build all rows/bytes in memory.
- **User impact / production risk:** Growing history increases response size and SQL query count on mobile, with possible heap exhaustion on large exports. Rate limits do not bound a single request's work.
- **Recommended fix:** Bounded server pagination and shallow list/review DTOs, explicit detail fetches, batched/projection queries, streaming or bounded asynchronous exports; cap record counts and aggregate input bytes.
- **Acceptance criteria:** Public list size is bounded; query count is bounded independently of page item count; agreed production-sized datasets remain within measured latency/heap budgets; exports reject or queue oversized jobs.
- **Suggested tests:** SQL-count assertions, maximum/negative page-size HTTP tests, 10k-report fixtures, large multi-receipt archive heap/load test and mobile list payload budget.
- **Dependencies or sequencing:** Phase 4 performance after financial defects; frontend API migration required for shallow DTO/pagination changes.

## Controls observed; do not regress

- `ExpenseService` performs owner-only mutations and role-aware reads, blocks edits/deletes of non-draft expenses, checks report ownership/state before attachment, and validates receipt-to-expense association for read/delete. This is not a finding that every expense endpoint is unprotected.
- `ExpenseReportLifecycle` enforces submit/recall/approve/reject/pay transitions, owner-only submit/recall/sign, and rejects self-approval and self-payment. Bulk status invokes proxied lifecycle methods per row rather than wrapping the entire batch in one transaction.
- Monetary persistence uses `BigDecimal` and NUMERIC migrations; financial entities have per-row optimistic versions. FX preserves unchanged expense currency/date basis in `ExpenseService.updateExpense`; current-read operations do not generally recalculate stored FX. These controls do not solve report-level allowance snapshots or aggregate races.
- Storage uses canonical path containment and context extension/size/magic-byte validation; provider implementations are behind a storage abstraction. The normal upload durability and transactional deletion findings are distinct from path traversal.
- OCR has content hash/provider/model/contract-version cache keys, bounded cleanup support and fallback attempts. Queue rejection is explicitly changed to failed/503 by `OcrController`. These do not provide restart durability or prove transaction separation through the async wrapper.

## Verification gaps and recommended backend gate

Owner/audit coordinator should run `cd backend-kotlin-jpa && ./gradlew test` with Java 21 and isolated Testcontainers PostgreSQL; results are recorded in report 06. A passing current suite is not acceptance for the findings above:

1. Add nonzero-mileage PDF/API parity and historical-allowance/signature tests first.
2. Add all-state advance authorization/business transition tests and legacy mileage fixtures.
3. Use real Spring proxies and PostgreSQL for OCR rollback visibility, aggregate concurrency and IMAP poller ledger tests. Mockito-only tests cannot establish these properties.
4. Add file/DB/S3 failure injection and restart recovery; do not run these against live storage/mailboxes.
5. Migrate a fresh database and an anonymized pre-V32 database to current; confirm Hibernate validation, old financial values and old migration checksums. No schema migration was executed by this reviewer.

Not verified here: actual provider latency/fallback quality, live S3 durability/access policy, deployed IMAP host/mail-auth guarantees, production concurrency/load, real database migration history, restore behavior, SMTP delivery, PDF visual rendering with all scripts/fonts, or whether the business intentionally permits documented exceptions to settlement immutability. Auth/JWT/CSRF, privacy and deployment controls are evaluated in the companion reports rather than duplicated here.
