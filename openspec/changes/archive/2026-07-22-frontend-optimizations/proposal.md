## Why

The Next.js 15 frontend has grown to 25+ page/component files with accumulated technical debt: duplicated utility functions across 13 files, zero dynamic imports for heavy components (800-line ExpenseForm loaded eagerly), no per-data-type React Query cache tuning, and multiple high-traffic pages missing SSR prefetch. These inefficiencies increase initial bundle size, cause unnecessary network requests, and slow time-to-interactive.

## What Changes

- **Shared formatting utilities** — Extract 13× duplicated `Intl.NumberFormat` wrappers into a single `lib/format.ts` with cached formatter instances
- **Dynamic imports** — Wrap `ExpenseForm` (35KB), `BulkReviewDrawer` (13KB), `SignaturePad` (5KB) with `next/dynamic` lazy loading
- **React Query cache tuning** — Add per-data-type `staleTime`/`gcTime` overrides (categories 5min, settings 5min, dashboard 60s) and enable `refetchOnWindowFocus` globally
- **SSR prefetch expansion** — Split `reports/page.tsx`, `reports/[id]/page.tsx`, `profile/[id]/page.tsx`, `admin/users/page.tsx`, and `admin/settings/page.tsx` into server component + client island pairs using the existing `HydrationBoundary` pattern
- **Next.js config cleanup** — Remove hardcoded `cpus: 6`, add `reactStrictMode: true`
- **Selective memoization** — Extract async handlers (API calls, downloads) from `.map()` loop callbacks

## Capabilities

### New Capabilities
- `shared-formatters`: Deduplicate currency formatting into a shared module with cached `Intl.NumberFormat` singletons
- `dynamic-loading`: Lazy-load heavy components (ExpenseForm, BulkReviewDrawer, SignaturePad) via `next/dynamic`
- `query-cache-tuning`: Per-data-type React Query `staleTime`/`gcTime` configuration
- `ssr-prefetch-expansion`: Extend the existing SSR+HydrationBoundary pattern to reports, profile, and admin pages

### Modified Capabilities
_(none — no existing spec-level behavior changes, only implementation optimizations)_

## Impact

- **Code**: ~25 files across `frontend/lib/`, `frontend/app/`, `frontend/components/`
- **New files**: `lib/format.ts`, `reports/ReportsClient.tsx`, `reports/[id]/ReportDetailClient.tsx`, `profile/[id]/ProfileDetailClient.tsx`, `admin/users/UsersClient.tsx`, `admin/settings/SettingsClient.tsx`
- **Dependencies**: No new npm packages
- **APIs**: No backend changes — only how/when the frontend calls existing APIs
- **Risk**: Medium for SSR splits (query key alignment), Low for all other changes
