# Admin Email Route (`frontend/app/admin/email`)

## Overview
Next.js App Router client route (`/admin/email`) providing SMTP notification configuration management and test-email delivery verification for moderators.

## Interface
- `[page.tsx:EmailAdminPage]` — Default-exported client route component rendering the SMTP configuration form and test-email panel inside `AppShell`.
- `[page.tsx:FormState]` — Local form state type `Omit<SmtpConfig, "smtp_port"> & { smtp_port: string }`.
- `[page.tsx:DEFAULT_FORM]` — Default `FormState` configuration (`emails_enabled: false`, `smtp_port: "587"`, `password_set: false`, empty host/user/pass/from).
- `[page.tsx:smtpConfigSchema]` — Zod validation schema enforcing SMTP configuration rules.
- `[page.tsx:onSubmit]` — Form submission handler transforming `FormState` to `SmtpConfig` and triggering `saveMutation`.
- `[page.tsx:handleTest]` — Handler triggering a test email send to `testRecipient`.

## Invariants
- Role and auth guard: `useQuery` (`emailKeys.config()`) is enabled only when `user?.role === "mod"` `[page.tsx:useQuery]`; non-`mod` or unauthenticated users after `loading` settles are redirected to `/dashboard` and render `null` `[page.tsx:EmailAdminPage]`.
- Loading guard: renders a loading spinner inside `AppShell` while `loading` is `true` `[page.tsx:EmailAdminPage]`.
- Port bounds: `smtp_port` must parse via `parseInt(val, 10)` as an integer between `1` and `65535` inclusive `[page.tsx:smtpConfigSchema]`.
- Sender format and conditional requirements: non-empty `smtp_from` must be a valid email address; when `emails_enabled` is `true`, both `smtp_host` and `smtp_from` must have `trim().length > 0` `[page.tsx:smtpConfigSchema]`.
- Password preservation: loading server config resets `smtp_pass` to `""` and `pwChanged` to `false`; `onSubmit` sends `smtp_pass` only when `pwChanged` is `true` (otherwise `""`) `[page.tsx:onSubmit]`.
- UI and test guards: `handleTest` returns early if `!testRecipient`; the test button is disabled when `testing || !testRecipient`, and the submit button is disabled during `saveMutation.isPending` `[page.tsx:handleTest, page.tsx:EmailAdminPage]`.

## Side Effects
- `GET /settings/email` via React Query (`emailKeys.config()`, `staleTime: 300_000`, `gcTime: 600_000`) `[page.tsx:useQuery]`.
- `PATCH /settings/email` via `saveMutation`; invalidates `emailKeys.all`, updates `saveError`/`pwChanged`, and shows `toast.success` or `toast.error` `[page.tsx:saveMutation]`.
- `POST /settings/email/test` via `handleTest` with `{ to: testRecipient }`; updates `testResult` and shows `toast.success` or `toast.error` `[page.tsx:handleTest]`.
- Client-side navigation via `router.replace("/dashboard")` for unauthorized users `[page.tsx:EmailAdminPage]`.
- Form state reset on query data load and `pwChanged` state mutation on password edits `[page.tsx:EmailAdminPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
