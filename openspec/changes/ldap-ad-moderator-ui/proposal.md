## Why

Enterprise deployments need centralized user management. Currently every user is seeded manually via `SEED_DEMO_USERS`, making it impossible for organizations already running LDAP or Active Directory to onboard their workforce without manual DB intervention. A `mod`-role UI for configuring and activating LDAP/AD sync solves this without requiring server access.

## What Changes

- New admin settings page (`/admin/ldap`) accessible to `mod` role only.
- Backend LDAP configuration stored in `app_settings` DB table (existing mechanism already used by mileage rates). DB config is authoritative; existing `ldap_enabled`/`ldap_host`/`ldap_base_dn` env vars are removed from `config.py` — the login path reads from `app_settings` at runtime.
- New endpoints: `GET/PATCH /api/settings/ldap` (read/write config), `POST /api/settings/ldap/test` (connection test), `POST /api/settings/ldap/sync` (manual sync trigger).
- On LDAP sync, users are provisioned/updated/deactivated in `users` table. Users removed from the directory are set `is_active = false` and their refresh tokens revoked — `auth_source` column already exists in the schema.
- Local password auth disabled for LDAP-sourced users. Profile page hides the password-change form for `auth_source = 'ldap'` users.
- Unmapped LDAP groups default to `technician` role (configurable default in config object).
- Existing `/admin/users` page gains an `auth_source` badge so mods can distinguish local vs LDAP accounts.
- Sidebar "Admin" section gains an LDAP entry visible only to `mod`.
- New `POST /api/users` endpoint for `mod` to create a local user (needed for production bootstrap when `SEED_DEMO_USERS` is off).

## Capabilities

### New Capabilities

- `ldap-config`: Store, retrieve, and validate LDAP/AD connection settings (host, port, bind DN, base DN, TLS, attribute mappings, default role for unmapped groups).
- `ldap-sync`: Provision, update, and deactivate users from directory via manual trigger; map directory attributes to app roles; revoke tokens for deactivated users.
- `ldap-admin-ui`: Moderator-facing settings page to activate LDAP, fill in connection parameters, test connectivity, and trigger sync.
- `local-user-create`: Mod-only endpoint and UI to manually create a local user account (production bootstrap path).

### Modified Capabilities

- `user-auth`: LDAP-sourced users bypass local password check; login reads LDAP enabled state from `app_settings` DB (not env vars); JWT issuance path unchanged.
- `user-management`: Existing `/admin/users` page shows `auth_source` badge per user. Password-change UI hidden for LDAP users on profile page.

## Impact

- **Backend:** `routers/ldap.py` (new), `services/ldap_service.py` (new), `routers/users.py` (add create endpoint), `routers/auth.py` login path reads LDAP config from DB, `config.py` removes `ldap_enabled`/`ldap_host`/`ldap_base_dn` fields.
- **Frontend:** `app/admin/ldap/page.tsx` (new), `app/admin/users/page.tsx` (auth_source badge, create user form), `app/profile/page.tsx` (hide password change for LDAP users), `Sidebar.tsx` (LDAP nav entry).
- **Dependencies:** Add `ldap3` and `cryptography` to `pyproject.toml`.
- **Note:** `auth_source` column, `is_active` flag, and token revocation logic already exist — no new migrations needed for these.
