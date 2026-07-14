## Why

Multi-currency expense entries rely on live FX rates from external APIs (Frankfurter/fawazahmed0). These rates fluctuate daily and may not match the actual exchange rate used at reimbursement time. Users need the ability to manually override the per-expense FX rate to match the actual rate applied by their bank or company policy.

## What Changes

- Add `fx_rate_manual` boolean column to the `expenses` table to track whether the rate was user-set vs auto-fetched
- Allow `fxRate` to be supplied in expense create/update DTOs — when provided, skip the API call and use the user-supplied value
- Show the current FX rate as an editable inline field in the expense form (only for non-EUR currencies) with an "Auto" / "Manual" toggle indicator
- Display a "manual" badge on expense list/report/PDF views for overridden rates
- `duplicateExpense` preserves the source expense's `fxRate` and `fxRateManual` flag instead of re-fetching

## Capabilities

### New Capabilities
- `manual-fx-rate`: Allow users to view and override the FX rate on individual expense entries, with clear visual distinction between auto-fetched and manually-set rates

### Modified Capabilities
- `expense-duplication`: Duplicate must preserve source FX rate and manual flag
- `pdf-export`: PDF must annotate manual rates with "(manual)" suffix

## Impact

- **DB**: New `V26__add_fx_rate_manual_to_expenses.sql` migration
- **Backend**: `Expense` entity, `ExpenseCreate`/`ExpenseUpdate` DTOs, `ExpenseService` (create/update/duplicate paths), `ExpenseMapper`
- **Frontend**: `ExpenseForm.tsx` (new inline editable fxRate field), `ExpensesClient.tsx`, report detail page, `Expense` type in `api.ts`
- **PDF**: `PdfService.kt` — annotate manual rates
