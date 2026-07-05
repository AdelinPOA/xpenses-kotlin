## Context

The current PDF Report Summary block uses a 6-column table layout with 11 cells: 6 values/labels and 5 operators. Because the number of cells exceeds 6, it wraps to a second row, creating an awkward, hard-to-read grid. Additionally, the existing formula (`Total Expense + Daily Allowance + Mileage - Non Reimbursable - Advance Received = Total Reimbursable`) does not present a single remaining balance calculation that accounting/managers can easily work with.

## Goals / Non-Goals

**Goals:**
- Present a single-row, 9-column formula block at the bottom of the PDF report.
- Change the calculation formula to: `Total Advances - Total Expense - Daily Allowance - Mileage = Remaining Balance`.
- Format negative balances clearly as `-€X,XXX.XX` and positive balances as `€X,XXX.XX`.

**Non-Goals:**
- Changing other parts of the PDF document.

## Decisions

### 9-Column Single-Row Table

We will replace the 6-column `summaryTable` with a 9-column table (`PdfPTable(9)`) to ensure the 5 terms and 4 operators fit entirely on a single row without wrapping.
- Table columns: `floatArrayOf(18f, 2.5f, 18f, 2.5f, 18f, 2.5f, 18f, 2.5f, 18f)`.
- Labels to use:
  1. `Total Advances`
  2. `Total Expense`
  3. `Daily Allowance`
  4. `Mileage`
  5. `Remaining Balance`
- Operators: `-`, `-`, `-`, `=`
- Calculation: `val balance = totalAdv.subtract(totalEur).subtract(allowance).subtract(totalMil)`
- Formatting: If `balance` is negative, format as `"-€" + formatBigDecimal(balance.abs())`.

## Risks / Trade-offs

- **[Risk]**: The 9 columns might be narrow on A4 width.
  - **Mitigation**: Using smaller percentages for operators (2.5%) and equal spacing for value boxes (18%) ensures the text fits comfortably without wrapping.
