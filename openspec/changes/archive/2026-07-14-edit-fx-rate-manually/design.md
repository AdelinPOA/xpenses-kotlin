## Context

Expenses in non-EUR currencies store a `fx_rate` (BigDecimal) set at creation time via `FxService.getRate()`, which calls Frankfurter API (primary) → fawazahmed0 (fallback). There is currently no way for users to override the rate. `duplicateExpense` re-fetches the rate from API rather than preserving the original.

The rate is shown read-only in a transient green banner after save (ExpenseForm.tsx:370-374) and in PDF exports (PdfService.kt:253-255).

## Goals / Non-Goals

**Goals:**
- Allow users to view and override the FX rate on individual expense create/edit forms
- Persist and display a `fx_rate_manual` flag to distinguish user-set vs auto-fetched rates
- Preserve manual rate and flag on expense duplication
- Annotate manual rates in PDF exports

**Non-Goals:**
- Advance payments — excluded per user decision
- Bulk rate editing or admin FX management UI
- Re-fetching rates on demand for existing expenses
- FX rate history/audit trail

## Decisions

1. **New column `fx_rate_manual` on `expenses` table** — a boolean flag is the simplest way to distinguish auto vs manual. No need for a separate overrides table or enum for now. Defaults to `false` so existing rows are treated as auto-fetched.

2. **DTO-driven override** — `ExpenseCreate`/`ExpenseUpdate` get optional `fxRate: BigDecimal?`. When non-null, `ExpenseService` uses it directly instead of calling `FxService.getRate()`. When null, existing behavior is unchanged. This avoids a separate endpoint or new controller.

3. **Manual rate persists on field changes** — per user decision, if the user sets a manual rate and later changes amount/currency/date, the manual rate is preserved. The user must explicitly clear the rate field to revert to auto-fetch. This means `updateExpense` only re-fetches when `body.fxRate` is null.

4. **Inline editable field with toggle** — the FX rate appears as read-only text with a small pencil/edit icon in the expense form. Clicking the pencil turns it into an editable number input and switches the label from "Auto" to "Manual". This matches Tailwind v4 patterns used elsewhere in the form (e.g., the category selector).

5. **No optimistic locking change** — `Expense` already has `@Version`. The new column doesn't affect concurrency behavior.

## Risks / Trade-offs

- **Stale auto-rate on manual → auto reversion**: If a user clears the manual rate to revert to auto, the rate fetched may differ from the original auto-rate. This is acceptable — it matches user intent.
- **Duplicate preserves manual rate**: If the original expense had a manually-set rate, and the duplicate is created for a different date/currency, the preserved rate may not match current market. User can override again. This is consistent with the "keep manual rate" decision.
- **Form UX complexity**: Adding the FX rate field inline may crowd the form. Mitigation: shown only when currency is non-EUR, positioned as a compact row below the currency selector, using the existing pattern of conditional fields.
