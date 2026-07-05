## Why

The current PDF Report Summary section wraps awkwardly across two rows in a 6-column grid because it has 11 cells (6 values + 5 operators). Additionally, the formula structure (`Total Expense + Daily Allowance + Mileage - Non Reimbursable - Advance Received = Total Reimbursable`) is not optimal for accounting and management purposes. Users need a clear, single-row formula matching: `Total Advances - Total Expense - Daily Allowance - Mileage = Remaining Balance (Amount)`.

## What Changes

- Redesign the PDF Report Summary block layout to a single-row 9-column table.
- Change the formula and labels to: `Total Advances - Total Expense - Daily Allowance - Mileage = Remaining Balance`.
- Calculate the remaining balance as: `Total Advances - Total Expense - Daily Allowance - Mileage`.
- Format negative balances clearly (e.g. `-€1,658.84`).
- Remove the unused, hardcoded "Non Reimbursable" entry.

## Capabilities

### New Capabilities

### Modified Capabilities
- `pdf-export`: Update the Report Summary layout and formula requirements.

## Impact

- **Backend**: `PdfService.kt` will be modified to change the layout, labels, and formula calculations in the report summary block.
