# Domain Models & Entities

## Overview
Core JPA entities, soft-delete configurations, optimistic locking definitions, idempotency records, and OCR job state machine in `eu.nt.xpenses.model`.

## Interface
- `[User.kt:User]` — JPA entity (`users`) with authentication fields (`username`, `passwordHash` ignored in JSON, `authSource`, `tokenVersion`), authorization `role`, `isActive`, `signaturePath`, `notificationsEnabled`, and `language`
- `[RefreshToken.kt:RefreshToken]` — JPA entity (`refresh_tokens`) storing hashed refresh tokens, expiration, and rotation timestamps
- `[Category.kt:Category]` — JPA entity (`categories`) with unique `name`, `limitAmount`, and `isActive`
- `[ExpenseReport.kt:ExpenseReport]` — JPA entity (`expense_reports`) aggregate root holding report status, SAP/delegation order metadata (`kundenauftrag`, `auftragsart`, etc.), signature/approval/rejection audit fields, and child collections `expenses`, `advances`, and `mileageRecords`
- `[Expense.kt:Expense]` — JPA entity (`expenses`) holding original/EUR amounts, FX metadata, tax fields, `receipts`, and `verificationState` (`ExpenseVerificationState`)
- `[ExpenseVerificationState.kt:ExpenseVerificationState]` — `enum class` with `NOT_REQUIRED`, `PENDING`, `VERIFIED`
- `[ExpenseReviewOperation.kt:ExpenseReviewOperation]` — JPA entity (`expense_review_operations`) recording idempotent review corrections (`requestKey`, `requestHash`, `resultingVersion`)
- `[Receipt.kt:Receipt]` — JPA entity (`receipts`) storing receipt file paths and original filenames linked to an `Expense`
- `[AdvancePayment.kt:AdvancePayment]` — JPA entity (`advance_payments`) tracking requested/paid/rejected advances on an `ExpenseReport`
- `[MileageRecord.kt:MileageRecord]` — JPA entity (`mileage_records`) storing trip distances, fuel consumption/price parameters, and Romanian fiscal withholding calculations
- `[FxRate.kt:FxRate]` — JPA entity (`fx_rates`) caching currency conversion rates by `fromCurrency`, `toCurrency`, `rateDate`, `sourceDate`, and `source`
- `[AppSetting.kt:AppSetting]` — JPA entity (`app_settings`) storing string key-value configuration entries
- `[InsuranceFile.kt:InsuranceFile]` — JPA entity (`insurance_files`) storing user insurance document metadata and storage paths
- `[OcrComparison.kt:OcrComparison]` — JPA entity (`ocr_comparisons`) recording OCR extraction comparisons by SHA-256 and provider
- `[OcrJob.kt:OcrJob]` — JPA entity (`ocr_jobs`) representing leased background OCR/expense/receipt pipeline jobs and recovery state
- `[OcrJobActionOperation.kt:OcrJobActionOperation]` — JPA entity (`ocr_job_action_operations`) recording idempotent OCR job recovery actions
- `[OcrJobStateMachine.kt:OcrJobStage]` / `[OcrJobStateMachine.kt:OcrJobStatus]` / `[OcrJobStateMachine.kt:OcrJobStateMachine]` — pure state machine constants (`OCR`, `EXPENSE`, `RECEIPT`; `PENDING`, `PROCESSING`, `RETRY_WAIT`, `PAUSED`, `PERMANENT_FAILURE`, `CANCELLED`, `COMPLETED`, `EXPIRED`, `UNRECOVERABLE`) and lease-checked transitions `claim`, `completeStage`, and `recordTransientFailure`
- `[OcrResultCache.kt:OcrResultCache]` — JPA entity (`ocr_result_cache`) caching OCR responses by `sha256`, `provider`, `model`, and `contractVersion`

## Invariants
- `[Expense.kt:@SQLRestriction]` / `[Expense.kt:@SQLDelete]` / `[ExpenseReport.kt:@SQLRestriction]` / `[ExpenseReport.kt:@SQLDelete]` / `[Receipt.kt:@SQLRestriction]` / `[Receipt.kt:@SQLDelete]` — soft delete (`deleted = false` filter; `@SQLDelete` sets `deleted = true`, `deleted_at = NOW()` with optimistic `@Version` match on `Expense` and `ExpenseReport`)
- `[Expense.kt:Expense.version]` / `[ExpenseReport.kt:@Version]` / `[AdvancePayment.kt:AdvancePayment.version]` / `[MileageRecord.kt:MileageRecord.version]` — optimistic locking via `@Version`
- `[Expense.kt:Expense.receipts]` / `[ExpenseReport.kt:ExpenseReport.advances]` / `[ExpenseReport.kt:ExpenseReport.mileageRecords]` — `CascadeType.ALL` with `orphanRemoval = true` binds child lifecycles to parent aggregates
- `[ExpenseReviewOperation.kt:uq_expense_review_operations_key]` — unique constraint on `("user_id", "request_key")` enforces per-user review idempotency
- `[OcrJobActionOperation.kt:uq_ocr_job_action_operations_key]` — unique constraint on `("user_id", "job_id", "action", "request_key")` enforces per-job action idempotency
- `[OcrJobStateMachine.kt:OcrJobStateMachine.claim]` — claims only `PENDING` jobs or `RETRY_WAIT` jobs with `nextAttemptAt == null || nextAttemptAt <= now`, incrementing `attemptCount` and setting `PROCESSING` + lease
- `[OcrJobStateMachine.kt:OcrJobStateMachine.completeStage]` / `[OcrJobStateMachine.kt:OcrJobStateMachine.recordTransientFailure]` — require an active unexpired lease (`status == PROCESSING`, matching `leaseToken`, `leaseUntil > now`); `completeStage` advances `OCR -> EXPENSE (PENDING) -> RECEIPT (PENDING) -> COMPLETED`
- `[User.kt:User.username]` / `[Category.kt:Category.name]` — unique non-null constraints; `[User.kt:User.passwordHash]` is excluded from JSON serialization via `@field:JsonIgnore`
- `[AppSetting.kt:AppSetting.key]` — primary key (`@Id`) with non-null `value`; `[FxRate.kt:FxRate.source]` stored as `EnumType.STRING`

## Side Effects
- None (pure JPA entity definitions and state machine transitions)

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.ocr.OcrJobStateMachineTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
