# Dashboard Route (`frontend/app/dashboard`)

## Overview
Next.js App Router dynamic server-prefetched route (`/dashboard`) providing role-adaptive spending KPIs, recent expenses search, category breakdown, CSV export, and manager/finance review and advance-approval workspaces.

## Interface
- `[page.tsx:dynamic]` — Route segment config exported as `"force-dynamic"`.
- `[page.tsx:DashboardPage]` — Default-exported async Server Component prefetching `/dashboard` (`all: false`) and `/settings/ui` into `HydrationBoundary`.
- `[DashboardClient.tsx:DashboardClient]` — Default-exported client component rendering the technician or manager/finance dashboard inside `AppShell`.
- `[DashboardClient.tsx:getCategoryMeta]` — Internal helper mapping category names to Lucide icon and Tailwind color classes.

## Invariants
- View & role gating: `showAll` initializes to `true` (unlike SSR prefetch `{ all: false }`) and is toggleable only when `user?.role === "chef_finance" || user?.role === "mod"`; `isManagerRole` is active only when `user?.role === "manager" || (user?.role === "chef_finance" && showAll)`; `PendingReportsTable` receives `managerStats.pending_reports` only when `canManageReviews` (`manager` or `chef_finance`) and `managerStats` are truthy `[DashboardClient.tsx:DashboardClient, DashboardClient.tsx:canToggle, DashboardClient.tsx:isManagerRole, DashboardClient.tsx:canManageReviews]`.
- Query gating: `mobileUiConfig` and `data` require `!!user`; `userReports` requires `!!user && !isManagerRole`; `managerStats` requires `!!user && isManagerRole` `[DashboardClient.tsx:DashboardClient]`.
- Error & empty-state guards: renders loading skeleton when `authLoading || (!user && !isLoading)`, standalone `<QueryErrorNotice>` when `!data && dashboardError`, suppresses `PendingReportsTable`/`PendingAdvancesList` on `managerStatsError && !managerStats`, and shows `RecentActivityStream` only when `recent_activity.length > 0` `[DashboardClient.tsx:DashboardClient]`.
- Totals, slicing & badges: `reportStatusTotals` sums `r.total_reimbursable ?? r.total_amount ?? 0` by status (`draft`, `submitted`/`approved`, `paid`); desktop recent expenses slice `0..8`, mobile feed `0..6`, category breakdown `0..5` (percent clamped `<= 100`); `pendingNotificationCount` caps display at `"99+"` `[DashboardClient.tsx:reportStatusTotals, DashboardClient.tsx:filteredRecentExpenses, DashboardClient.tsx:pendingNotificationCount]`.
- Mobile quick-add FAB: renders only when `mobileUiConfig?.mobile_quick_add_fab_enabled === true`; mobile capture link calls `e.preventDefault()` when `!allowNavigation()` `[DashboardClient.tsx:DashboardClient]`.

## Side Effects
- Server prefetch: `serverFetch("/dashboard", { all: false })` and `serverFetch("/settings/ui")`, logging failures via `console.error` `[page.tsx:DashboardPage]`.
- Client queries & exports: `GET /settings/ui`, `GET /dashboard`, `GET /reports`, `GET /dashboard/manager`, and `downloadBlob("/expenses/export-csv", ...)` `[DashboardClient.tsx:DashboardClient]`.
- Review & advance mutations: `useReviewQueueActions` (`approve`, `reject`, `bulkApprove`, `bulkReject`), `POST /reports/${reportId}/advances/${advanceId}/pay`, and `POST /reports/${reportId}/advances/${advanceId}/reject`, triggering `refetchManagerStats()` and toast notifications `[DashboardClient.tsx:reviewActions, DashboardClient.tsx:handlePayAdvance, DashboardClient.tsx:handleRejectAdvance]`.
- Navigation, scroll listener & haptics: navigates via `router.push` and `<Link>` to `/approvals`, `/expenses/*`, and `/reports*`; registers passive `window` `"scroll"` listener; triggers `triggerHaptic` on interactive controls `[DashboardClient.tsx:DashboardClient]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
