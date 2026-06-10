## MODIFIED Requirements

### Requirement: User list shows auth source
The `/admin/users` page SHALL display an `auth_source` badge for each user (`local` or `ldap`) so `mod` can distinguish manually-created accounts from directory-provisioned ones.

#### Scenario: Auth source badge visible
- **WHEN** `mod` views the user list and it contains both local and LDAP users
- **THEN** each row shows a badge — e.g. a grey "local" chip or a blue "ldap" chip

### Requirement: Password change hidden for LDAP users
The profile page (`/profile`) SHALL hide the password-change form when the authenticated user has `auth_source = 'ldap'`, replacing it with an informational note that their password is managed by the company directory.

#### Scenario: LDAP user profile page hides password form
- **WHEN** a user with `auth_source = 'ldap'` views their profile page
- **THEN** the password-change section is not rendered; instead a note reads "Your password is managed by your organization's directory"

#### Scenario: Local user profile page unchanged
- **WHEN** a user with `auth_source = 'local'` views their profile page
- **THEN** the password-change form renders as normal
