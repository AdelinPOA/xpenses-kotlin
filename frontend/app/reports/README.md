# Reports Routes (`frontend/app/reports`)

## Overview
Next.js App Router dynamic server-prefetched route (`/reports`) listing expense reports with role-scoped all-reports toggling, status/owner/debounced search filtering, column sorting, CSV/XLSX export, quick submission, delete confirmation (keep or delete expenses), and structured order text/HTML import with preview review, alongside child routes for report creation and per-report detail/editing/mileage/advances.

## Interface
- `[page.tsx:dynamic]` — Route segment config exported as `"force-dynamic"`.
- `[page.tsx:ReportsPage]` — Default-exported async Server Component prefetching `/reports` into `HydrationBoundary` for `ReportsClient`.
- `[ReportsClient.tsx:ReportsClient]` — Default-exported client component wrapping `ReportsPageContent` in `<Suspense>`.
- `[ReportsClient.tsx:ReportsPageContent]` — Internal client component implementing report listing, filtering, sorting, export, delete, quick-submit, and order import modal.
- `[ReportsClient.tsx:SortKey]` / `[ReportsClient.tsx:SortDir]` — Internal sort types (`"title" | "total" | "submitted_at"`, `"asc" | "desc"`).
- `[ReportsClient.tsx:extractAxiosErrorMessage]` / `[ReportsClient.tsx:htmlClipboardToText]` — Internal error extraction and HTML clipboard table-to-pipe-text conversion helpers.
- Subdirectories:
  - `./[id]`: [./[id]/README.md](./[id]/README.md) — Server-prefetched report detail workspace and `./advances`, `./edit`, `./mileage` subroutes (`/reports/[id]`).
  - `./new`: [./new/README.md](./new/README.md) — New expense report creation form with draft expense pre-selection (`/reports/new`).

## Invariants
- Role & scope rules: `isPrivileged` (`chef_finance`, `mod`, `manager`) gates `showAll` toggle; managers default `showAll` to `true`; owner filter chips render only when `showAll && uniqueOwners.length > 1`; status filter is `["", "draft", "submitted", "approved", "rejected", "paid"]` `[ReportsClient.tsx:ReportsPageContent]`.
- Draft ownership & action locks: quick-submit and delete actions render only when `r.status === "draft" && r.user_id === user?.id`; export, quick-submit, and delete buttons are disabled during pending operations `[ReportsClient.tsx:ReportsPageContent]`.
- Order import modal guards: `isImportBusy` blocks dismissal and disables inputs; raw import/preview require non-empty `importText.trim()`; reviewed create requires non-empty `reviewDraft.title.trim()`; duplicate order banner renders when `reviewDraft.existing_draft_report_id != null`; paste interception converts `text/html` containing `<table` via `htmlClipboardToText` `[ReportsClient.tsx:ReportsPageContent, ReportsClient.tsx:htmlClipboardToText]`.
- Filtering, sorting & error display: searches `title` or `user_display_name` with `300ms` debounce; computes total from `expenses[].amount_eur` falling back to `total_amount`; defaults sort to `submitted_at desc`; suppresses `EmptyState` when `isError` is true `[ReportsClient.tsx:ReportsPageContent]`.

## Side Effects
- Server & client queries: `serverFetch("/reports")` (unwrapping paged responses and logging errors via `console.error`), `GET /reports`, and `searchParams.get("status")` sync `[page.tsx:ReportsPage, ReportsClient.tsx:ReportsPageContent]`.
- Mutations & exports: `DELETE /reports/${id}` (`del` with `delete_expenses`), `POST /reports/${id}/submit` (`quickSubmit`), `importOrder`, `previewImportOrder`, `createReport`, and `downloadBlob("/reports/export", ...)` (`handleExport`), invalidating `reportKeys.all` and `dashboardKeys.all` and showing toast notifications `[ReportsClient.tsx:ReportsPageContent, ReportsClient.tsx:handleExport]`.
- Navigation & DOM side effects: navigates to `/reports/new`, `/reports/${id}`, and `/reports/${reviewDraft.existing_draft_report_id}`; manages `useBodyScrollLock`, window Escape `keydown` listener, `300ms` debounce timer, and `DOMParser` HTML clipboard parsing `[ReportsClient.tsx:ReportsPageContent, ReportsClient.tsx:htmlClipboardToText]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
