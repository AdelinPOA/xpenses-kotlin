## Why

Technicians and managers need to see the delegation details imported from the email (such as customer, order, operation, work center, and technical location) in the generated PDF report. This information helps match the expense report with specific ERP / SAP records.

## What Changes

- Update `PdfService.kt` to check if delegation details are available (such as `kundeName`, `kundenauftrag`, `vorgang`, `arbeitsplatz`, `technplatzRaw`, etc.).
- If available, display a structured "Delegation Details" block in the left column of the report metadata header, positioned below the Report Title/Description and above the "Submitted By" details.

## Capabilities

### New Capabilities

### Modified Capabilities
- `pdf-export`: Include delegation email import fields in the PDF report header.

## Impact

- **Backend**: Update `PdfService.kt` to extract and render delegation detail fields in the PDF.
