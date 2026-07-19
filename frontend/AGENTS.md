# frontend — Next.js 15 Frontend

## OVERVIEW
Next.js 15 + React 19 + TypeScript 5 + Tailwind CSS v4 (CSS-first config). Expense management UI. 58+ source files.

## STRUCTURE
```
├── app/                     # App Router: 12 route groups + admin panel
│   ├── admin/               #   email, imap, ldap, ocr, receipts, settings, storage, users
│   ├── dashboard/           #   DashboardClient.tsx + page.tsx
│   ├── expenses/            #   list, new, [id]/edit
│   ├── reports/             #   list, new, [id]/, [id]/advances, [id]/mileage, [id]/edit
│   ├── advances/            #   approvals, categories, insurance, inventory, payments, profile
│   └── layout.tsx           #   root layout with AuthProvider
├── components/              # Shared React components
│   ├── dashboard/           #   3 components
│   ├── expenses/            #   ExpenseForm.tsx (706 lines)
│   ├── layout/              #   AppShell, Sidebar
│   ├── signature/           #   SignaturePad
│   └── ui/                  #   Badge, EmptyState
├── lib/                     # API client, auth, query keys, themes, useBodyScrollLock
├── middleware.ts             # Auth redirect (checks access_token cookie)
└── next.config.ts
```

## WHERE TO LOOK
| Task | File(s) |
|------|---------|
| Add page route | New dir under `app/` with `page.tsx` |
| Add API call | `lib/api.ts` (axios instance) + `lib/queryKeys.ts` |
| Auth logic | `lib/auth.ts`, `components/AuthProvider.tsx`, `middleware.ts` |
| UI component | `components/ui/` or create in `components/` |
| Theme/dark mode | `components/ThemeProvider.tsx`, `lib/themes.ts`, `app/globals.css` |

## CONVENTIONS
- **Auth**: JWT in httpOnly cookies. Axios `withCredentials: true`. Auto-refresh on 401.
- **API URLs**: SSR uses `INTERNAL_API_URL=http://backend:8080/api`, browser uses `NEXT_PUBLIC_API_URL=http://localhost:8001/api`.
- **File downloads**: `api.get(url, { responseType: 'blob' })` → `URL.createObjectURL` → synthetic click. No `<a href>` for auth.
- **Dark mode**: `.dark` class on `<html>`. `@custom-variant dark` in CSS.
- **Tailwind v4**: CSS-first config (no `tailwind.config.js`).
- **Data fetching**: TanStack Query v5 + axios. RSC hydration boundaries in some pages.
- **Forms**: react-hook-form 7 + zod 4.

## ANTI-PATTERNS
- Never `<a href>` for authenticated file downloads.
- Never directly access cookies in client components — use middleware for redirects.
- No tailwind.config.js (v4 uses CSS-first config).

## COMMANDS
```bash
# Dev server (hot reload via Turbopack)
npm run dev -- -p 3001

# TypeScript check + lint
npx tsc --noEmit && npx eslint .

# Production build
npm run build
```
