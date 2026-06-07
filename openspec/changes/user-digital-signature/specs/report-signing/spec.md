## ADDED Requirements

### Requirement: User can sign a report
The system SHALL allow the report owner to sign their report by applying their saved digital signature. Signing SHALL record the signer's user ID and timestamp on the report.

#### Scenario: Sign a draft report
- **WHEN** report owner has a saved signature and clicks "Sign" on a draft report
- **THEN** the system sets `signer_id` to the user's ID, `signed_at` to current timestamp, and returns the updated report

#### Scenario: Sign a submitted report
- **WHEN** report owner has a saved signature and clicks "Sign" on a submitted report
- **THEN** the system sets `signer_id` and `signed_at` on the report

#### Scenario: Sign without a saved signature
- **WHEN** user tries to sign a report but has no saved signature
- **THEN** the system returns 400 with a message directing the user to record a signature first

#### Scenario: Non-owner cannot sign
- **WHEN** a user who is not the report owner tries to sign the report
- **THEN** the system returns 403

### Requirement: Sign endpoint
The system SHALL expose `POST /api/reports/{id}/sign` that applies the current user's signature to the report.

#### Scenario: Successful sign
- **WHEN** authenticated report owner with a saved signature calls POST `/api/reports/{id}/sign`
- **THEN** the system updates the report with `signer_id` and `signed_at`, returns 200 with the updated report

#### Scenario: Already signed
- **WHEN** a report that is already signed is signed again by the same owner
- **THEN** the system updates `signed_at` to the new timestamp (re-sign is allowed)

### Requirement: Sign button on report detail
The system SHALL show a "Sign" button on the report detail page when the current user is the report owner and has a saved signature. If the report is already signed, the system SHALL show the signature image and signed timestamp instead.

#### Scenario: Report not yet signed, user has signature
- **WHEN** report owner views their unsigned report and has a saved signature
- **THEN** a "Sign Report" button is displayed

#### Scenario: Report not yet signed, user has no signature
- **WHEN** report owner views their unsigned report and has no saved signature
- **THEN** a disabled "Sign Report" button is shown with a tooltip "Record your signature in profile settings first"

#### Scenario: Report already signed
- **WHEN** user views a signed report
- **THEN** the signature image, signer name, and signed timestamp are displayed instead of the sign button

### Requirement: PDF export renders signature
The system SHALL render the signer's signature image in the PDF export signature area when the report has been signed. The signature image SHALL be scaled to approximately 40mm width and placed above the signer's name and sign date.

#### Scenario: PDF export of signed report
- **WHEN** a signed report is exported to PDF
- **THEN** the signature area shows the signature image, signer's display name, and signed date

#### Scenario: PDF export of unsigned report
- **WHEN** an unsigned report is exported to PDF
- **THEN** the signature area shows the existing blank line (backward compatible)

### Requirement: Report tracks signing metadata
The system SHALL store `signer_id` (foreign key to users) and `signed_at` (TIMESTAMPTZ) on the `expense_reports` table.

#### Scenario: Signed report metadata
- **WHEN** a report is signed
- **THEN** `signer_id` references the signing user and `signed_at` records the UTC timestamp

#### Scenario: Unsigned report metadata
- **WHEN** a report has not been signed
- **THEN** `signer_id` and `signed_at` are NULL
