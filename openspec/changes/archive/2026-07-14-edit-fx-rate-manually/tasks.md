## 1. Database Migration

- [x] 1.1 Create `V26__add_fx_rate_manual_to_expenses.sql` — add `fx_rate_manual BOOLEAN NOT NULL DEFAULT false` column to `expenses` table

## 2. Backend Model & DTOs

- [x] 2.1 Add `fxRateManual: Boolean = false` field to `Expense` entity in `Models.kt`
- [x] 2.2 Add optional `fxRate: BigDecimal?` and `fxRateManual: Boolean?` fields to `ExpenseCreate` DTO in `ExpenseController.kt`
- [x] 2.3 Add optional `fxRate: BigDecimal?` and `fxRateManual: Boolean?` fields to `ExpenseUpdate` DTO in `ExpenseController.kt`
- [x] 2.4 Add `fxRateManual: Boolean` field to `ExpenseOut` DTO in `ExpenseController.kt`
- [x] 2.5 Map `fxRateManual` in `ExpenseMapper.kt`

## 3. Backend Service — Create/Update

- [x] 3.1 Modify `ExpenseService.createExpense` — use `body.fxRate` when non-null (skip API call, set `fxRateManual=true`), fall back to `FxService.getRate()` when null
- [x] 3.2 Modify `ExpenseService.updateExpense` — use `body.fxRate` when non-null (skip recalculation, set `fxRateManual=true`), fall back to existing behavior when null

## 4. Backend Service — Duplicate

- [x] 4.1 Modify `ExpenseService.duplicateExpense` — preserve `fxRate` and `fxRateManual` from source expense instead of re-fetching from API

## 5. Frontend Types

- [x] 5.1 Add `fx_rate_manual: boolean` to `Expense` interface in `lib/api.ts`

## 6. Frontend — Inline Editable FX Rate Field

- [x] 6.1 Add inline FX rate display + pencil edit toggle in `ExpenseForm.tsx` (shown only when currency != EUR)
- [x] 6.2 Wire save to send `fxRate` and `fxRateManual: true` when user has overridden the rate
- [x] 6.3 Ensure form sends no `fxRate` when user has not edited the rate (backend auto-fetches)

## 7. Frontend — Manual Badge Display

- [x] 7.1 Add "manual" badge to expense list rows in `ExpensesClient.tsx` (desktop table + mobile cards)
- [x] 7.2 Add "manual" badge to report detail expense rows in `reports/[id]/page.tsx`

## 8. PDF Export

- [x] 8.1 Modify `PdfService.kt` — append "(manual)" suffix to FX rate line when `fxRateManual` is true

## 9. Tests

- [x] 9.1 Add backend tests: creating expense with manual rate, updating with manual rate, preserving manual rate on duplicate
- [x] 9.2 Verify existing tests still pass (`make test`)
- [x] 9.3 Verify frontend compiles (`tsc --noEmit`) and lints (`npm run lint`)
