# Domain API Clients (`frontend/lib/api`)

## Overview
Domain-focused HTTP client functions built on top of the shared Axios `api` instance (`../api.ts`), exposing typed endpoint wrappers for admin settings (FX providers, OCR, storage, IMAP ingestion), delegation email parsing, expense bulk upload/duplication, and review queue operations.

## Interface
- `[admin.ts:getFxProviders]`: `() => Promise<FxProvidersConfig>` — fetches FX provider configuration (`GET /settings/fx-providers`).
- `[admin.ts:updateFxProviders]`: `(providers: string[]) => Promise<FxProvidersConfig>` — updates FX providers (`PATCH /settings/fx-providers`).
- `[admin.ts:testFxProvider]`: `(currency: string, date?: string) => Promise<FxTestResult>` — tests FX provider lookup (`POST /settings/fx-providers/test`).
- `[admin.ts:getOcrConfig]`: `() => Promise<OcrConfig>` — fetches OCR configuration (`GET /settings/ocr`).
- `[admin.ts:updateOcrConfig]`: `(config: OcrConfigUpdate) => Promise<OcrConfig>` — updates OCR configuration (`PATCH /settings/ocr`).
- `[admin.ts:testOcrModel]`: `(modelId: string) => Promise<{ success: boolean; message: string }>` — tests an OCR model (`POST /settings/ocr/models/test`).
- `[admin.ts:getOcrComparisons]`: `() => Promise<OCRComparisonHistoryResponse>` — fetches OCR comparison history (`GET /ocr/comparison`).
- `[admin.ts:getStorageConfig]`: `() => Promise<StorageConfig>` — fetches storage configuration (`GET /settings/storage`).
- `[admin.ts:updateStorageConfig]`: `(config: StorageConfig, migrateExisting?: boolean) => Promise<StorageConfig>` — updates storage configuration (`PATCH /settings/storage?migrate_existing={migrateExisting}`).
- `[admin.ts:testStorageConfig]`: `(config: StorageConfig) => Promise<{ success: boolean; message: string }>` — tests storage configuration (`POST /settings/storage/test`).
- `[admin.ts:getStorageMigrationStatus]`: `() => Promise<StorageMigrationStatus>` — fetches storage migration status (`GET /settings/storage/migration-status`).
- `[admin.ts:simulateEmailIngestion]`: `(payload: EmailSimulationIn) => Promise<EmailSimulationOut>` — simulates IMAP email ingestion (`POST /settings/imap/simulate`).
- `[admin.ts:getImapIngestionRecovery]`: `() => Promise<ImapIngestionRecovery[]>` — fetches IMAP ingestion recovery entries (`GET /settings/imap/ingestion`).
- `[admin.ts:retryImapIngestion]`: `(messageKey: string) => Promise<{ message_key: string; acknowledged: boolean; processed: boolean; rejected: boolean; reason?: string | null }>` — retries IMAP ingestion (`POST /settings/imap/ingestion/retry`).
- `[delegationParsing.ts:getDelegationParsingConfig]`: `() => Promise<DelegationParsingConfig>` — fetches delegation email parsing config (`GET /settings/imap/parsing`).
- `[delegationParsing.ts:updateDelegationParsingConfig]`: `(config: DelegationParsingConfig) => Promise<DelegationParsingConfig>` — updates delegation email parsing config (`PATCH /settings/imap/parsing`).
- `[delegationParsing.ts:previewDelegationEmail]`: `(request: DelegationPreviewRequest) => Promise<DelegationPreviewResult>` — previews delegation email parsing (`POST /settings/imap/preview`).
- `[expenses.ts:bulkUploadExpenses]`: `(files: File[]) => Promise<BulkUploadResult>` — uploads receipt files via `FormData` (`POST /expenses/bulk-upload`).
- `[expenses.ts:duplicateExpense]`: `(expenseId: number) => Promise<Expense>` — duplicates an expense (`POST /expenses/{expenseId}/duplicate`).
- `[reviewQueue.ts:BulkStatusResult]`: Exported interface `{ succeeded: number[]; failed: { id: number; reason: string | null }[] }`.
- `[reviewQueue.ts:getReviewQueue]`: `() => Promise<ReviewQueueItem[]>` — fetches review queue items (`GET /review-queue`).
- `[reviewQueue.ts:bulkReportStatus]`: `(ids: number[], action: "approve" | "reject", reason?: string) => Promise<BulkStatusResult>` — submits bulk report status updates (`POST /reports/bulk-status`).

## Invariants
- `[admin.ts:updateStorageConfig]`: Defaults `migrateExisting` to `false` when constructing the `migrate_existing` query parameter.
- `[admin.ts:testOcrModel]`: Serializes `modelId` into snake_case request key `model_id`.
- `[admin.ts:retryImapIngestion]`: Serializes `messageKey` into snake_case request key `message_key`.
- `[expenses.ts:bulkUploadExpenses]`: Appends each `File` in `files` to `FormData` under the repeated `"files"` field name.
- `[reviewQueue.ts:bulkReportStatus]`: Includes `reason` in the request payload only when `action === "reject"`.

## Side Effects
- `[admin.ts:getFxProviders]`, `[admin.ts:updateFxProviders]`, `[admin.ts:testFxProvider]`, `[admin.ts:getOcrConfig]`, `[admin.ts:updateOcrConfig]`, `[admin.ts:testOcrModel]`, `[admin.ts:getOcrComparisons]`, `[admin.ts:getStorageConfig]`, `[admin.ts:updateStorageConfig]`, `[admin.ts:testStorageConfig]`, `[admin.ts:getStorageMigrationStatus]`, `[admin.ts:simulateEmailIngestion]`, `[admin.ts:getImapIngestionRecovery]`, `[admin.ts:retryImapIngestion]`: Perform authenticated HTTP requests against `/settings/*` and `/ocr/comparison` via `../api`.
- `[delegationParsing.ts:getDelegationParsingConfig]`, `[delegationParsing.ts:updateDelegationParsingConfig]`, `[delegationParsing.ts:previewDelegationEmail]`: Perform HTTP requests against `/settings/imap/parsing` and `/settings/imap/preview` via `../api`.
- `[expenses.ts:bulkUploadExpenses]`, `[expenses.ts:duplicateExpense]`: Perform HTTP `POST` requests against `/expenses/bulk-upload` (multipart `FormData`) and `/expenses/{expenseId}/duplicate` via `../api`.
- `[reviewQueue.ts:getReviewQueue]`, `[reviewQueue.ts:bulkReportStatus]`: Perform HTTP requests against `/review-queue` and `/reports/bulk-status` via `../api`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
