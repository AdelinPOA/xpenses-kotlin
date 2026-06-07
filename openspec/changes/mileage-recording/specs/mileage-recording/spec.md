## ADDED Requirements

### Requirement: Create mileage record
The system SHALL allow authenticated users to create a mileage record on a draft report they own. Each record SHALL contain: origin (text), destination (text), distance_km (positive number), date, and optional description. The system SHALL compute two amounts using the configured rates: `amount_before_tax = distance_km × rate_before_tax` (accounting) and `amount_eur = distance_km × rate_after_tax` (reimbursement). Both rates SHALL be stored on the record.

#### Scenario: Successful creation
- **WHEN** user POSTs to `/api/reports/{id}/mileage` with `{"origin": "Bucharest", "destination": "Ploiesti", "distance_km": 60, "date": "2026-06-07"}`
- **THEN** system creates a mileage record with `amount_before_tax = 60 × 0.30 = 18.00`, `amount_eur = 60 × 0.22 = 13.20`, `rate_before_tax = 0.30`, `rate_after_tax = 0.22`, returns 201

#### Scenario: Report not in draft
- **WHEN** user tries to add mileage to a submitted/approved/paid report
- **THEN** system returns 400 "Only draft reports can be modified"

#### Scenario: Not report owner
- **WHEN** user tries to add mileage to another user's report
- **THEN** system returns 403

### Requirement: List mileage records
The system SHALL return all mileage records for a report the user owns, ordered by date descending.

#### Scenario: List records
- **WHEN** user GETs `/api/reports/{id}/mileage`
- **THEN** system returns array of mileage records for that report

### Requirement: Update mileage record
The system SHALL allow updating origin, destination, distance_km, date, and description on a mileage record if the report is in draft status. Changing `distance_km` SHALL recalculate both `amount_before_tax` and `amount_eur` using the stored rates.

#### Scenario: Update distance
- **WHEN** user PATCHes `/api/reports/{id}/mileage/{mid}` with `{"distance_km": 80}`
- **THEN** system updates record with `amount_before_tax = 80 × rate_before_tax` and `amount_eur = 80 × rate_after_tax`

### Requirement: Delete mileage record
The system SHALL allow deleting a mileage record if the report is in draft status.

#### Scenario: Delete record
- **WHEN** user DELETEs `/api/reports/{id}/mileage/{mid}`
- **THEN** system deletes the record and returns 204

#### Scenario: Delete on non-draft report
- **WHEN** user tries to delete mileage on a submitted report
- **THEN** system returns 400

### Requirement: Report totals include mileage
The `ReportOut` response SHALL include `total_mileage_eur` (sum of all mileage `amount_eur`) and `mileage_records` list. The `total_reimbursable` calculation SHALL include mileage cost.

#### Scenario: Report with mileage
- **WHEN** report has expenses totaling 500 EUR, advances of 100 EUR, and mileage of 36 EUR
- **THEN** `total_mileage_eur = 36.00` and mileage is added to total reimbursable

### Requirement: PDF export includes mileage
The PDF export SHALL include a mileage table showing origin, destination, km, rate, and cost for each record, plus a total mileage row.

#### Scenario: PDF with mileage records
- **WHEN** user exports a report PDF that has mileage records
- **THEN** PDF contains a "Mileage" section with a table of trips and total km/cost

### Requirement: Configurable mileage rates
The system SHALL read two rates from environment/config:
- `MILEAGE_RATE_BEFORE_TAX` (default: 0.30 EUR/km) — gross rate for accounting
- `MILEAGE_RATE_AFTER_TAX` (default: 0.22 EUR/km) — net rate for reimbursement
Both rates are used for new records. Each record stores both rates at creation time.

#### Scenario: Custom rates
- **WHEN** `MILEAGE_RATE_BEFORE_TAX=0.40` and `MILEAGE_RATE_AFTER_TAX=0.30` are set in env
- **THEN** new mileage records use 0.40 for `amount_before_tax` and 0.30 for `amount_eur`
