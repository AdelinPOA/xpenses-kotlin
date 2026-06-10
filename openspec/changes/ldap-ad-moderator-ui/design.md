## Context

The codebase already has significant LDAP scaffolding: `auth_source VARCHAR(20) DEFAULT 'local'` exists in the `users` schema, the login handler in `routers/auth.py` already branches on `auth_source` (raises HTTP 501 for `ldap`), and `config.py` has stub fields `ldap_enabled`, `ldap_host`, `ldap_base_dn`. The `app_settings` table is already used for mileage rates. The `mod`-only `/admin/users` page (list, role change, activate/deactivate) already exists. The task is to fill the implementation gap, not rebuild scaffolding.

## Goals / Non-Goals

**Goals:**
- `mod` can configure and activate LDAP/AD from the browser; DB config is authoritative at runtime.
- Manual sync provisions new users, updates changed attributes, and deactivates users removed from the directory.
- LDAP-provisioned users authenticate via directory bind; local bcrypt path skipped for them.
- Profile page and admin user list are LDAP-aware.
- A `mod` can create a local user manually (production bootstrap without `SEED_DEMO_USERS`).

**Non-Goals:**
- Scheduled/automatic sync (manual trigger only for v1).
- SAML or OAuth/OIDC.
- Migrating existing local users to LDAP retroactively.
- LDAP users setting a local fallback password (v2).
- Paginated sync for directories > 1000 entries (add `ldap3` paging if needed post-v1).

## Decisions

### 1. DB is authoritative for LDAP config; env var stubs removed
**Alternatives:** Env vars only; merge env + DB.
**Rationale:** The existing `ldap_enabled`/`ldap_host`/`ldap_base_dn` env vars in `config.py` create a dual-source-of-truth problem: a mod enables LDAP via the UI (DB), but the login path still reads `settings.ldap_enabled` (env = False), so logins silently fail. Fix: remove those three fields from `Settings`, replace with a `get_ldap_config()` helper that reads `app_settings` at call time. Startup is unaffected.

### 2. `ldap3` library (pure Python, no C dependency)
**Alternatives:** `python-ldap` (requires OpenLDAP C libs, incompatible with Alpine Dockerfile).
**Rationale:** `ldap3` installs from PyPI with no OS packages.

### 3. Bind credential stored Fernet-encrypted in `app_settings`
**Alternative:** Plaintext.
**Rationale:** Bind DN password is a privileged directory credential. Encrypt with `JWT_SECRET` (already required, available as `settings.jwt_secret`) before writing; decrypt at connection time. If decryption fails (key changed), config page surfaces a warning and prompts re-entry.

### 4. Deactivate-on-sync for users absent from directory
**Alternative:** Only block at login (leave `is_active = true`).
**Rationale:** Ex-employees with valid refresh tokens could use the app until token expiry (up to 7 days). Setting `is_active = false` and calling the existing token-revocation path (`DELETE FROM refresh_tokens WHERE user_id = $1`) is immediate and consistent with the existing deactivation flow in `routers/users.py`.

### 5. Unmapped LDAP groups → configurable default role (default: `technician`)
**Alternative:** Reject users with no matching group.
**Rationale:** Rejecting is too strict for initial rollout. A `default_role` field in the config object lets the org tune this. The sync result summary includes a count of users assigned the default role so the mod can audit.

### 6. `auth_source` badge on existing `/admin/users` page
**Rationale:** Without this, a `mod` cannot tell which accounts are LDAP-managed. Attempting to set a password for an LDAP user or wondering why a deactivated LDAP user came back after sync are concrete support problems. One badge column is cheap.

### 7. `POST /api/users` — create local user endpoint
**Rationale:** `seed.py` is gated behind `SEED_DEMO_USERS=true`, which is inappropriate for production. Without a create-user endpoint, the initial `mod` account has no production path. This is a `mod`-only endpoint, no UI registration flow.

## Risks / Trade-offs

- **Directory unavailability at login** → LDAP users cannot log in. Mitigation: always keep at least one `local` `mod` account; login error message distinguishes "LDAP unreachable" from "wrong password".
- **Attribute mapping misconfiguration** → users synced with wrong roles. Mitigation: dry-run preview in `POST /api/settings/ldap/test` shows mapped role before commit.
- **Fernet key rotation** → stored bind password unreadable. Mitigation: config page detects decryption failure and shows re-entry prompt; LDAP logins blocked until re-saved.
- **Large directories** → sync latency. Mitigation: `ldap_user_filter` scopes the search; `ldap3` paging can be added later.
- **Sync deactivates a user whose AD account was temporarily disabled** → they lose app access. Mitigation: re-sync after AD account is re-enabled restores `is_active = true`.

## Migration Plan

1. Remove `ldap_enabled`, `ldap_host`, `ldap_base_dn` from `config.py` — any deployment using these env vars will lose the ignored-anyway values. No data migration needed.
2. Deploy backend with new router/service. Existing `local` users unaffected. LDAP login path changes from HTTP 501 to real bind.
3. `mod` opens `/admin/ldap`, configures, tests, activates.
4. Rollback: set `enabled: false` via the UI or delete the `ldap_config` row from `app_settings`; all logins fall back to local path.

## Open Questions

- Should sync be triggered automatically after saving a valid config, or always manual? (Current: always manual.)
- Should the `default_role` for unmapped groups be `technician` (permissive) or should unmapped users be skipped entirely? (Current decision: default `technician`, configurable.)
