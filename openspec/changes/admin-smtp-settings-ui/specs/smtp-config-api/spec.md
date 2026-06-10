## ADDED Requirements

### Requirement: SMTP config stored in DB and readable by mod
The system SHALL store SMTP configuration (host, port, user, password, from, enabled) in the `app_settings` table. The password SHALL be encrypted with Fernet. A `GET /api/settings/email` endpoint SHALL return all fields with `password_set: bool` instead of the actual password. Only users with role `mod` SHALL access this endpoint.

#### Scenario: Mod reads SMTP config
- **WHEN** a `mod` user calls `GET /api/settings/email`
- **THEN** the system returns all SMTP fields with `password_set: true/false` and never includes the plaintext password

#### Scenario: Non-mod user is denied
- **WHEN** a user with role other than `mod` calls `GET /api/settings/email`
- **THEN** the system returns HTTP 403

### Requirement: SMTP config updatable by mod
The system SHALL expose `PATCH /api/settings/email` for `mod` users to update any subset of SMTP fields. When `password` is included, it SHALL be encrypted before storage. When `password` is omitted, the stored password SHALL be unchanged.

#### Scenario: Mod updates SMTP host and port
- **WHEN** a `mod` user sends `PATCH /api/settings/email` with `{host: "smtp.example.com", port: 587}`
- **THEN** the system saves those values to `app_settings` and returns the updated config

#### Scenario: Password preserved when not sent
- **WHEN** a `mod` user sends `PATCH /api/settings/email` without a `password` field
- **THEN** the stored encrypted password is unchanged

### Requirement: Test email endpoint
The system SHALL expose `POST /api/settings/email/test` (mod-only) accepting `{to: string}`. It SHALL attempt to send a test email using the live DB config and return `{success: bool, message: string}`.

#### Scenario: Test email with valid config
- **WHEN** a `mod` user calls `POST /api/settings/email/test` with a valid `to` address and SMTP is correctly configured
- **THEN** the system sends the email and returns `{success: true, message: "Test email sent to ..."}`

#### Scenario: Test email with bad config
- **WHEN** SMTP connection fails (bad host/credentials)
- **THEN** the system returns `{success: false, message: "<error detail>"}` (HTTP 200, not 500)

### Requirement: email_service reads live DB config
The `send_email` function SHALL read SMTP settings from the DB at call time (overriding `.env` values) so changes take effect without a restart.

#### Scenario: Email sent with DB config active
- **WHEN** `app_settings` contains SMTP config and `emails_enabled = true`
- **THEN** `send_email` uses the DB values for host/port/user/pass/from

#### Scenario: Fallback to .env when DB config absent
- **WHEN** no SMTP config exists in `app_settings`
- **THEN** `send_email` uses the `.env`-derived `settings` values

### Requirement: Admin SMTP settings UI page
The system SHALL provide a frontend page at `/admin/email` accessible only to `mod` users. It SHALL display a form with fields: Enabled (toggle), Host, Port, Username, Password (masked), From Address. It SHALL have a Save button and a "Send Test Email" section with a recipient input and result feedback.

#### Scenario: Mod saves SMTP config
- **WHEN** a `mod` user fills the form and clicks Save
- **THEN** the config is persisted and a success toast is shown

#### Scenario: Mod sends a test email
- **WHEN** a `mod` user enters a recipient address and clicks "Send Test"
- **THEN** the result (success or error message) is shown inline

#### Scenario: Unsaved changes warning
- **WHEN** a `mod` user modifies the form and attempts to navigate away without saving
- **THEN** a visual dirty-state warning banner is displayed

### Requirement: Sidebar "Email / SMTP" entry for mod
The Admin section in the sidebar SHALL include an "Email / SMTP" link to `/admin/email`, visible only to `mod` users.

#### Scenario: Email link visible to mod
- **WHEN** the logged-in user has role `mod`
- **THEN** the sidebar Admin section shows "Email / SMTP" link

#### Scenario: Email link hidden from other roles
- **WHEN** the logged-in user has any role other than `mod`
- **THEN** the "Email / SMTP" link is not visible
