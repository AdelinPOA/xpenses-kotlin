# Categories Route (`frontend/app/categories`)

## Overview
Next.js App Router client route (`/categories`) enabling moderators to list, create, update, and deactivate expense categories and optional EUR spending limits.

## Interface
- `[page.tsx:CategoriesPage]` — Default-exported client route component rendering the categories table, create/edit form, and deactivation actions inside `AppShell`.
- `[page.tsx:FormState]` — Local form state interface `{ name: string; limit_amount: string }`.
- `[page.tsx:formatLimit]` — Local helper formatting `number | null` limits with `formatEur` or fallback label.

## Invariants
- Role & auth guard: requires `!loading && user && user.role === "mod"`; redirects unauthorized users to `/dashboard` and returns `null` when `!user || user.role !== "mod"` `[page.tsx:CategoriesPage]`.
- Form & limit rules: save requires truthy `form.name`; `limit_amount` parses via `parseFloat(form.limit_amount)` when truthy or sends `null`; save button is disabled while `save.isPending` `[page.tsx:CategoriesPage, page.tsx:save]`.
- Deactivation guard: deactivate button renders only when `cat.is_active` is truthy and is disabled while `deactivate.isPending` `[page.tsx:CategoriesPage]`.

## Side Effects
- Queries `GET /categories?active_only=false` (`categoryKeys.list()`, `staleTime: 300_000`, `gcTime: 600_000`) `[page.tsx:CategoriesPage]`.
- Mutations: `PATCH /categories/${editId}` or `POST /categories` (`save`), and `DELETE /categories/${id}` (`deactivate`, gated by `window.confirm`), each invalidating `categoryKeys.all` on success `[page.tsx:save, page.tsx:deactivate, page.tsx:confirmDeactivate]`.
- Redirects unauthorized users via `router.replace("/dashboard")` `[page.tsx:CategoriesPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
