# Service Mappers

## Overview
Entity-to-DTO mapper components in `eu.nt.xpenses.services.mapper` translating JPA entities (`Expense`, `Receipt`, `ExpenseReport`, `AdvancePayment`, `MileageRecord`) into outward API DTOs and computing report reimbursement totals.

## Interface
- `[ExpenseMapper.kt:ExpenseMapper]` — Spring `@Component` mapping `Expense` and `Receipt` entities
- `[ExpenseMapper.kt:toReceiptOut]` — `fun toReceiptOut(receipt: Receipt): ReceiptOut`
- `[ExpenseMapper.kt:toExpenseOut]` — `fun toExpenseOut(expense: Expense): ExpenseOut` mapping the expense and its child receipts
- `[ReportMapper.kt:ReportMapper]` — Spring `@Component` mapping report, advance, and mileage entities and computing reimbursement amounts
- `[ReportMapper.kt:mapAdvanceToOut]` — `fun mapAdvanceToOut(adv: AdvancePayment): AdvancePaymentOut`
- `[ReportMapper.kt:mapRecordToOut]` — `fun mapRecordToOut(m: MileageRecord): MileageRecordOut` including computed `durationMinutes`
- `[ReportMapper.kt:getDailyAllowanceRate]` — `fun getDailyAllowanceRate(): BigDecimal` returning configured `daily_allowance_rate` or default `50.00`
- `[ReportMapper.kt:calculateDailyAllowance]` — `fun calculateDailyAllowance(dateFrom: String?, dateTo: String?): BigDecimal`
- `[ReportMapper.kt:mapReportToOut]` — `fun mapReportToOut(report: ExpenseReport): ReportOut` aggregating child expenses, advances, mileage, daily allowance, and `totalReimbursable`

## Invariants
- `[ExpenseMapper.kt:toReceiptOut]` — requires non-null `receipt.id` and `receipt.expense.id` via `requireNotNull`
- `[ExpenseMapper.kt:toExpenseOut]` — requires non-null `expense.id` via `requireNotNull`; falls back to `expense.receiptPath` when mapped receipts are empty; sets `comparisonId = null` and `verificationState = expense.verificationState.name`
- `[ReportMapper.kt:mapAdvanceToOut]` — asserts non-null `adv.id!!`, `adv.report.id!!`, and `adv.user.id!!`
- `[ReportMapper.kt:mapRecordToOut]` — asserts non-null `m.id!!`, `m.report.id!!`, and `m.user.id!!`
- `[ReportMapper.kt:mapReportToOut]` — asserts non-null `report.id!!`; only advances with `status == "paid"` are summed into `totalAdvances` and deducted from `totalReimbursable`
- `[ReportMapper.kt:calculateDailyAllowance]` — requires non-null, non-empty `dateFrom`/`dateTo` in `yyyy-MM-dd` format with positive inclusive day count; returns `BigDecimal.ZERO` on invalid or unparseable dates

## Side Effects
- `[ReportMapper.kt:getDailyAllowanceRate]` — DB read via `appSettingRepository.findById("daily_allowance_rate")`
- `[ReportMapper.kt:calculateDailyAllowance]` — DB read via `appSettingRepository.findById("daily_allowance_rate")` and `log.warn` on date parsing/calculation failure

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.services.ExpenseServiceTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
