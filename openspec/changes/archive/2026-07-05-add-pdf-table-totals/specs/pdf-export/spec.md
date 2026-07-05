## ADDED Requirements

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
