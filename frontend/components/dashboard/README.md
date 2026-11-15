# Dashboard Components

## Overview
Client-side dashboard visualization, manager approval queue, advance payout list, activity feed, and slide-over report review components.

## Interface
- `[ExpenseStatusOverview.tsx:ExpenseStatusOverview]` — Default-exported client component accepting `ExpenseStatusOverviewProps` `{ approved: number; pending: number; total: number }`.
- `[ManagerKpiCards.tsx:ManagerKpiCards]` — Default-exported client component accepting `ManagerKpiCardsProps` `{ kpis: ManagerKpis }`.
- `[PendingAdvancesList.tsx:PendingAdvancesList]` — Default-exported client component accepting `PendingAdvancesListProps` `{ advances: PendingAdvanceSummary[]; onSelectAdvance?: (reportId: number) => void; onPay: (reportId: number, advanceId: number, e: React.MouseEvent) => void; onReject: (reportId: number, advanceId: number, e: React.MouseEvent) => void }` (`onSelectAdvance` is declared on the props type but not destructured or invoked).
- `[PendingReportsTable.tsx:PendingReportsTable]` — Default-exported client component accepting `PendingReportsTableProps` `{ reports: PendingReportSummary[]; onApprove: (reportId: number) => void; onReject: (reportId: number, reason: string) => void; actionPending?: boolean; onBulkApprove?: (ids: number[]) => void; onBulkReject?: (ids: number[], reason: string) => void; bulkPending?: boolean }`.
- `[PendingReportsTable.tsx:ReportAccordionDetail]` — Internal subcomponent accepting `{ reportId: number; onApprove: (reportId: number) => void; onReject: (reportId: number, reason: string) => void; actionPending?: boolean; onViewReceipts: () => void }`.
- `[RecentActivityStream.tsx:RecentActivityStream]` — Default-exported client component accepting `RecentActivityStreamProps` `{ activities: ActivityFeedItem[] }`.
- `[ReimbursementFlowLedger.tsx:ReimbursementFlowLedger]` — Default-exported client component accepting `ReimbursementFlowLedgerProps` `{ totals: StatusData }` where `StatusData` is `{ draftCount: number; draftEur: number; submittedCount: number; submittedEur: number; paidCount: number; paidEur: number }`.
- `[SlideOverReviewDrawer.tsx:SlideOverReviewDrawer]` — Default-exported client component accepting `SlideOverReviewDrawerProps` `{ reportId: number | null; onClose: () => void; onApprove: () => void; onReject: (reason: string) => void; actionPending: boolean; actionError: string | null }`.
- `[SpendChart.tsx:SpendChart]` — Default-exported client component accepting `SpendChartProps` `{ data: DataPoint[] }` where `DataPoint` is `{ date: string; amount: number }`.

## Invariants
- `[ExpenseStatusOverview.tsx:"use client"]` All dashboard components carry the `"use client"` directive.
- `[ExpenseStatusOverview.tsx:ExpenseStatusOverview]` Uses `arcLength = 113.097` (`PI * 36`), `safeTotal = total || 1`, caps fill ratios at `1` via `Math.min(..., 1)`, renders the approved arc only when `approved > 0` and the pending arc only when `pending > 0` with `strokeDashoffset = -approvedLength`.
- `[ManagerKpiCards.tsx:ManagerKpiCards]` Formats monetary KPI values via `formatEur` and resolves labels from the `next-intl` `"dashboard"` namespace.
- `[PendingAdvancesList.tsx:PendingAdvancesList]` Renders an empty state when `advances.length === 0`; otherwise renders links to `/advances` and Approve/Reject buttons calling `onPay(adv.report_id, adv.id, e)` and `onReject(adv.report_id, adv.id, e)`.
- `[PendingReportsTable.tsx:PendingReportsTable]` Renders an empty state when `reports.length === 0`; auto-expands `reports[0]` when `userExpandedId === null && !userCollapsedFirst`.
- `[PendingReportsTable.tsx:PendingReportsTable]` Multi-select mode requires both `onBulkApprove` and `onBulkReject` to be defined and `reports.length > 1` (`canSelectMultiple`); entering via 500ms pointer long-press sets `suppressNextClick` to prevent toggling selection on release.
- `[PendingReportsTable.tsx:PendingReportsTable]` `submitBulkApprove` requires `selectedIds.size > 0 && !bulkPending`; `submitBulkReject` requires `selectedIds.size > 0 && bulkRejectReason.trim() && !bulkPending`; both call `exitSelectionMode()` immediately after invoking the bulk callback.
- `[PendingReportsTable.tsx:PendingReportsTable]` Bulk reject modal backdrop closes the dialog only when `e.target === e.currentTarget && !bulkPending`; mounts `ReportReceiptsDrawer` controlled by `receiptsReportId`.
- `[PendingReportsTable.tsx:ReportAccordionDetail]` `handleRejectSubmit` requires non-empty `rejectReason.trim()`; reject submit button is disabled when `actionPending || !rejectReason.trim()`; approve and reject buttons are disabled when `actionPending`.
- `[RecentActivityStream.tsx:RecentActivityStream]` Returns `null` when `!activities || activities.length === 0`; `getActivityMeta` maps `report_approved`, `report_paid`, `advance_paid`, `report_rejected`, and `report_submitted` (default) to display metadata.
- `[ReimbursementFlowLedger.tsx:ReimbursementFlowLedger]` Renders three pipeline step `<Link>` targets (`/reports?status=draft`, `/reports?status=submitted`, `/reports?status=paid`) plus a header link to `/reports`.
- `[SlideOverReviewDrawer.tsx:SlideOverReviewDrawer]` Returns `null` when `!reportId`; `useQuery` is gated by `enabled: !!reportId`; reject button calls `onReject(comment)` and is disabled when `actionPending || !comment.trim()`; approve button calls `onApprove` and is disabled when `actionPending`.
- `[SpendChart.tsx:SpendChart]` Renders an empty state when `!data || data.length === 0`; sorts a shallow copy ascending by `date.localeCompare` without mutating props; duplicates a single data point to `[sorted[0], sorted[0]]` to render a line; clamps `maxVal >= 1` and `minVal <= 0` so `range >= 1` and Y coordinates remain within `[10, 90]`.

## Side Effects
- `[PendingReportsTable.tsx:ReportAccordionDetail]` Executes HTTP `GET /reports/${reportId}` via React Query `useQuery` with `queryKey: reportKeys.detail(reportId)` and `staleTime: 30_000`.
- `[PendingReportsTable.tsx:PendingReportsTable]` Registers and clears a 500ms `setTimeout`/`clearTimeout` via `longPressTimer` ref on pointer events (`onPointerDown`, `onPointerUp`, `onPointerLeave`, `onPointerCancel`).
- `[SlideOverReviewDrawer.tsx:SlideOverReviewDrawer]` Executes HTTP `GET /reports/${reportId}` via React Query `useQuery` with `queryKey: reportKeys.detail(reportId!)` when `reportId` is truthy.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
