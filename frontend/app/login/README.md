# Login Route (`frontend/app/login`)

## Overview
Next.js App Router authentication route (`/login`) providing a standalone layout and credential login form with open-redirect protection and rate-limit error handling.

## Interface
- `[layout.tsx:LoginLayout]` — Default-exported passthrough layout component rendering `{children}` without `AppShell`.
- `[page.tsx:LoginPage]` — Default-exported client route component wrapping `<LoginForm />` in `<Suspense fallback={null}>`.
- `[page.tsx:LoginForm]` — Internal login form component managing credential inputs, password visibility toggle, and `handleSubmit`.

## Invariants
- Pre-hydration guard: `ready` initializes `false` and becomes `true` in `useEffect`; inputs, visibility toggle, and submit button enforce `disabled={!ready || loading}` `[page.tsx:LoginForm]`.
- Input & credential rules: `#login-username` and `#login-password` are HTML-`required`; `handleSubmit` trims `username` and returns early with `error_invalid_credentials` if either `submittedUsername` or `submittedPassword` is empty `[page.tsx:LoginForm, page.tsx:handleSubmit]`.
- Open-redirect protection: `next` query param defaults to `"/dashboard"` and is accepted only when starting with `"/"`, not `"//"`, not `"/\\"`, and resolving to `http://localhost` origin via `new URL(next, "http://localhost")`, rewriting to `pathname + search + hash` `[page.tsx:handleSubmit]`.
- Error mapping: HTTP `429` maps to `t("error_rate_limited")`; all other errors map to `t("error_invalid_credentials")` `[page.tsx:handleSubmit]`.

## Side Effects
- Calls `login(submittedUsername, submittedPassword)` (`@/lib/auth`), updates auth context via `setUser(user)`, and navigates via `router.push(safeNext)` `[page.tsx:handleSubmit]`.
- Updates `ready` on mount, reads `useSearchParams().get("next")`, and renders `role="alert"` error banner when `error` is set `[page.tsx:LoginForm]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
