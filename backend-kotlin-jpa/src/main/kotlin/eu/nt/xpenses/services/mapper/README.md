# Service Mappers

## Overview
Entity-to-DTO mapper component in `eu.nt.xpenses.services.mapper` translating `Expense` and `Receipt` JPA entities into outward API DTOs (`ExpenseOut`, `ReceiptOut`). Report projection lives in `eu.nt.xpenses.report.ReportProjector`.

## Interface
- `[ExpenseMapper.kt:ExpenseMapper]` — Spring `@Component` mapping `Expense` and `Receipt` entities
- `[ExpenseMapper.kt:toReceiptOut]` — `fun toReceiptOut(receipt: Receipt): ReceiptOut`
- `[ExpenseMapper.kt:toExpenseOut]` — `fun toExpenseOut(expense: Expense): ExpenseOut` mapping the expense and its child receipts

## Invariants
- `[ExpenseMapper.kt:toReceiptOut]` — requires non-null `receipt.id` and `receipt.expense.id` via `requireNotNull`
- `[ExpenseMapper.kt:toExpenseOut]` — requires non-null `expense.id` via `requireNotNull`; falls back to `expense.receiptPath` when mapped receipts are empty; sets `comparisonId = null` and `verificationState = expense.verificationState.name`

## Side Effects
- None (pure in-memory entity-to-DTO projection).

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.services.ExpenseServiceTest' --no-daemon`
