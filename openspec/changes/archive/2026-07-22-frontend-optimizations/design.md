## Context

The xpenses-kotlin frontend is a Next.js 15 app (React 19, Tailwind v4, React Query v5, Axios) serving an internal expense management system. The app currently has ~25 `"use client"` page files, most fetching data exclusively on the client via React Query. Two pages (dashboard, expenses) already use an SSR prefetch pattern with `HydrationBoundary` + `serverFetch`. The codebase has accrued duplicated utility functions and lacks fine-grained cache tuning.

**Current architecture:**
- `lib/api.ts` — Axios instance with 401 interceptor, types, API helpers
- `lib/serverApi.ts` — Server-side `fetch` wrapper forwarding auth cookies
- `lib/queryKeys.ts` — React Query key factories
- `components/Providers.tsx` — QueryClient with global `staleTime: 30_000`
- Every page file is `"use client"` except `dashboard/page.tsx` and `expenses/page.tsx`

## Goals / Non-Goals

**Goals:**
- Reduce initial JS bundle for high-traffic pages by lazy-loading heavy components
- Eliminate 13× duplicated `Intl.NumberFormat` wrappers with cached singletons
- Tune React Query cache per data type to reduce unnecessary refetches
- Extend the existing SSR prefetch pattern to reports, profile detail, and admin pages
- Clean up `next.config.ts` (remove hardcoded `cpus: 6`, enable `reactStrictMode`)

**Non-Goals:**
- Full RSC migration (converting all client components to server components)
- Adding new npm dependencies (no bundle analyzer, no new libraries)
- Backend API changes
- Virtualizing long lists (inventory, expenses) — future optimization
- Internationalizing the formatter (locale is hardcoded to `en-GB`)

## Decisions

### D1: Cached `Intl.NumberFormat` singletons over per-call instantiation

**Decision**: Create `lib/format.ts` with a `Map<string, Intl.NumberFormat>` cache. Export `formatEur(amount)` (EUR singleton) and `formatAmount(amount, currency)` (cache-backed).

**Alternatives considered:**
- *Per-module const* — would still duplicate across 13 files
- *React context* — overkill for a pure function, adds provider nesting

**Rationale**: `Intl.NumberFormat` construction is not free (~0.3ms). Caching eliminates this on every render. A module-level cache is the simplest pattern with zero component coupling.

### D2: `next/dynamic` for interaction-triggered components

**Decision**: Wrap `ExpenseForm`, `BulkReviewDrawer`, `SignaturePad` with `next/dynamic`. Use `ssr: false` only for `SignaturePad` (Canvas API).

**Alternatives considered:**
- *React.lazy + Suspense* — doesn't support `ssr: false`, less idiomatic in Next.js
- *Route-level code splitting* — these components are embedded within pages, not routes

**Rationale**: These components are large (35KB, 13KB, 5KB) but only needed after specific user actions. `next/dynamic` is the standard Next.js lazy loading mechanism.

### D3: Per-data-type React Query `staleTime`/`gcTime` via query options

**Decision**: Add `staleTime` / `gcTime` directly to individual `useQuery` calls rather than creating a centralized query options factory.

| Data type | `staleTime` | `gcTime` |
|---|---|---|
| Categories | 5 min | 10 min |
| Settings configs | 5 min | 10 min |
| Dashboard stats | 60s | 5 min (default) |
| User list | 2 min | 5 min |
| Expenses/Reports | 30s (global default) | 5 min (default) |

Enable `refetchOnWindowFocus: true` in the global QueryClient defaults.

**Alternatives considered:**
- *Query options factory in queryKeys.ts* — more DRY but adds abstraction, harder to see what's configured per-query
- *React Query `defaultOptions` per key prefix* — not supported natively

### D4: SSR split pattern — server page + client component + HydrationBoundary

**Decision**: Follow the exact same pattern as the existing `dashboard/page.tsx` and `expenses/page.tsx`:

1. Rename the current `"use client"` page to `<Name>Client.tsx`
2. Create a new `page.tsx` as an `async` server component
3. Server component calls `serverFetch()`, populates `QueryClient`, wraps with `HydrationBoundary`
4. Client component's `useQuery` finds data already in the hydrated cache → no refetch on mount

**Pages to convert:** `reports/page.tsx`, `reports/[id]/page.tsx`, `profile/[id]/page.tsx`, `admin/users/page.tsx`, `admin/settings/page.tsx`

**Alternatives considered:**
- *Full RSC with streaming* — too invasive, requires rethinking the data layer
- *`initialData` prop passing* — couples server and client, less clean than hydration

### D5: Remove `cpus: 6`, add `reactStrictMode`

**Decision**: Delete the `experimental.cpus` config (let Next.js auto-detect) and add `reactStrictMode: true`.

**Rationale**: `cpus: 6` is an arbitrary limit. `reactStrictMode` catches bugs via double-rendering in dev mode with zero production impact.

## Risks / Trade-offs

- **[SSR query key mismatch]** → Keys in server prefetch must exactly match client `useQuery` keys. **Mitigation**: Use the same `queryKeys.ts` factories in both. Test by verifying no client-side refetch occurs on navigation.
- **[SSR auth cookie forwarding]** → `serverFetch` forwards cookies from the incoming request. If cookies are missing (e.g., middleware race), the prefetch silently fails and falls back to client fetch. **Mitigation**: `try/catch` in server components (existing pattern).
- **[Dynamic import loading flash]** → Lazy-loaded components show a skeleton briefly. **Mitigation**: Use meaningful loading skeletons (not spinners). Users already see a page load before clicking "New Expense".
- **[reactStrictMode double-renders]** → May surface existing bugs (duplicate API calls, effects without cleanup). **Mitigation**: This is the whole point — fix issues as they surface in dev.
