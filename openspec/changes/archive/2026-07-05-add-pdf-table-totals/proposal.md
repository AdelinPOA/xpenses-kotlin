## Why

Users want to see the total amount summed at the bottom of each table (Expense Summary, Advance Payments, and Mileage) in the exported PDF. Currently, they must manually calculate the sum of items in the Expense Summary and Advance Payments tables, as no bottom total rows are provided.

## What Changes

- Add a summary row at the bottom of the **Expense Summary** table in the PDF export. This row will:
  - Contain "TOTAL" in the first columns.
  - Display the sum of all expenses converted to EUR in the last column.
- Add a summary row at the bottom of the **Advance Payments** table in the PDF export. This row will:
  - Contain "TOTAL" in the first columns.
  - Display the sum of all paid advance payments in EUR in the last column.
- Ensure the existing total row in the **Mileage** table is visually consistent with the new total rows.

## Capabilities

### New Capabilities
- `pdf-export`: Add total rows at the bottom of tables in the PDF export.

### Modified Capabilities

## Impact

- **Backend**: `PdfService.kt` will be modified to calculate totals and append total rows to the `EXPENSE SUMMARY` and `ADVANCE PAYMENTS` tables during PDF generation.
