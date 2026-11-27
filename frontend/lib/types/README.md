# Frontend Domain Types (`frontend/lib/types`)

## Overview
Shared TypeScript interfaces, union types, literal constants, and runtime type guards modeling API request/response payloads and domain entities across expenses, reports, dashboard metrics, review queue items, user profiles, insurance documents, search results, delegation email parsing, and admin configuration.

## Interface
- `[index.ts]`: Barrel export re-exporting all symbols from `./common`, `./expense`, `./report`, `./user`, `./dashboard`, `./admin`, `./insurance`, `./search`, and `./vehicle` (does not re-export `./delegationParsing` or `./reviewQueue`).
- `[common.ts:PagedResponse]`: Generic paginated envelope `PagedResponse<T>` (`data: T[]`, `page`, `size`, `total_elements`, `total_pages`).
- `[common.ts:isPagedResponse]`: Type guard `(r: T[] | PagedResponse<T>) => r is PagedResponse<T>`.
- `[common.ts:CURRENCIES]`: Readonly 51-element tuple of supported ISO currency codes (`EUR`, `USD`, `GBP`, `RON`, `CHF`, etc.).
- `[common.ts:Currency]`: Literal union `(typeof CURRENCIES)[number]`.
- `[admin.ts:LdapConfig]`, `[admin.ts:LdapSyncResult]`, `[admin.ts:LdapTestResult]`: LDAP directory integration settings, sync summary, and connection preview contracts.
- `[admin.ts:SmtpConfig]`, `[admin.ts:SmtpTestResult]`, `[admin.ts:ImapConfig]`, `[admin.ts:ImapTestResult]`: Mail (SMTP) and email ingestion (IMAP) configuration and test result contracts.
- `[admin.ts:ImapIngestionStatus]`, `[admin.ts:ImapAcknowledgementStatus]`, `[admin.ts:ImapIngestionRecovery]`: IMAP ingestion recovery record and status unions (`"CLAIMED" | "FAILED" | "PROCESSED" | "REJECTED"`, `"NONE" | "PENDING" | "CONFIRMED"`).
- `[admin.ts:OcrProvider]`, `[admin.ts:OcrProviderUpdate]`, `[admin.ts:OcrModel]`, `[admin.ts:OcrModelUpdate]`, `[admin.ts:OcrConfig]`, `[admin.ts:OcrConfigUpdate]`: OCR provider catalog, model chain, and partial update contracts.
- `[admin.ts:MobileUiConfig]`, `[admin.ts:StorageConfig]`, `[admin.ts:StorageMigrationStatus]`, `[admin.ts:FxMargins]`, `[admin.ts:FxProvidersConfig]`, `[admin.ts:FxTestResult]`, `[admin.ts:FxProviderHealthItem]`, `[admin.ts:FxLastDbRate]`, `[admin.ts:FxHealthStatus]`, `[admin.ts:FuelProviderHealthItem]`, `[admin.ts:FuelLastDbPrice]`, `[admin.ts:FuelPriceHealthStatus]`, `[admin.ts:FuelProvidersConfig]`: Mobile UI feature flag, storage backend/migration, and FX/fuel margin, provider, and health status contracts.
- `[admin.ts:OCRComparisonStats]`, `[admin.ts:OCRComparisonRow]`, `[admin.ts:OCRComparisonHistoryResponse]`: OCR prediction accuracy and comparison history contracts.
- `[dashboard.ts:DashboardStats]`, `[dashboard.ts:ManagerKpis]`, `[dashboard.ts:PendingReportSummary]`, `[dashboard.ts:PendingAdvanceSummary]`, `[dashboard.ts:ActivityFeedItem]`, `[dashboard.ts:ManagerDashboardStats]`: User and manager dashboard analytics and pending-action summaries.
- `[delegationParsing.ts:DelegationParsingConfig]`, `[delegationParsing.ts:DelegationPreviewRequest]`, `[delegationParsing.ts:DelegationPreviewResult]`: Delegation email parser prompt settings and preview request/response contracts.
- `[expense.ts:Category]`, `[expense.ts:Receipt]`, `[expense.ts:Expense]`, `[expense.ts:BulkUploadError]`, `[expense.ts:BulkUploadResult]`, `[expense.ts:OCRScanResult]`: Expense, category, receipt attachment, bulk upload, and OCR scan result contracts.
- `[insurance.ts:InsuranceFile]`: Employee insurance document metadata contract.
- `[report.ts:AdvancePayment]`, `[report.ts:PendingAdvance]`, `[report.ts:MileageRecord]`, `[report.ts:MileageCreatePayload]`, `[report.ts:MileageUpdatePayload]`, `[report.ts:MileageRates]`, `[report.ts:Report]`, `[report.ts:ReportCreatePayload]`, `[report.ts:ImportOrderPreview]`, `[report.ts:EmailSimulationParsed]`, `[report.ts:EmailSimulationOut]`, `[report.ts:EmailSimulationIn]`: Expense report, advance payment, mileage (with optional optimistic-lock `version`), order import preview, and email simulation contracts.
- `[reviewQueue.ts:ReviewQueueItem]`: Review queue report summary contract.
- `[search.ts:SearchResult]`: Cross-entity global search result contract (`reports`, `expenses`, optional `users`, `insurance`, `advances`, and counts).
- `[user.ts:User]`: User account contract (`id`, `username`, `display_name`, `email`, `role`, `is_active`, `auth_source`, `notifications_enabled`, `language`, timestamps).
- `[vehicle.ts:FuelType]`, `[vehicle.ts:UserVehicle]`, `[vehicle.ts:UserVehicleCreatePayload]`, `[vehicle.ts:UserVehicleUpdatePayload]`: Personal vehicle fuel type union (`"petrol" | "diesel" | "hybrid" | "electric" | "lpg"`), vehicle record, create payload, and partial update payload with `clear_*` flags.

## Invariants
- `[common.ts:isPagedResponse]`: Discriminates `PagedResponse<T>` from `T[]` via `!Array.isArray(r) && r.data !== undefined`.
- `[common.ts:CURRENCIES]`: Declared `as const`, fixing `Currency` to the exact 51-code readonly tuple.
- `[admin.ts:OcrProviderUpdate]`: `api_key` is only supplied when setting a new key; omitting/leaving it empty preserves any previously stored key.
- `[admin.ts:OcrConfigUpdate]`: `PATCH` payload fields are independent so omitted workflows and catalog entries remain unchanged.
- `[admin.ts:OcrModelUpdate]`: Excludes server-computed `tested` via `Omit<OcrModel, "tested">`.
- `[admin.ts:ImapIngestionStatus]`, `[admin.ts:ImapAcknowledgementStatus]`, `[admin.ts:StorageMigrationStatus]`: Restrict statuses to `"CLAIMED" | "FAILED" | "PROCESSED" | "REJECTED"`, `"NONE" | "PENDING" | "CONFIRMED"`, and `"idle" | "running" | "completed" | "failed"`.
- `[delegationParsing.ts:DelegationPreviewRequest]` & `[delegationParsing.ts:DelegationPreviewResult]`: Restrict parser modes to `"ai" | "local"`.
- `[report.ts:AdvancePayment]` & `[report.ts:EmailSimulationIn]`: Restrict advance status to `"paid" | "requested" | "rejected"` and simulation parser to `"local" | "ai" | "gemini" | null`.
- `[user.ts:User]`: Restricts `role` to `"technician" | "manager" | "chef_finance" | "mod"` and `auth_source` to `"local" | "ldap"`.
- `[index.ts]`: Does not re-export `./delegationParsing` or `./reviewQueue`; consumers must import those modules directly.

## Side Effects
- None

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
