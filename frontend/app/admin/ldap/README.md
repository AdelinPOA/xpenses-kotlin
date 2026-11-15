# Admin LDAP Route (`frontend/app/admin/ldap`)

## Overview
Next.js App Router client route (`/admin/ldap`) providing LDAP/Active Directory authentication settings, directory-to-role mapping management, connection testing, and manual directory synchronization for moderators.

## Interface
- `[page.tsx:LdapAdminPage]` — Default-exported client route component for `/admin/ldap`.
- `[page.tsx:ROLE_OPTIONS]` — Constant array `["technician", "manager", "chef_finance", "mod"]` of assignable application roles.
- `[page.tsx:FormState]` — Local form type `Omit<LdapConfig, "port"> & { port: string }`.
- `[page.tsx:DEFAULT_FORM]` — Default `FormState` (`port: "389"`, `user_filter: "(objectClass=person)"`, `attr_username: "uid"`, `attr_email: "mail"`, `attr_display_name: "cn"`, `attr_role: "memberOf"`, `default_role: "technician"`, `role_map: {}`, booleans `false`).
- `[page.tsx:RoleMapEntry]` — Local type `{ dir: string; role: string }`.
- `[page.tsx:roleMapToEntries]` — Helper converting `Record<string, string>` to `RoleMapEntry[]`.
- `[page.tsx:entriesToRoleMap]` — Helper converting `RoleMapEntry[]` to `Record<string, string>`.
- `[page.tsx:ldapConfigSchema]` — Zod schema validating `FormState`.

## Invariants
- Role and auth guard: redirects to `/dashboard` when `!loading && (!user || user.role !== "mod")`, renders `null` when `!user || user.role !== "mod"`, and gates `ldapKeys.config()` query with `enabled: user?.role === "mod"` `[page.tsx:LdapAdminPage]`.
- Config validation: `port` must parse as an integer in `[1, 65535]`; `user_filter`, `attr_username`, `attr_email`, `attr_display_name`, and `attr_role` require `min(1)`; when `enabled` is `true`, `host`, `bind_dn`, and `base_dn` must have `trim().length > 0` `[page.tsx:ldapConfigSchema]`.
- Role mapping serialization: `entriesToRoleMap` drops entries with empty/falsy `e.dir`; selectable `default_role` and mapped target roles are constrained to `ROLE_OPTIONS` `[page.tsx:entriesToRoleMap, page.tsx:ROLE_OPTIONS]`.
- Password preservation: server load resets `bind_password` to `""` and resets `pwChanged` and `roleEntriesDirty` to `false`; `onSubmit` sends `bind_password: ""` unless `pwChanged` is `true`, and `handleTest` sets `use_stored_password: !pwChanged` `[page.tsx:LdapAdminPage, page.tsx:onSubmit, page.tsx:handleTest]`.
- UI action guards: Save is disabled during `saveMutation.isPending`, Test during `testing`, and Sync when `!enabled || syncing` `[page.tsx:LdapAdminPage]`.

## Side Effects
- `GET /settings/ldap` via React Query (`ldapKeys.config()`, `staleTime: 300_000`, `gcTime: 600_000`) `[page.tsx:LdapAdminPage]`.
- `PATCH /settings/ldap` via `saveMutation`; invalidates `ldapKeys.all`, resets `pwChanged`/`roleEntriesDirty`/`syncResult`, updates `saveError`, and triggers `toast.success` or `toast.error` `[page.tsx:saveMutation]`.
- `POST /settings/ldap/test` via `handleTest` and `POST /settings/ldap/sync` via `handleSync`; update `testResult`/`syncResult`/`syncError` state and trigger toast notifications `[page.tsx:handleTest, page.tsx:handleSync]`.
- Redirects unauthorized users via `router.replace("/dashboard")` `[page.tsx:LdapAdminPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
