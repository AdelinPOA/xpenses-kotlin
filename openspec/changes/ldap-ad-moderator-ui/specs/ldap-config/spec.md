## ADDED Requirements

### Requirement: Store LDAP connection configuration
The system SHALL persist LDAP/AD connection settings as a JSON value under key `ldap_config` in the `app_settings` table. The config object SHALL include: `enabled` (bool), `host`, `port` (int), `use_tls` (bool), `bind_dn`, `bind_password` (Fernet-encrypted at rest), `base_dn`, `user_filter`, `attr_username`, `attr_email`, `attr_display_name`, `attr_role`, `role_map` (JSON object mapping directory group values to app roles), and `default_role` (app role applied to users whose directory groups match no entry in `role_map`; defaults to `technician`).

#### Scenario: Save valid config
- **WHEN** `mod` submits a complete LDAP config via `PATCH /api/settings/ldap`
- **THEN** the system stores the config with `bind_password` Fernet-encrypted and returns `200` with the saved config (`bind_password` masked as `"***"`)

#### Scenario: Reject incomplete config
- **WHEN** `PATCH /api/settings/ldap` is called with missing required fields (`host`, `base_dn`, `bind_dn`)
- **THEN** the system returns `422` with field-level validation errors

#### Scenario: Non-mod cannot write config
- **WHEN** a user without `mod` role calls `PATCH /api/settings/ldap`
- **THEN** the system returns `403`

### Requirement: Retrieve LDAP configuration
The system SHALL expose `GET /api/settings/ldap` returning the current config with `bind_password` replaced by `"***"`. If the stored bind password cannot be decrypted (key rotation), the response SHALL include `"bind_password_invalid": true` to prompt re-entry.

#### Scenario: Unset config returns defaults
- **WHEN** no LDAP config has been saved and `mod` calls `GET /api/settings/ldap`
- **THEN** the system returns `200` with `enabled: false`, empty string fields, and `default_role: "technician"`

#### Scenario: Decryption failure flagged
- **WHEN** the stored bind password was encrypted with a different key and `mod` calls `GET /api/settings/ldap`
- **THEN** the response includes `"bind_password_invalid": true` and `"bind_password": "***"`

#### Scenario: Non-mod cannot read config
- **WHEN** a non-mod user calls `GET /api/settings/ldap`
- **THEN** the system returns `403`

### Requirement: DB config is authoritative; env vars removed
The system SHALL NOT read `ldap_enabled`, `ldap_host`, or `ldap_base_dn` from environment variables. All LDAP state SHALL come from the `app_settings` DB row. The login path SHALL call `get_ldap_config()` (reads `app_settings`) to determine whether LDAP is active.

#### Scenario: LDAP enabled state from DB only
- **WHEN** `LDAP_ENABLED=true` is set as an env var but `app_settings` has `enabled: false`
- **THEN** LDAP login attempts are rejected as if LDAP is disabled
