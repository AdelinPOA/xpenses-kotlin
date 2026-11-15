# Frontend App Router (`frontend/app`)

## Overview
Root Next.js App Router package defining the global HTML document shell, theme/language pre-hydration initialization, PWA metadata, Tailwind v4 design tokens and safe-area/accessibility styles, root `/` redirect, loading skeleton, 404 page, and segment/root error boundaries, while composing all 12 top-level route groups under `frontend/app`.

## Interface
- `[layout.tsx:RootLayout]` — Default-exported root layout wrapping `{children}` and `<PwaRegistration />` in `<Providers>`.
- `[layout.tsx:metadata]` / `[layout.tsx:viewport]` — Next.js `Metadata` (PWA manifest, Apple web app tags, icons) and `Viewport` (`device-width`, `viewportFit: "cover"`, light/dark `themeColor`).
- `[page.tsx:Home]` — Default-exported root route component redirecting `/` to `/dashboard`.
- `[loading.tsx:Loading]` — Default-exported async Server Component rendering `<AppShell>` skeleton placeholders with localized `role="status"`.
- `[not-found.tsx:NotFound]` — Default-exported client 404 component linking back to `/dashboard`.
- `[error.tsx:Error]` — Default-exported client segment error boundary using `useTranslations("common")` and `reset`.
- `[global-error.tsx:GlobalError]` — Default-exported root client error boundary rendering standalone `<html><body>` recovery UI.
- `[globals.css:@theme]` / `[globals.css::root]` / `[globals.css:.dark]` — Tailwind v4 `@custom-variant dark`, theme color/animation tokens, light/dark CSS custom properties, safe-area utilities (`.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`, `.top-safe`, `.no-scrollbar`), and short-landscape viewport layout overrides.
- Subdirectories:
  - `./admin`: [./admin/README.md](./admin/README.md) — Moderator and finance administration routes (`/admin/*`).
  - `./advances`: [./advances/README.md](./advances/README.md) — Global pending advance requests queue (`/advances`).
  - `./approvals`: [./approvals/README.md](./approvals/README.md) — Manager and finance report approval queue (`/approvals`).
  - `./categories`: [./categories/README.md](./categories/README.md) — Expense category and limit management (`/categories`).
  - `./dashboard`: [./dashboard/README.md](./dashboard/README.md) — Role-adaptive spending and review dashboard (`/dashboard`).
  - `./expenses`: [./expenses/README.md](./expenses/README.md) — Expense list, capture, creation, detail, and editing (`/expenses/*`).
  - `./insurance`: [./insurance/README.md](./insurance/README.md) — Technician insurance document management (`/insurance`).
  - `./login`: [./login/README.md](./login/README.md) — Standalone authentication route (`/login`).
  - `./payments`: [./payments/README.md](./payments/README.md) — Finance approved-report payout queue (`/payments`).
  - `./profile`: [./profile/README.md](./profile/README.md) — User preferences, profile detail, and signature management (`/profile/*`).
  - `./reports`: [./reports/README.md](./reports/README.md) — Expense report listing, creation, detail, editing, mileage, and advances (`/reports/*`).
  - `./search`: [./search/README.md](./search/README.md) — Global search across reports and expenses (`/search`).

## Invariants
- Root layout & pre-hydration scripts: `<html>` sets `lang="en"` with `suppressHydrationWarning`; `<Providers>` wraps `{children}` and `<PwaRegistration />`; `theme-init` toggles `.dark` from `localStorage.getItem("theme")` or `prefers-color-scheme: dark`, and `lang-init` restricts `document.documentElement.lang` to `"ro"` or `"en"` `[layout.tsx:RootLayout, layout.tsx:theme-init, layout.tsx:lang-init]`.
- Root redirect & error boundaries: `/` unconditionally calls `redirect("/dashboard")`; `Error` relies on `Providers`/`next-intl` context, whereas `GlobalError` renders its own `<html>`/`<body>` with hardcoded English copy `[page.tsx:Home, error.tsx:Error, global-error.tsx:GlobalError]`.
- Styling & accessibility rules: `@custom-variant dark` binds dark utilities to `.dark`; `@media (prefers-reduced-motion: reduce)` minimizes animation/transition durations and disables smooth scrolling; `@layer base` enforces `touch-action: manipulation` on interactive controls and `box-sizing: border-box`; short landscape viewports (`max-height: 500px`) unstick `.expense-form-actions` `[globals.css:@custom-variant dark, globals.css:@media (prefers-reduced-motion: reduce), globals.css:@layer base, globals.css:@media (orientation: landscape) and (max-height: 500px)]`.

## Side Effects
- Server redirect during `/` render via `redirect("/dashboard")` `[page.tsx:Home]`.
- Pre-hydration DOM mutations (`beforeInteractive` scripts): reads `localStorage` / `matchMedia` to toggle `document.documentElement.classList` (`.dark`) and reads `document.cookie` to mutate `document.documentElement.lang` `[layout.tsx:theme-init, layout.tsx:lang-init]`.
- Mounts `<PwaRegistration />` and attaches boundary `reset` handlers in `Error` and `GlobalError` `[layout.tsx:RootLayout, error.tsx:Error, global-error.tsx:GlobalError]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
