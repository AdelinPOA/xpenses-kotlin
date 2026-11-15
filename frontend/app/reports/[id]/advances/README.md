# Report Advances Route (`frontend/app/reports/[id]/advances`)

## Overview
Next.js App Router client route (`/reports/[id]/advances`) managing advance requests, paid advances, payment fulfillment, rejection, and deletion for a specific expense report.

## Interface
- `[page.tsx:AdvancesPage]` — Default-exported client route component accepting `{ params: Promise<{ id: string }> }` and rendering advance summaries, creation forms, and per-advance actions inside `AppShell`.

## Invariants
- Permission flags: `isOwner` requires `user?.id === report.user_id`; `isPrivileged` requires `user.role` in `["manager", "chef_finance", "mod"]`; `canManage` requires `user.role` in `["manager", "chef_finance"]` `[page.tsx:isOwner, page.tsx:isPrivileged, page.tsx:canManage]`.
- Creation visibility: action buttons render only when `isOwner || isPrivileged`; self-paid (`formType="paid"`) requires `isOwner && report.status === "draft"`; request (`formType="request"`) requires `isOwner`; manager/finance-paid requires `isPrivileged && !isOwner` `[page.tsx:AdvancesPage]`.
- Form validation: `handleAdd` requires `parseFloat(amount) > 0` and non-empty `date` when `formType === "paid"`; `handlePay` requires `parseFloat(payAmount) > 0` and non-empty `payDate` `[page.tsx:handleAdd, page.tsx:handlePay]`.
- Row action & ordering rules: pay/reject actions render only when `a.status === "requested" && canManage && payingId !== a.id`; delete renders only for `(requested && isOwner)`, `(paid && draft && (isOwner || isPrivileged))`, or `(rejected && isOwner)`; advances are ordered `[...requestedAdvances, ...paidAdvances, ...rejectedAdvances]` `[page.tsx:AdvancesPage]`.

## Side Effects
- Queries `GET /reports/${id}` (`reportKeys.detail(reportId)`) `[page.tsx:AdvancesPage]`.
- Mutations: `POST /reports/${id}/advances` (`addAdvance`), `DELETE /reports/${id}/advances/${advanceId}` (`deleteAdvance`, gated by `window.confirm`), `POST /reports/${id}/advances/${advanceId}/pay` (`payAdvance`), and `POST /reports/${id}/advances/${advanceId}/reject` (`rejectAdvance`), each invalidating `reportKeys.detail(reportId)` and `advanceKeys.all` `[page.tsx:addAdvance, page.tsx:confirmDeleteAdvance, page.tsx:payAdvance, page.tsx:rejectAdvance, page.tsx:invalidate]`.
- Renders `<Link href="/reports/${id}">` back navigation `[page.tsx:AdvancesPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
