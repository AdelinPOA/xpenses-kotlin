## ADDED Requirements

### Requirement: IMAP Polling Daemon
The system SHALL run a background loop that polls the configured IMAP inbox for unread messages at regular intervals. It SHALL authenticate using credentials from the `imap_config` DB settings.

#### Scenario: Background polling processes new emails
- **WHEN** the background daemon finds an unread email in the configured IMAP folder
- **THEN** it processes the email, creates a draft report for the sender, and marks the email as read/seen

### Requirement: Delegation Email Parsing
The system SHALL parse delegation emails matching the standardized German dispatch format to extract the start date, end date, customer name, technical site location, task type, and customer order number.

#### Scenario: Successful parse of standard delegation email
- **WHEN** an email containing `Starttermin 20.04.2026`, `Endtermin 22.05.2026`, `Kundenauftrag 0007038319`, `Kunde 0022265695 PJSC CARLSBERG UKRAINE`, and `TechnPlatz C374981 Lwiw 40kcph Ukraine Can line 1` is processed
- **THEN** it extracts the date range 2026-04-20 to 2026-05-22, customer name "PJSC CARLSBERG UKRAINE", location "Lwiw 40kcph Ukraine Can line 1", order "0007038319", and creates a draft report named "Delegation: PJSC CARLSBERG UKRAINE (Lwiw 40kcph Ukraine Can line 1)"

### Requirement: Sender Matching
The system SHALL match the parsed sender email address from the `From` header to an active user in the `users` table. If no active user matches the sender, the email SHALL be ignored.

#### Scenario: Matches email to active user
- **WHEN** an email is received from `adelin.popescu@nt-automation.eu` and a user with that email exists and is active
- **THEN** the system generates the draft report under that user's ID

#### Scenario: Rejects email from unknown sender
- **WHEN** an email is received from `unknown@external.com`
- **THEN** the system skips processing and does not create any report

### Requirement: IMAP Configuration API
The system SHALL expose endpoints `GET /api/settings/imap`, `PATCH /api/settings/imap`, and `POST /api/settings/imap/test` restricted to the `mod` role to read, update, and test connection credentials (host, port, username, password, enabled).

#### Scenario: Mod saves IMAP credentials
- **WHEN** a `mod` user sends a `PATCH /api/settings/imap` request with valid IMAP host, port, username, and password
- **THEN** the settings are saved encrypted in the database and the password is masked on retrieval

### Requirement: IMAP Settings UI Page
The system SHALL provide a frontend settings page at `/admin/imap` accessible only to the `mod` role to view, save, and test IMAP settings.

#### Scenario: Mod views current settings
- **WHEN** a `mod` user accesses `/admin/imap`
- **THEN** the page displays the current configuration state with saved password masked
