# Architecture Patterns for Future Work — Xpenses

> Historical research: references to root `todo.md` now refer to `docs/archive/root-md-2026-10-18/todo.md`. Its findings are not current verification; use `README.md` and the documentation-review reports before planning work.

**Mode:** Ecosystem
**Date:** 2026-08-04
**Basis:** `.planning/codebase/ARCHITECTURE.md`, `services/` inspection, `todo.md` findings, and library facts verified via ctx7.

The brownfield architecture is sound: controller → service → repository/entity/DTO on the backend, `report/lifecycle` owning state transitions, `StorageService/StorageProvider` abstracting blobs, `FxService` centralizing the FX policy. The future backlog needs four patterns; all are refinements of what the codebase already does, not new subsystems.

## 1. Export/reporting boundary — the "frozen read model"

**Pattern:** exports must read from a *posted, closed* projection rather than live joins.

- The report that finance exports should be a **closed snapshot**: report totals, per-Expense amounts, FX rate + margin + source date, and per-currency breakdown all computed once when the report reaches an approved/paid state and stored.
- `ExportService.kt` reads that projection. This makes the "export == report == posted EUR values" invariant enforceable in tests (golden files) and prevents the class of bugs where a live FX cache cleanup or a rate re-resolution changes a historical export (matches `FX-05`).
- Money formatting (2 dp, `HALF_UP`, EUR sign/locale) is applied **only at the feed layer**, never in the domain model — currently `ExportService` mixes spreadsheet concerns and formatting; keep that seam explicit so OCR/email/DB never depend on display formatting.
- Streaming: switch export paths to `StreamingResponseBody` + POI `SXSSFWorkbook` so report volumes don't buffer whole files in memory (verified: `XSSFWorkbook` buffers the full workbook; `SXSSFWorkbook(rowWindow)` spills to temp files).

**Where this lands:** a new read-oriented boundary in the `report/` package (e.g., `report/feedout/`) producing a `ReportFeedout` projection consumed by `ExportService` (XLSX/CSV) and `PdfService` (PDF). No new tables required — the per-Expense FX snapshot (V30/V31) is already persisted; this freezes the report-level aggregation.

## 2. Ingestion seams — one "ReceiptIngestion" facade

**Pattern:** all receipt entry paths (upload, bulk upload, email import, future) normalize to one pipeline so validation, storage, dedup, OCR, and draft-creation happen exactly once.

Today `ExpenseService.uploadReceipts`, `EmailImportService`, and `BulkExpenseController` each walk their own path. The facade shape:

```
ReceiptIngestionPipeline
  1. normalize (bytes, filename, source, technician)
  2. validate magic bytes + size limits (→ 413/415 before buffering)
  3. store blob via StorageService (stage first; cleanup on failure)
  4. dedup (content hash / Message-ID)
  5. enqueue OCR job (OcrJob) or run sync leg throttled by semaphore
  6. produce a draft Receipt/Expense with OH CR result marked for review
```

- **Dedup is inside the pipeline, not per-entry:** a content hash on stored blobs gives duplicate-receipt detection (market table-stakes) and email `Message-ID` uniqueness covers retry-at-least-once.
- **The advisory lock gets scoped to step 5's cache-fill critical section only** — today `pg_advisory_xact_lock` spans the whole 4-tier Gemini chain (`OcrService.kt:146-153`), risking pool exhaustion. In-memory guard or short transaction for the window, then release before external calls.
- **Email is just another source:** `MailMessage → IngestionRequest` maps `From:` through the sender allowlist to a Technician; anything unmapped goes to a quarantine state, never straight to a draft.

**Where this lands:** a new `services/ingestion/` package; `EmailImportService`, `BulkExpenseController`, and `ExpenseService.uploadReceipts` delegate to it. Storage stays behind `StorageProvider`, so dedup/lifecycle don't care whether blobs are local or S3.

## 3. Background-job pattern — job tables + outbox, no new infra

**Pattern:** long-running and fire-and-forget work lives in database-backed job tables that `@Scheduled` pollers drain; exactly-once side effects use a transactional outbox.

- **OCR already has this (`OcrJob`, `AsyncOcrService`).** Add: a stuck-job reaper (`todo.md` low) and a bounded executor (`ocrTaskExecutor`) tuned so the OCR pool can't starve request threads.
- **Notifications (approver emails, lifecycle events) move to a transactional outbox table:** a row is written in the same transaction that changes the report, a poller publishes to SMTP after commit. This replaces the broken self-invoking `@Async` (`ReportLifecycleNotificationAdapter.kt`) with exactly-once semantics and removes email I/O from the HTTP thread — the same fix the "FX HTTP call inside open transactions" and "OCR lock across network" findings need in miniature.
- **Job-pollers must not hold transactions across external calls:** read the batch in a short transaction, do the I/O outside it, mark complete in a second short transaction (this is precisely the pool-exhaustion defect class in `ExpenseService.kt:191`, `AdvanceController.kt`, `OcrService.kt`).
- **Concurrency control stays in PostgreSQL:** unique constraints for membership ("one Expense attached to one Report"), `@Version`/optimistic locking mapped to 409, advisory locks only around the critical section. No Redis, no broker (single-container deployment).

**Where this lands:** `email` outbox table (Flyway) + `EmailOutboxPoller` in `report/lifecycle`; `OcrJob` gains `claimed_at`/`attempts` for the reaper; the existing `@Scheduled` IMAP poller stays but gains dedup + overlap protection (a hard `@Scheduled`/`@Async` overlap finding is in the backlog).

## 4. Storage abstraction — fail-fast providers

**Pattern:** the blob boundary stays `StorageProvider`; provider selection must be explicit, and every operation happens through it.

- **Reject unknown provider types at startup/config-validation** — today `smb`/`webdav`/`sftp` silently fall back to local (`StorageService.kt:86-129`), moving data where it wasn't intended. Fail fast with a config error instead.
- **Never resolve downloads from a stale cache:** "cache-download returns non-existent path on fetch failure" (`StorageService.kt:228-240`) silently makes receipts vanish from exports — rethrow or return an explicit missing-entity so exports fail loudly rather than silently.
- **Migration is per-file, resumable, and reaped** (idempotent `StorageMigrationEngine`), and the reads-point-during-migration window is closed before cutover.
- **S3 specifics:** path-style addressing for MinIO/self-hosted, explicit `ContentType`, and client lifecycle management.

**Where this lands:** tightening of `services/storage/`; no interface change. The content-hash dedup key (see ingestion) is stored with the blob metadata for cheap duplicate detection.

---

## Guiding rules the phases should reuse

1. **Keep network I/O outside transactions** (rates, OCR, SMTP, storage fetches that aren't part of the atomic unit). Resolve the FX rate before opening the write transaction and pass it in.
2. **Frozen over recomputed:** anything exported or printed derives from persisted snapshots, never from a live calculation.
3. **Database is the only shared state:** no caches or in-memory flags for correctness-sensitive coordination across instances; advisory locks and unique constraints in PostgreSQL.
4. **The lifecycle package owns transitions:** controllers and services call `ExpenseReportLifecycle`; feedout/integrity code never mutates statuses directly (already the established convention).
5. **Stream the feed layers:** `StreamingResponseBody` + `SXSSFWorkbook` + chunked PDF merge replace whole-buffer byte arrays.