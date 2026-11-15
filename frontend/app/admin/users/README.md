# Admin Users Route (`frontend/app/admin/users`)

## Overview
Next.js App Router dynamic server-prefetched route (`/admin/users`) displaying the user directory for privileged roles (`mod`, `manager`, `chef_finance`) and enabling moderators (`mod`) to create users, change roles, and toggle active status.

## Interface
- `[page.tsx:dynamic]` — Route segment config exported as `"force-dynamic"`.
- `[page.tsx:AdminUsersPage]` — Default-exported async Server Component prefetching `GET /users` into a dehydrated `QueryClient` for `UsersClient`.
- `[page.tsx:userKeys]` / `[UsersClient.tsx:userKeys]` — Local React Query key factory (`all: ["users"]`, `list: () => [...userKeys.all, "list"]`).
- `[UsersClient.tsx:UsersClient]` — Default-exported client component rendering the user management table/cards and create-user form.
- `[UsersClient.tsx:CreateUserForm]` — Local interface for create-user form fields (`username`, `display_name`, `password`, `role`, `email`).
- `[UsersClient.tsx:ROLE_OPTIONS]` — Constant `["technician", "manager", "chef_finance", "mod"]`.
- `[UsersClient.tsx:ROLE_I18N]` — Translation key map for each `User["role"]`.

## Invariants
- View & query guard: `isPrivileged` restricts view access and client `useQuery` (`enabled: isPrivileged`) to roles `"mod"`, `"manager"`, and `"chef_finance"`; others render `access_denied` `[UsersClient.tsx:isPrivileged]`.
- Edit & create guard: `canEdit` restricts user creation, role `<select>`, and active-status toggle controls to `currentUser?.role === "mod"` `[UsersClient.tsx:canEdit]`.
- Self-modification guard: `isSelf` (`u.id === currentUser.id`) disables both the role `<select>` and active-status toggle button on the current user's own row `[UsersClient.tsx:isSelf]`.
- Per-row pending & deactivation guards: role `<select>` and active-toggle button are disabled while their respective mutation is pending for `u.id`; deactivating an active user (`target.is_active === true`) requires `window.confirm` confirmation `[UsersClient.tsx:roleMutation, UsersClient.tsx:activeMutation, UsersClient.tsx:handleToggleActive]`.
- Create form rules: `username`, `display_name`, and `password` are HTML-`required`, `email` uses `type="email"` and is omitted when empty, `role` defaults to `"technician"`, and submit is disabled while `createMutation.isPending` `[UsersClient.tsx:createMutation]`.

## Side Effects
- Server prefetch: `GET /users` via `serverFetch<User[]>("/users")`, logging errors via `console.error` `[page.tsx:AdminUsersPage]`.
- Client query & mutations: `GET /users`, `PUT /users/${id}/role` (`roleMutation`), `PUT /users/${id}/active` (`activeMutation`), and `POST /users` (`createMutation`), each invalidating `userKeys.all` on success and setting local error state (`actionError` / `createError`) on failure `[UsersClient.tsx:UsersClient, UsersClient.tsx:roleMutation, UsersClient.tsx:activeMutation, UsersClient.tsx:createMutation]`.
- Browser `window.confirm` prompt on deactivation and `<Link href="/profile/${u.id}">` navigation `[UsersClient.tsx:handleToggleActive, UsersClient.tsx:UsersClient]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
