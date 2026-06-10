## ADDED Requirements

### Requirement: Test LDAP connection
The system SHALL provide `POST /api/settings/ldap/test` that attempts a bind with the supplied credentials and returns connectivity status plus a preview of the first 5 matched users (dry-run, no DB writes). The preview SHALL include the mapped app role for each user so the mod can validate attribute mapping before committing.

#### Scenario: Successful connection test
- **WHEN** `mod` calls `POST /api/settings/ldap/test` with valid config
- **THEN** the system returns `200` with `{ "ok": true, "preview": [...up to 5 objects with username, email, mapped_role...] }`

#### Scenario: Failed connection test
- **WHEN** the host is unreachable or bind credentials are wrong
- **THEN** the system returns `200` with `{ "ok": false, "error": "<reason>" }` (never 5xx for expected directory errors)

### Requirement: Manual user sync with deactivation
The system SHALL provide `POST /api/settings/ldap/sync` that searches the directory using the stored config and:
1. Creates new users with `auth_source = 'ldap'` and mapped role (or `default_role` if no mapping matches).
2. Updates `display_name`, `email`, and `role` for existing LDAP users whose directory attributes changed.
3. Sets `is_active = false` and revokes all refresh tokens for existing LDAP users NOT present in the current directory results.
4. Skips any `users` row where `auth_source = 'local'` even if username matches.

The response SHALL include `{ "created": N, "updated": M, "deactivated": K, "skipped": J, "default_role_assigned": L }`.

#### Scenario: New directory users provisioned
- **WHEN** `mod` triggers sync and the directory contains users not yet in `users`
- **THEN** those users are created with `auth_source = 'ldap'` and `default_role` if their group has no mapping

#### Scenario: Existing LDAP users updated
- **WHEN** a directory user already exists with `auth_source = 'ldap'` and their display name changed
- **THEN** `display_name` and `role` are updated

#### Scenario: Users removed from directory are deactivated
- **WHEN** a user with `auth_source = 'ldap'` and `is_active = true` is absent from the directory search results
- **THEN** `is_active` is set to `false` and all their refresh tokens are deleted

#### Scenario: Local users with same username are skipped
- **WHEN** a directory user's username matches an existing `auth_source = 'local'` user
- **THEN** the system skips that user and increments `skipped` count

#### Scenario: LDAP disabled blocks sync
- **WHEN** `POST /api/settings/ldap/sync` is called but `enabled = false` in `app_settings`
- **THEN** the system returns `400` with message "LDAP is not enabled"

#### Scenario: Unmapped group gets default role
- **WHEN** a directory user belongs to no group listed in `role_map`
- **THEN** the user is assigned `default_role` and `default_role_assigned` counter increments
