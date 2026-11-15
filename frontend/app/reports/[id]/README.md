# Report Detail Route (`frontend/app/reports/[id]`)

## Overview
Next.js App Router dynamic server-prefetched route (`/reports/[id]`) rendering complete expense report details, delegation email metadata, attached expenses, mileage/advance summaries, preflight submission audit drawer, approval/rejection/signing/recall/payout workflow actions, and PDF/CSV/XLSX/ZIP exports.

## Interface
- `[page.tsx:dynamic]` — Route segment config exported as `"force-dynamic"`.
- `[page.tsx:ReportDetailPage]` — Default-exported async Server Component accepting `{ params: Promise<{ id: string }> }` and prefetching `Report` into `HydrationBoundary`.
- `[ReportDetailClient.tsx:ReportDetailClient]` — Default-exported client component rendering the report workspace inside `AppShell`.
- `[ReportDetailClient.tsx:DelegationReportDetails]` — Internal helper component rendering delegation job metadata from `Report`.
- `[ReportDetailClient.tsx:PreflightSubmissionDrawer]` — Internal pre-submission modal/drawer auditing receipt presence prior to report submission.
- Subdirectories:
  - `./advances`: [./advances/README.md](./advances/README.md) — Report advance requests, payments, and rejections (`/reports/[id]/advances`).
  - `./edit`: [./edit/README.md](./edit/README.md) — Draft report metadata and delegation editor (`/reports/[id]/edit`).
  - `./mileage`: [./mileage/README.md](./mileage/README.md) — Report mileage trips and reimbursement calculations (`/reports/[id]/mileage`).

## Invariants
- Draft-only editing & attachment: draft expenses query (`enabled: report?.status === "draft"`), edit link, attach-expenses panel (`availableDrafts` filters `!e.report_id`), and per-expense duplicate/edit/delete actions render only when `report.status === "draft"`; attach button is disabled when `attach.isPending || selectedIds.size === 0` `[ReportDetailClient.tsx:draftExpenses, ReportDetailClient.tsx:ReportDetailClient]`.
- Submission & preflight rules: submit banner and `PreflightSubmissionDrawer` require `report.status === "draft" && report.expenses.length > 0`; `PreflightSubmissionDrawer` warns on missing receipts (`(e.receipts?.length || 0) === 0`) without blocking submission unless `isSubmitting` is true `[ReportDetailClient.tsx:ReportDetailClient, ReportDetailClient.tsx:PreflightSubmissionDrawer]`.
- Workflow & role guards: `canApproveOrReject` requires `(user?.role === "manager" || user?.role === "chef_finance") && report.user_id !== user?.id` and `report.status === "submitted"`; sign requires `!report.signed_at && user && report.user_id === user.id` (linking to `/profile/signature` if `!user.has_signature`); recall requires `report.user_id === user?.id` and status `"rejected"` or `"submitted"`; mark-as-paid requires `report.status === "approved"` and `user?.role === "chef_finance"` `[ReportDetailClient.tsx:canApproveOrReject, ReportDetailClient.tsx:ReportDetailClient]`.
- Totals, delegation & export rules: `displayTotal` sums `e.amount_eur` with fallback to `report.total_amount`; `DelegationReportDetails` returns `null` if all 10 delegation fields are falsy; `handleExportExpenses` accepts `"csv" | "xlsx"` and disables export dropdown while `exporting` is `true` `[ReportDetailClient.tsx:displayTotal, ReportDetailClient.tsx:DelegationReportDetails, ReportDetailClient.tsx:handleExportExpenses]`.

## Side Effects
- Server & client reads: `serverFetch<Report>(`/reports/${id}`)` (logging errors via `console.error`), `GET /reports/${id}`, and `GET /expenses?status=draft` `[page.tsx:ReportDetailPage, ReportDetailClient.tsx:ReportDetailClient]`.
- Workflow mutations: `POST /reports/${id}/attach`, `submit`, `pay`, `recall`, `sign`, `approve`, `reject`, `DELETE /expenses/${expenseId}` (gated by `window.confirm`), and `duplicateExpense(expenseId)` (navigating to `/expenses/${newExpense.id}/edit`), invalidating `reportKeys.all` / `expenseKeys.all` / `dashboardKeys.all` `[ReportDetailClient.tsx:ReportDetailClient]`.
- Exports & DOM side effects: `downloadBlob` for PDF (`/reports/${id}/export`), CSV/XLSX (`/reports/${id}/export-csv`), receipts ZIP (`/reports/${id}/receipts-zip`), and individual receipts (`/expenses/${e.id}/receipts/${r.id}`), plus `useBodyScrollLock(isOpen)` and Escape `keydown` listener in `PreflightSubmissionDrawer` `[ReportDetailClient.tsx:handleExportExpenses, ReportDetailClient.tsx:ReportDetailClient, ReportDetailClient.tsx:PreflightSubmissionDrawer]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
