# OCR DTOs

## Overview
Data transfer objects for OCR job recovery state reporting and manual completion requests in `eu.nt.xpenses.dto.ocr`.

## Interface
- `[OcrJobRecoveryOut.kt:OcrJobRecoveryOut]` — `data class` representing OCR job recovery status and actions: `jobId` (`@JsonProperty("job_id")`), `status`, `stage`, `errorCode` (`@JsonProperty("error_code")`), `errorMessage` (`@JsonProperty("error_message")`), `retryable`, `allowedActions` (`@JsonProperty("allowed_actions")`), `expiresAt` (`@JsonProperty("expires_at")`), `expenseId` (`@JsonProperty("expense_id")`), `receiptId` (`@JsonProperty("receipt_id")`), `reportId` (`@JsonProperty("report_id")`), and `reportLinkStatus` (`@JsonProperty("report_link_status")`)
- `[OcrManualCompletionRequest.kt:OcrManualCompletionRequest]` — `data class` wrapping `values: OcrManualExpenseValues? = null`
- `[OcrManualCompletionRequest.kt:OcrManualExpenseValues]` — `data class` carrying manual override fields: `amount`, `currency`, `date`, `taxAmount` (`@JsonProperty("tax_amount")`), `taxRate` (`@JsonProperty("tax_rate")`), `merchant`, `description`, `categoryId` (`@JsonProperty("category_id")`), `fxRate` (`@JsonProperty("fx_rate")`), and `fxRateManual` (`@JsonProperty("fx_rate_manual")`)
- `[OcrManualCompletionRequest.kt:OcrManualExpenseValues.hasValues]` — `fun hasValues(): Boolean` returning whether any override field is non-null

## Invariants
- `[OcrManualCompletionRequest.kt:Valid]` — `@field:Valid` on `OcrManualCompletionRequest.values` enforces nested validation when present
- `[OcrManualCompletionRequest.kt:DecimalMin]` — `@field:DecimalMin(value = "0.0", inclusive = true)` on `amount`, `taxAmount`, and `taxRate` enforces non-negative values when present
- `[OcrManualCompletionRequest.kt:DecimalMin]` — `@field:DecimalMin(value = "0.0", inclusive = false)` on `fxRate` enforces strictly positive FX rates when present
- `[OcrManualCompletionRequest.kt:Pattern]` — `@field:Pattern(regexp = "^[A-Z]{3}$")` on `currency` enforces 3-letter uppercase ISO-style currency codes when present

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.controllers.OcrRecoveryControllerTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
