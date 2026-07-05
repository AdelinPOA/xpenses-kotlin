## Why

To maintain consistency between the website and the exported PDF report, the Report Summary block should use the same reimbursable amount formula and labels as the web interface: `Total Expense + Daily Allowance + Mileage - Total Advances = Reimbursable`. 

## What Changes

- Change the Report Summary calculation to: `Total Expense + Daily Allowance + Mileage - Total Advances = Reimbursable`.
- Update the labels in the 9-column PDF table to: `Total Expense`, `Daily Allowance`, `Mileage`, `Total Advances`, and `Reimbursable`.
- Update operators to `+`, `+`, `-`, and `=`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `pdf-export`: Update the PDF Report Summary formula and labels to match the web app.

## Impact

- **Backend**: `PdfService.kt` will be updated to use the reimbursable formula and updated labels.
