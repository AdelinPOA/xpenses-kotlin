## ADDED Requirements

### Requirement: LDAP settings page accessible to mod
The system SHALL render a settings page at `/admin/ldap` accessible only to `mod` users. Non-mod authenticated users SHALL be redirected to `/dashboard`.

#### Scenario: Mod accesses LDAP settings
- **WHEN** a `mod` user navigates to `/admin/ldap`
- **THEN** the page renders with the current LDAP configuration loaded into the form

#### Scenario: Non-mod redirected
- **WHEN** a non-mod authenticated user navigates to `/admin/ldap`
- **THEN** the system redirects them to `/dashboard`

### Requirement: LDAP configuration form
The page SHALL display a form with: host, port, TLS toggle, bind DN, bind password (masked input), base DN, user search filter, attribute mapping fields (username, email, display name, role attribute), role map editor (directory group value → app role, add/remove rows), `default_role` dropdown (app role for unmapped groups), and an "Enabled" toggle. If `GET /api/settings/ldap` returns `bind_password_invalid: true`, the form SHALL display a warning banner prompting the mod to re-enter the bind password.

#### Scenario: Save configuration
- **WHEN** mod fills in required fields and clicks "Save"
- **THEN** `PATCH /api/settings/ldap` is called, a success toast appears, and values reload

#### Scenario: Bind password invalid warning
- **WHEN** the page loads and the API returns `bind_password_invalid: true`
- **THEN** an amber banner reads "Stored bind password is invalid — please re-enter it"

#### Scenario: Validation feedback
- **WHEN** mod submits with a missing required field
- **THEN** inline field errors appear without calling the API

### Requirement: Connection test button
The form SHALL include a "Test Connection" button that calls `POST /api/settings/ldap/test` with current form values (without saving) and displays the result inline — a preview table (username, email, mapped role) on success, or an error message on failure.

#### Scenario: Successful test shows role preview
- **WHEN** mod clicks "Test Connection" and the directory is reachable
- **THEN** a green status badge and a table of up to 5 preview users appear, each showing their mapped app role

#### Scenario: Failed test shows error
- **WHEN** the connection fails
- **THEN** a red status badge appears with the error message

### Requirement: Manual sync trigger with result summary
The page SHALL include a "Sync Now" button (disabled when `enabled = false`) that calls `POST /api/settings/ldap/sync` and displays the summary inline.

#### Scenario: Sync result displayed
- **WHEN** mod clicks "Sync Now" and sync completes
- **THEN** the page shows `Created: N  Updated: M  Deactivated: K  Skipped: J  Default role assigned: L`

### Requirement: Sidebar entry for LDAP admin
The sidebar SHALL show an "LDAP / AD" menu item under an "Admin" section, visible only to `mod` users.

#### Scenario: Mod sees LDAP sidebar entry
- **WHEN** a `mod` user is logged in
- **THEN** the sidebar shows an "Admin" section with an "LDAP / AD" link

#### Scenario: Non-mod does not see LDAP entry
- **WHEN** any non-mod user is logged in
- **THEN** the "Admin" section and "LDAP / AD" link are not rendered
