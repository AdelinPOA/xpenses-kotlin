# Expense DTOs

## Overview
Request and response data transfer objects for expense creation, updates, optimistic-concurrency review corrections, receipt metadata, and bulk receipt upload results in `eu.nt.xpenses.dto.expense`.

## Interface
- `[BulkUploadError.kt:BulkUploadError]` — `data class BulkUploadError(filename: String, reason: String, expenseId: Int? = null, fileIndex: Int? = null)`
- `[BulkUploadResult.kt:BulkUploadResult]` — `data class BulkUploadResult(created: List<ExpenseOut>, errors: List<BulkUploadError>)`
- `[ExpenseCreate.kt:ExpenseCreate]` — `data class` for creating expenses (`categoryId`, `reportId`, `amount`, `currency = "EUR"`, `taxAmount = BigDecimal.ZERO`, `taxRate`, `date`, `description`, `merchant`, `rawOcrText`, `comparisonId`, `fxRate`, `fxRateManual`)
- `[ExpenseOut.kt:ExpenseOut]` — `data class` representing serialized expense state including original/EUR amounts, FX metadata, tax fields, `receipts: List<ReceiptOut>`, `version`, and verification state fields
- `[ExpenseReviewRequest.kt:ExpenseReviewRequest]` — `data class ExpenseReviewRequest(expectedVersion: Int, values: ExpenseReviewValues = ExpenseReviewValues(), confirm: Boolean = false)`
- `[ExpenseReviewRequest.kt:ExpenseReviewValues]` — `data class` holding optional review correction fields and `clearCategory: Boolean = false`
- `[ExpenseReviewRequest.kt:ExpenseReviewValues.hasCorrections]` — `fun hasCorrections(): Boolean` returning `true` when any correction field or `clearCategory` is set
- `[ExpenseUpdate.kt:ExpenseUpdate]` — `data class` holding optional expense patch fields and `clearCategory: Boolean = false`
- `[ReceiptOut.kt:ReceiptOut]` — `data class ReceiptOut(id: Int, expenseId: Int, filePath: String, originalName: String?, createdAt: Instant)`

## Invariants
- `[ExpenseCreate.kt:amount]` — `@field:Min(0)` enforces non-negative `amount`
- `[ExpenseCreate.kt:currency]` — `@field:NotBlank` and `@field:Pattern(regexp = "^[A-Z]{3}$")` enforce a 3-letter uppercase ISO currency code
- `[ExpenseCreate.kt:date]` — `@field:NotBlank` enforces non-blank `date`
- `[ExpenseCreate.kt:fxRate]` — `@field:DecimalMin(value = "0.0", inclusive = false)` enforces strictly positive `fxRate` when provided
- `[ExpenseReviewRequest.kt:expectedVersion]` — `@field:Min(0)` enforces non-negative `expectedVersion`
- `[ExpenseReviewRequest.kt:values]` — `@field:Valid` cascades validation to `ExpenseReviewValues`
- `[ExpenseReviewRequest.kt:ExpenseReviewValues.amount]` — `@field:DecimalMin(value = "0.0", inclusive = true)` enforces `>= 0.0` when provided
- `[ExpenseReviewRequest.kt:ExpenseReviewValues.currency]` — `@field:Pattern(regexp = "^[A-Z]{3}$")` enforces 3-letter uppercase code when provided
- `[ExpenseReviewRequest.kt:ExpenseReviewValues.taxAmount]` — `@field:DecimalMin(value = "0.0", inclusive = true)` enforces `>= 0.0` when provided
- `[ExpenseReviewRequest.kt:ExpenseReviewValues.taxRate]` — `@field:DecimalMin(value = "0.0", inclusive = true)` enforces `>= 0.0` when provided
- `[ExpenseReviewRequest.kt:ExpenseReviewValues.fxRate]` — `@field:DecimalMin(value = "0.0", inclusive = false)` enforces `> 0.0` when provided
- `[ExpenseUpdate.kt:amount]` — `@field:Min(0)` enforces `>= 0` when provided
- `[ExpenseUpdate.kt:currency]` — `@field:Pattern(regexp = "^[A-Z]{3}$")` enforces 3-letter uppercase code when provided
- `[ExpenseUpdate.kt:fxRate]` — `@field:DecimalMin(value = "0.0", inclusive = false)` enforces `> 0.0` when provided

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.controllers.ExpenseControllerTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
