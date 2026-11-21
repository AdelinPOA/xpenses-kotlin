# Report DTOs

## Overview
Request and response data transfer objects in `eu.nt.xpenses.dto.report` for expense reports, bulk status transitions, SAP/delegation order import previews, advance payments, and mileage records.

## Interface
- `[AdvancePayBody.kt:AdvancePayBody]` — `data class` for paying an advance (`amount`, `currency = "EUR"`, `date`)
- `[AdvancePaymentCreate.kt:AdvancePaymentCreate]` — `data class` for creating/requesting an advance (`type = "paid"`, `amount`, `currency = "EUR"`, `date`, `description`)
- `[AdvancePaymentOut.kt:AdvancePaymentOut]` — `data class` representing advance payment state, FX conversion, and pay/reject audit fields
- `[AdvancePaymentUpdate.kt:AdvancePaymentUpdate]` — `data class` for patching advance fields (`amount`, `currency`, `date`, `description`)
- `[AdvanceRejectBody.kt:AdvanceRejectBody]` — `data class AdvanceRejectBody(reason: String = "")`
- `[PendingAdvanceOut.kt:PendingAdvanceOut]` — `data class` extending advance output with `userDisplayName` and `reportTitle`
- `[BulkStatusBody.kt:BulkStatusBody]` / `[BulkStatusBody.kt:BulkStatusFailure]` / `[BulkStatusBody.kt:BulkStatusResult]` — bulk report status action payload and per-ID outcome DTOs
- `[ImportOrderIn.kt:ImportOrderIn]` — `data class ImportOrderIn(bodyText: String)`
- `[ImportOrderPreviewOut.kt:ImportOrderPreviewOut]` — `data class` representing parsed delegation/SAP order metadata and matching existing draft report info
- `[MileageRecordCreate.kt:MileageRecordCreate]` / `[MileageRecordUpdate.kt:MileageRecordUpdate]` / `[MileageRecordOut.kt:MileageRecordOut]` — mileage record request DTOs (`vehicle_id`, `clear_vehicle`, `round_trip`) and detailed output DTO with fuel price/source, tax withholding breakdown, vehicle snapshot fields, and `durationMinutes`
- `[RejectBody.kt:RejectBody]` — `data class RejectBody(reason: String = "")`
- `[ReportCreate.kt:ReportCreate]` / `[ReportUpdate.kt:ReportUpdate]` / `[ReportSubmit.kt:ReportSubmit]` / `[ReportOut.kt:ReportOut]` — report lifecycle request/response DTOs including child expenses, advances, mileage records, daily allowance, `totalReimbursable`, `starting_odometer_km`, `clear_starting_odometer`, and SAP order fields

## Invariants
- `[AdvancePayBody.kt:Min]` / `[AdvancePaymentCreate.kt:Min]` / `[AdvancePaymentUpdate.kt:Min]` — `amount >= 0` (`@field:Min(0)`)
- `[AdvancePayBody.kt:Pattern]` / `[AdvancePaymentCreate.kt:Pattern]` / `[AdvancePaymentUpdate.kt:Pattern]` — `currency` must match `^[A-Z]{3}$` (and `@field:NotBlank` on create/pay bodies)
- `[AdvancePayBody.kt:NotBlank]` — `date` must not be blank
- `[AdvancePaymentCreate.kt:NotBlank]` — `type` must not be blank
- `[BulkStatusBody.kt:NotEmpty]` — `ids` must not be empty
- `[ImportOrderIn.kt:NotBlank]` / `[ImportOrderIn.kt:Size]` — `bodyText` must not be blank and max length is `50000`
- `[MileageRecordCreate.kt:NotBlank]` — `origin` and `destination` must not be blank
- `[MileageRecordCreate.kt:DecimalMin]` / `[MileageRecordUpdate.kt:DecimalMin]` — `distanceKm >= 0.01`
- `[ReportCreate.kt:NotBlank]` — `title` must not be blank
- `[ReportCreate.kt:Size]` — `description` max length is `5000`
- `[ReportUpdate.kt:Size]` — `description` max length is `1000`

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.controllers.ReportControllerImportOrderTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
