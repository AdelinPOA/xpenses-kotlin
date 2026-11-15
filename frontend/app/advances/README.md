# Advances Route (`frontend/app/advances`)

## Overview
Next.js App Router client route (`/advances`) presenting the global pending advance requests queue for privileged reviewers (`manager`, `chef_finance`, `mod`) to pay or reject advances.

## Interface
- `[page.tsx:GlobalAdvancesPage]` — Default-exported client route component rendering the pending advances queue and inline payment confirmation form inside `AppShell`.

## Invariants
- Role & auth guard: `isAllowed` restricts access to `user?.role` in `["manager", "chef_finance", "mod"]`; renders spinner while `loading`, redirects to `/dashboard` when unauthorized, and returns `null` when `!user || !isAllowed` `[page.tsx:isAllowed, page.tsx:GlobalAdvancesPage]`.
- Payment validation: `handlePay` requires truthy `payingId` and `payReportId`, finite `parseFloat(payAmount) > 0`, and truthy `payDate`; confirm button is disabled when `payAdvance.isPending || !payAmount || !payDate`; reject button is disabled while `rejectAdvance.isPending` `[page.tsx:handlePay, page.tsx:GlobalAdvancesPage]`.
- Currency & amount defaults: currency state defaults to `"EUR"` and pending item amount/currency display falls back to `a.requested_amount || 0` and `a.requested_currency || "EUR"` `[page.tsx:GlobalAdvancesPage]`.

## Side Effects
- Queries `GET /advances/pending` (`advanceKeys.pending()`) `[page.tsx:pending]`.
- Mutations: `POST /reports/${reportId}/advances/${advanceId}/pay` (`payAdvance`) and `POST /reports/${reportId}/advances/${advanceId}/reject` (`rejectAdvance`), each invalidating `advanceKeys.all` and `reportKeys.all` and updating `actionError` on failure `[page.tsx:payAdvance, page.tsx:rejectAdvance]`.
- Navigates via `router.replace("/dashboard")` for unauthorized users and `<Link href="/reports/${a.report_id}/advances">` `[page.tsx:useEffect, page.tsx:GlobalAdvancesPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
