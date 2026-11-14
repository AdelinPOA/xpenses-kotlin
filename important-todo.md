# Priority Plan: AI Import Order & Expense Image Recognition (`important-todo.md`)

Generated: 2026-11-14
Goal: Make **Import Order** (email text → AI parsing → create & fill new report) and **expense receipt image recognition** (single & bulk uploads) reliable, accurate, and fast on the first attempt.

---

## Milestone 1 — Receipt Image Recognition & Core Race Fixes

### 1.1 Eliminate Cache & Transaction Failures ("Works on 2nd Try")
- [x] **OCR Cache Upsert (`OcrService.kt`)**:
  - Isolated `saveCacheResult()` in `PROPAGATION_REQUIRES_NEW` (`findBy...` update-or-insert + `DataIntegrityViolationException` catch) and moved it out of `updateGeminiComparison` transaction so concurrent/repeated scans never fail with `uq_ocr_result_cache_identity`.
- [x] **Transient Failure Retry vs Blank `0.00` Expense (`OcrService.kt`, `AsyncOcrService.kt`)**:
  - Marked all-transport-error OCR failures with `transient_failure = true` and raised `TransientOcrProviderException` in `AsyncOcrService.processOcrStage()` so `recordTransientFailure` retries with backoff (up to `MAX_ATTEMPTS = 3`) instead of immediately promoting a blank `0.00 EUR` expense.
- [x] **FX Rate Cache Race (`FxService.kt`, `ExpenseService.kt`)**:
  - Isolated `FxRate` persistence (`persistCachedRate`) in `PROPAGATION_REQUIRES_NEW` so concurrent `DataIntegrityViolationException` re-queries cleanly without poisoning caller transactions (`ExpenseService` already resolves FX rates outside `@Transactional`).

### 1.2 Fix Image / PDF Input Quality & MIME Bugs
- [x] **Client JPEG Compression Filename / MIME Mismatch (`frontend/lib/receiptCapture.ts`)**:
  - Added `compressedUploadName()` so compressed JPEG blobs upload with a `.jpg` filename extension matching the JPEG bytes.
- [x] **Server Magic-Byte MIME Detection (`OcrService.kt`)**:
  - Added `detectDocumentType()` in `scanModel()` to detect PDF, PNG, WEBP, and JPEG from `fileBytes` magic bytes before falling back to filename extension.
- [x] **Upgrade PDF Rendering DPI (`OcrService.kt`)**:
  - Upgraded `renderPdfPages()` scale from `1f` to adaptive `(1800f / maxDimension).coerceIn(1.5f, 2.5f)` so small receipts and PDF invoices are sharper for vision models.
- [x] **Client Compression in Bulk Upload (`frontend/components/expenses/BulkReviewDrawer.tsx`)**:
  - Compresses bulk image uploads client-side via `compressImage()` + `compressedUploadName()` before sending and visually flags `amount <= 0` rows for human review.

### 1.3 Harden Vision AI Prompt, Response Parsing & Bulk Reliability
- [x] **OpenAI-Compatible Transport Hardening (`OpenAiCompatibleClient.kt`, `OcrService.kt`)**:
  - Retries once without `"response_format": {"type": "json_object"}` if a provider rejects it with HTTP `400`/`422`, flags socket/HTTP timeouts clearly, and strips markdown fences / wrapper prose via `AiJsonSanitizer.extractJsonObject()`.
- [x] **Stronger Receipt Prompt & Field Normalization (`OcrService.kt`)**:
  - Clarified payable total vs subtotal/cash/change, comma decimal handling (`normalizeOcrNumber`), currency aliases (`LEI` → `RON`, `€` → `EUR`, `$` → `USD`, `£` → `GBP`), and flexible date normalization (`DD.MM.YYYY`/`DD/MM/YYYY` → `YYYY-MM-DD`); retains `bestPartial` metadata when no model returns a usable amount.
- [x] **Bulk Upload Parallel OCR (`BulkExpenseController.kt`)**:
  - Pre-scans validated bulk files concurrently across up to 4 threads before sequential DB/receipt persistence, keeping date parsing safe (`YYYY-MM-DD` validation fallback) and preserving idempotent manifest/receipt behavior.

---

## Milestone 2 — AI "Import Order" (Email Text → AI Models → New Report)

### 2.1 Resilient AI Model Chain & JSON Extraction
- [x] **Multi-Model Fallback by Default (`OcrService.kt`)**:
  - Updated `defaultOcrConfig()` and `migrateLegacyConfig()` so `delegationModelChain` defaults to all configured fallback models instead of only the first model.
- [x] **Lenient JSON & Prompt Hardening (`EmailImportService.kt`, `DelegationParsingSettingsService.kt`)**:
  - Strips markdown fences/prose via `AiJsonSanitizer.extractJsonObject()`, normalizes European dates via `parseDateFlexible()`, defaults `date_to = date_from` for single-day orders, strengthens forwarded-thread instructions, and enriches blank optional AI metadata fields from `parseDelegationEmailLocal()` without overriding explicit AI title/dates/description or introducing unsafe local-only fallbacks.

### 2.2 Non-Transactional AI Call, Preview Mode & Duplicate Protection
- [x] **Decouple AI HTTP Calls & Add Preview Endpoint (`ReportController.kt`, `EmailImportService.kt`, `ReportCreate.kt`, `ImportOrderPreviewOut.kt`, `ExpenseReportRepository.kt`)**:
  - Removed `@Transactional` from `ReportController.importOrder()` and `EmailImportService.importOrderForUser()` so slow AI HTTP calls never hold DB connections open.
  - Added `POST /api/reports/import-order/preview` (`ImportOrderPreviewOut`) including existing open-draft duplicate lookup by `kundenauftrag`, and extended `ReportCreate` + `ReportController.createReport()` to persist reviewed delegation metadata (`description` limit bumped to 5000 on `TEXT` column).
- [x] **Two-Button Modal UX: "Import" vs "Import & Review" (`frontend/app/reports/ReportsClient.tsx`, `frontend/lib/api.ts`, `frontend/lib/types/report.ts`, `frontend/messages/{en,ro}.json`)**:
  - Added clipboard `onPaste` HTML-table-to-structured-text normalizer (`htmlClipboardToText`).
  - Added **1st button (`Import`)** for 1-click AI parse → immediate draft report creation & redirect, and **2nd button (`Import & Review`)** for AI parse → editable review form with duplicate draft warning → `Create Report`.

---

## Milestone 3 — Verification, Docs Cleanup & Production Rollout

- [x] **Documentation Cleanup**: Reverted uncommitted EGM blueprint churn (`README.md` + 81 untracked nested `**/README.md` + `2026-10-27_DRIFT_REPORT.md`) while keeping `general-todo.md` and `important-todo.md`.
- [x] **Compose Default & Verification**:
  - Updated `docker-compose.yml` `NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED:-true`.
  - Verified targeted backend tests (`OcrServiceTest`, `AsyncOcrTest`, `FxServiceTest`, `BulkExpenseControllerTest`, `EmailImportServiceTest`, `ReportControllerImportOrderTest`, `DelegationParsingControllerTest`, `ExpenseServiceTest`) with `--no-daemon`.
  - Verified `cd frontend && npm run typecheck && npm run i18n:check`.
- [x] **Safe Production Rollout**: Built `xpenses-backend:ocr-import-20261114` and `xpenses-frontend:ocr-import-20261114`, backed up PostgreSQL (`pre-deploy.sql.gz`), updated `backend` and `frontend` containers cleanly via `--no-deps --wait` (no `docker compose down`, DB/Redis preserved), and verified live health and routes.
