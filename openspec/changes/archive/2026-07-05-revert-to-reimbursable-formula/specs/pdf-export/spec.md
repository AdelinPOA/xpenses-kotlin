## MODIFIED Requirements

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
