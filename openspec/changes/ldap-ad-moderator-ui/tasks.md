## 1. Dependencies & Config Cleanup

- [x] 1.1 Add `ldap3` and `cryptography` to `[project.dependencies]` in `backend/pyproject.toml`
- [x] 1.2 Remove `ldap_enabled`, `ldap_host`, `ldap_base_dn` fields from `backend/xpenses/config.py` — DB config is now authoritative

## 2. Backend — LDAP Service

- [x] 2.1 Create `backend/xpenses/services/ldap_service.py` with Fernet key derived from `settings.jwt_secret`
- [x] 2.2 Implement `get_ldap_config(pool)` — reads `ldap_config` JSON from `app_settings`; returns typed dataclass with defaults if unset; flags `bind_password_invalid` if Fernet decryption fails
- [x] 2.3 Implement `save_ldap_config(config, pool)` — Fernet-encrypts `bind_password` before writing to `app_settings`
- [x] 2.4 Implement `test_connection(config)` — binds to directory, searches with `user_filter`, returns `{ ok, preview[], error }`; preview includes mapped app role per user
- [x] 2.5 Implement `_map_role(directory_groups, role_map, default_role)` — returns app role string
- [x] 2.6 Implement `sync_users(config, pool)` — upsert new/changed users, set `is_active=false` + revoke tokens for directory-absent LDAP users, skip `auth_source='local'` conflicts; returns `{ created, updated, deactivated, skipped, default_role_assigned }`
- [x] 2.7 Implement `authenticate_ldap(username, password, config)` — performs user DN bind; raises distinct exception for unreachable vs wrong credentials

## 3. Backend — LDAP Router

- [x] 3.1 Create `backend/xpenses/routers/ldap.py` with prefix `/api/settings/ldap`, all routes gated to `mod` role
- [x] 3.2 `GET /api/settings/ldap` — returns config with masked password and `bind_password_invalid` flag
- [x] 3.3 `PATCH /api/settings/ldap` — validates and saves via `ldap_service.save_ldap_config()`
- [x] 3.4 `POST /api/settings/ldap/test` — calls `test_connection()`, never 5xx for directory errors
- [x] 3.5 `POST /api/settings/ldap/sync` — calls `sync_users()`, returns summary; returns `400` if `enabled=false`
- [x] 3.6 Register `ldap.router` in `backend/xpenses/main.py`

## 4. Backend — Auth Integration

- [x] 4.1 In `routers/auth.py` login handler: replace `settings.ldap_enabled` check with `get_ldap_config()` call
- [x] 4.2 Call `ldap_service.authenticate_ldap()` for `auth_source='ldap'` users; return `503` if directory unreachable, `401` if wrong credentials (identical shape to local wrong-password response)

## 5. Backend — Local User Create

- [x] 5.1 Add `POST /api/users` to `backend/xpenses/routers/users.py` (mod-only): accepts `username`, `display_name`, `password`, `role`, optional `email`; returns `201 UserOut`; returns `409` on duplicate username

## 6. Backend — Tests

- [x] 6.1 `tests/test_ldap_config.py`: GET defaults when unset; PATCH saves + masks password; non-mod gets 403; `bind_password_invalid` flag when key mismatch
- [x] 6.2 `tests/test_ldap_sync.py`: creates new users with `auth_source='ldap'`; updates changed attrs; deactivates absent LDAP users + revokes tokens; skips local users; unmapped group gets `default_role`
- [x] 6.3 `tests/test_ldap_auth.py`: LDAP user blocked when LDAP disabled in DB; local user unaffected; directory unreachable returns 503
- [x] 6.4 `tests/test_users.py`: mod can create local user; duplicate username returns 409; non-mod cannot create

## 7. Frontend — LDAP Settings Page

- [x] 7.1 Create `frontend/app/admin/ldap/page.tsx` with route guard (redirect non-mod to `/dashboard`)
- [x] 7.2 Add TypeScript types and API calls for `GET/PATCH /api/settings/ldap`, `POST /api/settings/ldap/test`, `POST /api/settings/ldap/sync` to `frontend/lib/api.ts`
- [x] 7.3 Add query key `['ldap-config']` to `frontend/lib/queryKeys.ts`
- [x] 7.4 Build config form: host, port, TLS toggle, bind DN, bind password, base DN, user filter, attribute mapping fields, `default_role` dropdown
- [x] 7.5 Add role map editor: list of `{ directoryValue, appRole }` pairs with add/remove rows
- [x] 7.6 Show amber warning banner when `bind_password_invalid: true` is returned by GET
- [x] 7.7 Wire "Save" button — `PATCH` call with success toast and inline error banner
- [x] 7.8 Wire "Test Connection" button — test endpoint with current form state, show preview table (username, email, mapped role) or error badge
- [x] 7.9 Wire "Sync Now" button (disabled when `enabled=false`) — sync endpoint, show `Created / Updated / Deactivated / Skipped / Default role assigned`

## 8. Frontend — Admin Users Page & Profile

- [x] 8.1 Add `auth_source` badge column to `frontend/app/admin/users/page.tsx` user table (grey "local" / blue "ldap")
- [x] 8.2 Add "Create User" button to `/admin/users` that opens an inline form (username, display name, password, role, email); calls `POST /api/users`; shows 409 error inline
- [x] 8.3 Add `POST /api/users` to `frontend/lib/api.ts`
- [x] 8.4 In `frontend/app/profile/page.tsx`: check `user?.auth_source`; hide password-change form for `ldap` users; show informational note instead

## 9. Frontend — Sidebar

- [x] 9.1 Add "Admin" section to `frontend/components/layout/Sidebar.tsx` visible only when `user?.role === 'mod'`
- [x] 9.2 Add "LDAP / AD" nav item linking to `/admin/ldap` and "Users" nav item linking to `/admin/users` inside that section
