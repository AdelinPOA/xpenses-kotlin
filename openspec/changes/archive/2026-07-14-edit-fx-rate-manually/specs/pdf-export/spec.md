# Specification: pdf-export

## ADDED Requirements

### Requirement: Manual FX rate annotation in PDF
The system SHALL annotate FX rates with a "(manual)" suffix in the PDF expense summary when `fx_rate_manual` is true for the given expense.

#### Scenario: Manual rate annotated in PDF
- **WHEN** a PDF report is generated containing an expense with currency "USD", fxRate 0.92, and fxRateManual true
- **THEN** the PDF displays the FX rate line as "1 USD = 0.92 EUR (manual)" below the original amount

#### Scenario: Auto rate unannotated
- **WHEN** a PDF report is generated containing an expense with fxRateManual false
- **THEN** the PDF displays the FX rate line without the "(manual)" suffix as before
