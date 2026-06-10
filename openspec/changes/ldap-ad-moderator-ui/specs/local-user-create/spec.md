## ADDED Requirements

### Requirement: Mod can create a local user account
The system SHALL expose `POST /api/users` (mod-only) to create a new `auth_source = 'local'` user. Required fields: `username`, `display_name`, `password`, `role`. Optional: `email`. The endpoint SHALL hash the password with bcrypt before storing and return the created `UserOut` object.

#### Scenario: Successful local user creation
- **WHEN** `mod` calls `POST /api/users` with valid fields
- **THEN** the system creates the user with `auth_source = 'local'`, hashed password, and returns `201` with the user object (no password hash)

#### Scenario: Duplicate username rejected
- **WHEN** `POST /api/users` is called with a `username` that already exists
- **THEN** the system returns `409` with message "Username already taken"

#### Scenario: Non-mod cannot create users
- **WHEN** a non-mod user calls `POST /api/users`
- **THEN** the system returns `403`

### Requirement: Admin users page has create user form
The existing `/admin/users` page SHALL include a "Create User" button that opens an inline form (or modal) with fields for username, display name, password, role, and email. On submission it calls `POST /api/users` and refreshes the user list.

#### Scenario: Create user form submits successfully
- **WHEN** mod fills in the create form and submits
- **THEN** `POST /api/users` is called, the new user appears in the list, and a success toast is shown

#### Scenario: Duplicate username error shown inline
- **WHEN** the API returns `409`
- **THEN** the form shows "Username already taken" without dismissing the form
