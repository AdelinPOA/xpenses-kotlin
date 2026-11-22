# Report Subsystem

## Overview
Consolidated domain module in `eu.nt.xpenses.report` owning `ExpenseReport` CRUD, filtered/paged listing, idempotent creation, bulk status transitions, order-import delegation, batch `ReportOut` projection, canonical totals/daily allowance math, and PDF/ZIP/CSV/XLSX export packaging, alongside transactional lifecycle transitions (`lifecycle/`) and the manager/finance review queue (`review/`).

## Interface
- `[ExpenseReports.kt:ExpenseReports]` — `@Service` entrypoint exposing `listReports`, `createReport`, `previewImportOrder`, `importOrder`, `getReport`, `updateReport`, `deleteDraft`, `attachExpenses`, `submitReport`, `recallReport`, `approveReport`, `rejectReport`, `payReport`, `signReport`, `bulkStatus`, `exportReportPdf`, `downloadReceiptsZip`, `exportReports`, and `exportReportExpenses`
- `[ReportProjector.kt:ReportProjector]` — `@Component` projecting `ExpenseReport` into `ReportOut` (`toReportOut`, `toReportOuts` with single-rate batch lookup)
- `[ReportTotals.kt:ReportTotals]` — canonical totals calculator (`calculate`, `calculateDailyAllowance`) distinguishing `apiReimbursableEur` (includes mileage) from `pdfReimbursableEur` (excludes mileage)
- `[ReportTotals.kt:DailyAllowanceRatePort]` / `[ReportTotals.kt:AppSettingsDailyAllowanceAdapter]` — daily allowance rate lookup port and Spring `@Component` adapter delegating to `AppSettingsService.getDailyAllowanceRate`
- `[ReportExporter.kt:ReportFileDownload]` — downloadable file payload (`filename`, `contentType`, `bytes`) built by internal `ReportExporter`
- `lifecycle`: [./lifecycle/README.md](./lifecycle/README.md) — Transactional `ExpenseReportLifecycle` state machine, commands/events, and async email notification adapter
- `review`: [./review/README.md](./review/README.md) — Manager/finance review queue reader (`ReviewQueueReader`), projection, and queue item DTO

## Invariants
- `[ReportTotals.kt:ReportTotals.calculate]` — `apiReimbursableEur = totalExpensesEur + dailyAllowanceEur + totalMileageEur - totalPaidAdvancesEur`; `pdfReimbursableEur = totalExpensesEur + dailyAllowanceEur - totalPaidAdvancesEur` (explicitly excludes mileage); only advances with `status == "paid"` are deducted; invalid/reversed dates yield `BigDecimal.ZERO` allowance
- `[ReportProjector.kt:ReportProjector.toReportOuts]` — resolves `DailyAllowanceRatePort` once per batch call instead of querying `app_settings` per report
- `[ExpenseReports.kt:ExpenseReports]` — enforces `Authorization` view/manage/owner checks, `draft`-only mutations, `VehicleMileage.validateAndNormalizeOdometerKm`, `SaveIdempotencyService` keyed report creation, independent per-report `bulkStatus` transactions, and eager materialization inside `readTx` before PDF/ZIP I/O

## Side Effects
- `[ExpenseReports.kt:ExpenseReports]` — reads/writes `ExpenseReport` entities, delegates transitions to `ExpenseReportLifecycle`, advances primary vehicle odometer best-effort on submit via `VehicleMileage`, dispatches lifecycle notifications, delegates order import to `EmailImportService`, and renders/archives PDF, ZIP, CSV, and XLSX exports via `PdfService`, `StorageService`, and `ExportService`

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.report.ExpenseReportsTest' --tests 'eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycleTest' --tests 'eu.nt.xpenses.report.ReportStateMachineTest' --no-daemon`
