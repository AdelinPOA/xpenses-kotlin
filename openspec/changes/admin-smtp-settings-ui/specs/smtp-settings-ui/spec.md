## ADDED Requirements

### Requirement: SMTP settings page renders for mod
The `/admin/email` page SHALL render for `mod` users and show "Access Denied" for all other roles.

#### Scenario: Mod user accesses the page
- **WHEN** a `mod` user navigates to `/admin/email`
- **THEN** the SMTP settings form is displayed with current values loaded from the API

#### Scenario: Non-mod user is denied
- **WHEN** a user with role other than `mod` navigates to `/admin/email`
- **THEN** the page renders an Access Denied message

### Requirement: Form shows all SMTP fields with proper input types
The form SHALL include: Enabled toggle (checkbox), Host (text), Port (number, 1–65535), Username (text), Password (password input, shows `••••••••` placeholder if already set), From Address (email).

#### Scenario: Password field shows set indicator
- **WHEN** the server reports `password_set: true`
- **THEN** the password input shows a placeholder `••••••••` and a "(currently set)" label until the user types a new value

#### Scenario: Port validation
- **WHEN** user enters a port outside 1–65535
- **THEN** the Save button is disabled or an inline error is shown

### Requirement: Test email section
Below the save form there SHALL be a collapsible or always-visible section with a "To" email input and a "Send Test Email" button. The result SHALL render in green (success) or red (error) inline below the button.

#### Scenario: Successful test feedback
- **WHEN** the test email is sent successfully
- **THEN** a green success message appears: "✓ Test email sent to <address>"

#### Scenario: Failed test feedback
- **WHEN** the test email fails
- **THEN** a red error message shows the backend error detail
