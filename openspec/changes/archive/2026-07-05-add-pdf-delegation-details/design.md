## Context

To make the exported PDF report more comprehensive and trace it back to ERP/SAP orders, we need to print the delegation email details (such as customer, order, operation, work center, technical location, and technician) when they are present on the report object.

## Goals / Non-Goals

**Goals:**
- Include delegation details in the PDF header (left metadata cell).
- Only display details that are populated and not empty/null.

## Decisions

### Rendering Delegation Details in PDF Header

In `PdfService.kt`, inside the generation of `metaLeft` (inside `generateReportPdf`):
- We will check if `report.kundenauftrag` or `report.kundeName` is present.
- If so, we will add a section titled "Delegation Details" (labeled in `fontCaption`).
- Under this section, we will print any available non-blank fields using `fontSmall`:
  - Customer name + Customer code (e.g. `Customer: PJSC CARLSBERG UKRAINE (0022265695)`)
  - Address
  - Order (Kundenauftrag) + Order type (e.g. `Order (Kundenauftrag): 0007038319 (KR20)`)
  - Operation (Vorgang)
  - Work Center (Arbeitsplatz)
  - Technical Location (Technplatz)
  - Technician

## Risks / Trade-offs

Adding multiple fields to the left column will increase the vertical size of the metadata section. However, using `fontSmall` and standard leading will keep it compact and professional.
