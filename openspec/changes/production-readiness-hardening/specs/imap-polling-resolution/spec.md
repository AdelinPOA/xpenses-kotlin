## ADDED Requirements

### Requirement: Scheduled IMAP polling when configured
When IMAP settings are present and enabled, the application SHALL run a scheduled job (`@Scheduled`) that periodically connects to the configured IMAP mailbox, parses incoming delegation emails via `EmailImportService.processIncomingEmail`, and creates draft reports. The poll interval SHALL be configurable via the `imap.poll-interval` property (default: 5 minutes).

#### Scenario: configured IMAP triggers periodic poll
- **WHEN** IMAP config is saved and the application is running
- **THEN** every `imap.poll-interval` milliseconds the mailbox is checked and new emails are processed into draft reports

#### Scenario: no IMAP config means no polling
- **WHEN** IMAP settings are not configured
- **THEN** the scheduled poller skips execution (no connection attempts)

### Requirement: IMAP simulate endpoint remains for manual testing
The existing `POST /api/settings/imap/simulate` endpoint SHALL remain available for operators to manually trigger email-import parsing without waiting for the poll cycle.

#### Scenario: operator manually simulates an email
- **WHEN** a `mod` user calls `POST /api/settings/imap/simulate` with a raw email body
- **THEN** the email is parsed and a draft report is created (existing behavior preserved)

### Requirement: Scheduling enabled
`XpensesApplication` SHALL be annotated `@EnableScheduling` to activate Spring's scheduled-task infrastructure.

#### Scenario: scheduled bean is invoked
- **WHEN** the application context starts
- **THEN** beans annotated `@Scheduled` are registered with the task scheduler
