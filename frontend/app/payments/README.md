# Payments Route (`frontend/app/payments`)

## Overview
Next.js App Router client route (`/payments`) providing the approved-reports payout queue for `chef_finance` users to mark reports as paid.

## Interface
- `[page.tsx:PaymentsPage]` — Default-exported client route component rendering approved reports pending payment and per-report pay actions inside `AppShell`.

## Invariants
- Auth & role guard: shows spinner while `loading` is `true`, enables `useQuery` only when `user?.role === "chef_finance"`, and renders `access_denied` when `!loading && (!user || user.role !== "chef_finance")` `[page.tsx:PaymentsPage]`.
- Queue filter & action lock: fetches `Report[]` strictly with `{ status: "approved", all: true }`; disables all "mark paid" buttons while `payMutation.isPending` is `true` `[page.tsx:PaymentsPage]`.
- Conditional metadata rendering: submitter link requires `report.user_display_name`, date range requires `report.date_from && report.date_to`, approval date requires `report.approved_at`, and expense count singular/plural key checks `report.expenses.length === 1` `[page.tsx:PaymentsPage]`.

## Side Effects
- Queries `GET /reports` with `{ status: "approved", all: true }` (`reportKeys.list({ status: "approved", all: true })`) `[page.tsx:PaymentsPage]`.
- Mutates via `POST /reports/${id}/pay` (`payMutation`), invalidating `reportKeys.all` and clearing `mutationError` on success or populating `mutationError` on failure `[page.tsx:PaymentsPage]`.
- Navigates to `/profile/${report.user_id}` via `<Link>` `[page.tsx:PaymentsPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
