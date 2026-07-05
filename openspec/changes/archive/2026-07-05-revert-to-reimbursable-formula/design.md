## Context

To make the PDF report summary consistent with the web application dashboard, we need to revert the summary table formula from `Total Advances - Total Expense - Daily Allowance - Mileage = Remaining Balance` to: `Total Expense + Daily Allowance + Mileage - Total Advances = Reimbursable`.

## Goals / Non-Goals

**Goals:**
- Update the PDF summary block table columns, labels, operators, and math to match the web application.
- Format negative reimbursable amounts cleanly.

**Non-Goals:**
- Modifying other parts of the PDF layout.

## Decisions

### Reimbursable Formula in PDF Summary

We will update the 9-column `summaryTable` in `PdfService.kt` to present:
- Columns/Labels:
  1. `Total Expense`
  2. `Daily Allowance`
  3. `Mileage`
  4. `Total Advances`
  5. `Reimbursable`
- Operators: `+`, `+`, `-`, `=`
- Calculation: `val totalReimbursable = totalEur.add(allowance).add(totalMil).subtract(totalAdv)`
- Formatting: If `totalReimbursable < 0`, format as `"-€" + formatBigDecimal(totalReimbursable.abs())`.

## Risks / Trade-offs

None. This is a formula and label adjustment inside an existing 9-column single-row table, so there is no layout risk.
