# Profile Route (`frontend/app/profile`)

## Overview
Next.js App Router client route (`/profile`) allowing the signed-in user to update display name, notification preference, and UI language, and change their password (when not LDAP-managed), alongside child routes for user profile detail views and personal signature management.

## Interface
- `[page.tsx:ProfilePage]` — Default-exported client route component rendering account details, preferences form, and conditional password change form inside `AppShell`.
- `[page.tsx:LANGUAGE_LABELS]` — Constant `Record<Locale, string>` mapping supported locales (`en`, `ro`) to display labels.
- Subdirectories:
  - `./[id]`: [./[id]/README.md](./[id]/README.md) — Server-prefetched user profile detail and reports view (`/profile/[id]`).
  - `./signature`: [./signature/README.md](./signature/README.md) — Personal signature upload, preview, and deletion route (`/profile/signature`).

## Invariants
- State initialization defaults: `displayName` defaults to `user?.display_name ?? ""`, `notificationsEnabled` to `user?.notifications_enabled ?? true`, and `language` to `(user?.language as Locale) || locale` `[page.tsx:ProfilePage]`.
- LDAP password restriction: when `user?.auth_source === "ldap"`, the password change form is omitted and replaced with `t("password_managed")` `[page.tsx:ProfilePage]`.
- Password validation & pending locks: password form requires `#current-password`, `#new-password`, and `#confirm-password`, aborts submission with `t("passwords_mismatch")` when `newPassword !== confirmPassword`, and disables save/submit buttons while `profileMutation.isPending` / `passwordMutation.isPending` `[page.tsx:ProfilePage, page.tsx:profileMutation, page.tsx:passwordMutation]`.

## Side Effects
- `PATCH /users/me` (`profileMutation`): updates `profileMsg`, auth context via `setUser(res.data)`, and locale context via `setLocale(res.data.language as Locale)` on success `[page.tsx:profileMutation]`.
- `POST /auth/change-password` (`passwordMutation`): updates `passwordMsg` / `passwordError` and clears password input state on success `[page.tsx:passwordMutation]`.
- Updates ARIA live regions (`role="status"` and `role="alert"`) in the DOM `[page.tsx:ProfilePage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
