# Approvals Route (`frontend/app/approvals`)

## Overview
Next.js App Router client route (`/approvals`) providing the manager/finance review queue for approving or rejecting submitted expense reports and previewing attached receipts in a drawer.

## Interface
- `[page.tsx:ApprovalsPage]` — Default-exported client route component rendering pending review items, inline/modal rejection controls, and `ReportReceiptsDrawer` inside `AppShell`.

## Invariants
- Role guard: `canManage` restricts access and queue fetching (`enabled: canManage`) to `user?.role === "manager" || user?.role === "chef_finance"`; when `!loading && (!user || !canManage)`, renders `access_denied` `[page.tsx:canManage, page.tsx:ApprovalsPage, page.tsx:useQuery]`.
- Action guards: reject confirmation is disabled while `actions.reject.isPending` or `!rejectReason.trim()`; approve button is disabled while `actions.approve.isPending || actions.reject.isPending` `[page.tsx:actions.reject, page.tsx:actions.approve]`.

## Side Effects
- Queries review queue via `getReviewQueue` (`reviewQueueKeys.list()`) when `canManage` is `true` `[page.tsx:getReviewQueue]`.
- Triggers `actions.approve.mutate(report.id)` and `actions.reject.mutate({ id: report.id, reason: rejectReason })` via `useReviewQueueActions`, emitting `toast.success` / `toast.error` callbacks `[page.tsx:useReviewQueueActions, page.tsx:toast]`.
- Renders `<Link>` navigation to `/profile/${report.user_id}` and `/reports/${report.id}` `[page.tsx:ApprovalsPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
