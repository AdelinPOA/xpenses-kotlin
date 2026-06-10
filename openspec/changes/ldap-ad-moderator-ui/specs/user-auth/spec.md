## MODIFIED Requirements

### Requirement: User login
The system SHALL authenticate a user by checking `auth_source` before applying credential verification. LDAP enabled state SHALL be read from `app_settings` (via `get_ldap_config()`), not from environment variables. If `auth_source = 'ldap'` and LDAP is enabled, the system SHALL bind to the configured directory with the supplied username and password. If `auth_source = 'local'` (or LDAP is disabled for a local user), the system SHALL verify the bcrypt password hash. On successful authentication by either path, the system SHALL issue JWT access and refresh tokens in httpOnly cookies as before.

#### Scenario: Local user login unchanged
- **WHEN** a user with `auth_source = 'local'` submits valid credentials
- **THEN** the system verifies the bcrypt hash and returns tokens

#### Scenario: LDAP user login via directory bind
- **WHEN** a user with `auth_source = 'ldap'` submits credentials and LDAP is enabled in `app_settings`
- **THEN** the system performs an LDAP bind; on success issues tokens

#### Scenario: LDAP user login when LDAP disabled in DB
- **WHEN** a user with `auth_source = 'ldap'` attempts login but `app_settings` has `enabled: false`
- **THEN** the system returns `401` with message "LDAP authentication is disabled"

#### Scenario: LDAP user login when directory unreachable
- **WHEN** a user with `auth_source = 'ldap'` attempts login but the directory host is unreachable
- **THEN** the system returns `503` with message "LDAP server unavailable"

#### Scenario: LDAP bind failure
- **WHEN** a user with `auth_source = 'ldap'` submits wrong credentials
- **THEN** the LDAP bind fails and the system returns `401` with the same detail as a wrong local password
