# pdf-export Specification

### Purpose
This specification covers requirements for generating and exporting PDF files, including expense summaries, advance payments, mileage details, and attached receipts.

### Requirement: Expense Summary Table Total Row
The system SHALL append a summary row at the bottom of the Expense Summary table in the generated PDF report showing the total amount in EUR.

#### Scenario: Total row in Expense Summary
- **WHEN** a PDF report is generated for a report containing expenses of 10.00 EUR and 25.50 EUR
- **THEN** the Expense Summary table contains a bottom row with "TOTAL" and the sum of all expenses converted to EUR, which is "€35.50"

### Requirement: Advance Payments Table Total Row
The system SHALL append a summary row at the bottom of the Advance Payments table in the generated PDF report showing the total paid advances in EUR.

#### Scenario: Total row in Advance Payments
- **WHEN** a PDF report is generated for a report containing paid advance payments of 50.00 EUR and 100.00 EUR
- **THEN** the Advance Payments table contains a bottom row with "TOTAL" and the sum of all paid advances in EUR, which is "€150.00"

### Requirement: Report Summary Block Formula
The system SHALL display a Report Summary block at the bottom of the generated PDF report, structured as a single-row formula matching: `Total Expense + Daily Allowance + Mileage - Total Advances = Reimbursable`.
- The Reimbursable value SHALL be computed as `Total Expense + Daily Allowance + Mileage - Total Advances`.
- If the Reimbursable amount is negative, it SHALL be displayed with a minus sign before the currency symbol (e.g., `-€1,658.84`).

#### Scenario: Positive remaining balance
- **WHEN** a report is generated with 1000 EUR advance, 1200 EUR expenses, 50 EUR allowance, 50 EUR mileage
- **THEN** the Report Summary displays: "Total Expense €1,200.00 + Daily Allowance €50.00 + Mileage €50.00 - Total Advances €1,000.00 = Reimbursable €300.00"

#### Scenario: Negative remaining balance
- **WHEN** a report is generated with 1000 EUR advance, 200 EUR expenses, 50 EUR allowance, 50 EUR mileage
- **THEN** the Report Summary displays: "Total Expense €200.00 + Daily Allowance €50.00 + Mileage €50.00 - Total Advances €1,000.00 = Reimbursable -€700.00"

### Requirement: Report Delegation Details
The system SHALL display the delegation email details in the generated PDF report if available.
- The details SHALL be positioned below the Report Title and above the "Submitted By" details in the left metadata cell.
- The details SHALL include: Customer (with Customer Code), Address, Order (Kundenauftrag, with Order Type), Operation (Vorgang), Work Center (Arbeitsplatz), Technical Location, and Technician.
- The metadata table SHALL use column widths of 70% for the left cell and 30% for the right cell to ensure delegation details are readable and not truncated/squished.

#### Scenario: Delegation details available
- **WHEN** a report is generated containing kundenauftrag "0007038319" and kundeName "PJSC CARLSBERG UKRAINE"
- **THEN** the PDF report header displays: "Customer: PJSC CARLSBERG UKRAINE" and "Order (Kundenauftrag): 0007038319"

### Requirement: Manual FX Rate Annotation
The system SHALL annotate FX rates with a "(manual)" suffix in the PDF expense summary when `fx_rate_manual` is true for the given expense.

#### Scenario: Manual rate annotated in PDF
- **WHEN** a PDF report is generated containing an expense with currency "USD", fxRate 0.92, and fxRateManual true
- **THEN** the PDF displays the FX rate line as "1 USD = 0.92 EUR (manual)" below the original amount"

#### Scenario: Auto rate unannotated
- **WHEN** a PDF report is generated containing an expense with fxRateManual false
- **THEN** the PDF displays the FX rate line without the "(manual)" suffix
