# Expense Subsystem

## Overview
Consolidated domain module in `eu.nt.xpenses.expense` owning `Expense` CRUD, filtered/paged listing, durable keyed creation and receipt attachment, explicit owner verification, receipt storage lifecycle, bulk intake persistence, and CSV/XLSX export packaging.

## Interface
- `[Expenses.kt:Expenses]` — `@Service` entrypoint exposing `listExpenses`, `getExpense`, `createExpense`, `updateExpense`, `verifyExpense`, `duplicateExpense`, `deleteExpense`, `uploadReceipts`, `deleteSingleReceipt`, `getReceiptDownload`, `getReceiptBytes`, `exportExpenses`, `prepareBulkBatch`, and `bulkCreate`
- `[ExpenseProjector.kt:ExpenseProjector]` — `@Component` projecting `Expense` and `Receipt` entities into `ExpenseOut` and `ReceiptOut`
- `[ExpenseVersionConflict.kt:ExpenseVersionConflict]` — optimistic locking conflict exception carrying the current `ExpenseOut` state

## Invariants
- `[Expenses.kt:Expenses]` — enforces `Authorization` view/mutate checks, `draft`-only edits/deletions/receipt uploads, active `Category` checks, `draft`-only report attachment, and `SaveIdempotencyService` keyed save identity and manifest binding
- `[ExpenseReviewVerifier.kt:ExpenseReviewVerifier]` — enforces owner-only attestation, `expected_version` optimistic locking, active `OcrJob` linkage, attached `Receipt` requirement on `confirm = true`, and advisory-locked `ExpenseReviewOperation` idempotency
- `[ExpenseReceipts.kt:ExpenseReceipts]` — binds `TransactionSynchronization` hooks to delete uncommitted receipt files on rollback and committed-for-deletion files only after DB commit

## Side Effects
- `[Expenses.kt:Expenses]` — reads/writes `Expense`, `Receipt`, `ExpenseReport`, `OcrComparison`, and `ExpenseReviewOperation` rows; delegates binary receipt I/O to `StorageService` and FX rate lookups to `FxService`

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.expense.ExpensesTest' --tests 'eu.nt.xpenses.controllers.ExpenseIdempotencyTest' --tests 'eu.nt.xpenses.controllers.ExpenseControllerTest' --tests 'eu.nt.xpenses.controllers.BulkExpenseControllerTest' --no-daemon`
