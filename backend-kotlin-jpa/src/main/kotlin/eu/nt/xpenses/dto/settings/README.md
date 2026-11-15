# Settings DTOs

## Overview
Request and response data transfer objects for system settings management in `eu.nt.xpenses.dto.settings`, covering daily allowances, mobile UI flags, mileage tax/rate parameters, FX margins and provider testing, OCR provider/model chains, SMTP/IMAP configuration, email ingestion simulation, and ingestion retry requests.

## Interface
- `[IngestionRetryIn.kt:IngestionRetryIn]` — `data class IngestionRetryIn(@JsonProperty("message_key") val messageKey: String)`
- `[SettingsDtos.kt:DailyAllowanceOut]` / `[SettingsDtos.kt:DailyAllowanceUpdate]` — daily allowance rate DTOs (`daily_allowance_rate`)
- `[SettingsDtos.kt:MobileUiConfigOut]` / `[SettingsDtos.kt:MobileUiConfigUpdate]` — mobile quick-add FAB toggle DTOs (`mobile_quick_add_fab_enabled`)
- `[SettingsDtos.kt:MileageRatesOut]` / `[SettingsDtos.kt:MileageRatesUpdate]` — mileage rate, fuel consumption/price, pension/health/income tax rates, and deduction DTOs
- `[SettingsDtos.kt:FxMarginsOut]` / `[SettingsDtos.kt:FxMarginsUpdate]` — FX currency margin maps, default margin, and currency list DTOs
- `[SettingsDtos.kt:FxProvidersOut]` / `[SettingsDtos.kt:FxProvidersUpdate]` — ordered FX provider priority list DTOs
- `[SettingsDtos.kt:FxTestRequest]` / `[SettingsDtos.kt:FxTestResponse]` — FX lookup test request/response DTOs
- `[SettingsDtos.kt:OCRProviderOut]` / `[SettingsDtos.kt:OCRProviderUpdate]` — OCR provider configuration DTOs
- `[SettingsDtos.kt:OCRModelOut]` / `[SettingsDtos.kt:OCRModelUpdate]` — OCR model configuration DTOs
- `[SettingsDtos.kt:OCRConfigOut]` / `[SettingsDtos.kt:OCRConfigUpdate]` — OCR toggle, provider/model lists, and receipt/delegation model chains
- `[SettingsDtos.kt:OCRModelTestRequest]` — `data class OCRModelTestRequest(@JsonProperty("model_id") val modelId: String)`
- `[SettingsDtos.kt:EmailConfigOut]` / `[SettingsDtos.kt:EmailConfigIn]` / `[SettingsDtos.kt:TestEmailIn]` — SMTP configuration and test email DTOs
- `[SettingsDtos.kt:ImapConfigOut]` / `[SettingsDtos.kt:ImapConfigIn]` / `[SettingsDtos.kt:EmailSimulationIn]` — IMAP ingestion configuration and parsing simulation DTOs

## Invariants
- `[IngestionRetryIn.kt:IngestionRetryIn.messageKey]` — `@field:NotBlank` enforces non-blank `messageKey`
- `[SettingsDtos.kt:OCRModelTestRequest.modelId]` — `@field:NotBlank` enforces non-blank `modelId`
- `[SettingsDtos.kt:EmailConfigIn.smtpPort]` — `@field:Min(1)` enforces `smtpPort >= 1`
- `[SettingsDtos.kt:TestEmailIn.to]` — `@field:NotBlank` enforces non-blank `to`
- `[SettingsDtos.kt:ImapConfigIn.imapPort]` — `@field:Min(1)` enforces `imapPort >= 1`
- `[SettingsDtos.kt:EmailSimulationIn.fromAddress]` — `@field:NotBlank` enforces non-blank `fromAddress`
- `[SettingsDtos.kt:EmailSimulationIn.bodyText]` — `@field:NotBlank` enforces non-blank `bodyText`
- `[SettingsDtos.kt:FxProvidersUpdate.providers]` — `@field:NotEmpty` enforces non-empty `providers` list

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.controllers.OcrSettingsControllerTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
