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
