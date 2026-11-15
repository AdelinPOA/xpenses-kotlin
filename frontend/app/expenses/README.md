# Expenses Routes (`frontend/app/expenses`)

## Overview
Next.js App Router dynamic server-prefetched route (`/expenses`) listing and filtering expenses with URL-synced search/status/category/pagination state, drag-and-drop bulk receipt upload (`BulkReviewDrawer`), offline queue panel, batch report creation, CSV/XLSX export, two-step inline deletion, duplication, and receipt lightbox/download support, plus child routes for creation, capture, detail, and editing.

## Interface
- `[page.tsx:dynamic]` — Route segment config exported as `"force-dynamic"`.
- `[page.tsx:ExpensesPage]` — Default-exported async Server Component prefetching `/expenses` and `/categories` into `HydrationBoundary` for `ExpensesClient`.
- `[ExpensesClient.tsx:ExpensesClient]` — Default-exported client component wrapping `ExpensesPageContent` in `<Suspense>`.
- `[ExpensesClient.tsx:ExpensesPageContent]` — Internal client component rendering filters, mobile cards, desktop table, pagination, bulk upload drawer, offline queue toggle, export menu, batch toolbar, and `ReceiptLightbox`.
- `[ExpensesClient.tsx:BulkReviewDrawer]` — Dynamically imported (`next/dynamic`) bulk upload review drawer.
- `[ExpensesClient.tsx:STATUS_PILLS]` — Readonly status filter tuple `["", "draft", "submitted", "approved", "rejected", "paid"]`.
- `[ExpensesClient.tsx:PAGE_SIZE]` — Pagination page size constant (`20`).
- `[ExpensesClient.tsx:ExportRange]` / `[ExpensesClient.tsx:exportRangeToParams]` — Export range union type (`"this_month" | "last_month" | "this_year" | "all"`) and `YYYY-MM-DD` date-bound helper.
- Subdirectories:
  - `./[id]`: [./[id]/README.md](./[id]/README.md) — Expense detail view and `./edit` subroute (`/expenses/[id]`).
  - `./capture`: [./capture/README.md](./capture/README.md) — Camera/file receipt capture and OCR queue recovery (`/expenses/capture`).
  - `./new`: [./new/README.md](./new/README.md) — Capture-vs-manual creation chooser and manual expense form (`/expenses/new`).

## Invariants
- URL state & pagination: `status`, `category_id`, `q`, `page`, and `highlight` URL params are the source of truth; `page` and `highlightId` clamp to `>= 0`; filter/search updates delete `page` (`resetPage=true`), `searchText` debounces `400ms`, and `filtersOpen` auto-opens when `statusFilter` or `categoryFilter` is set `[ExpensesClient.tsx:ExpensesPageContent, ExpensesClient.tsx:updateParams]`.
- Highlight & empty-state probing: highlight detail query runs only when `highlightId > 0 && !isLoading` and missing from `pageExpenses`; confirmation banner requires `verification_state === "VERIFIED"`; `shouldProbeAnyData` probes `size=1` only when filtered list is empty with active filters `[ExpensesClient.tsx:ExpensesPageContent, ExpensesClient.tsx:shouldProbeAnyData]`.
- Draft-only & selection guards: selection checkboxes, edit links, and delete buttons render only when `e.status === "draft"`; floating batch-report bar renders when `selectedExpenseIds.size > 0`; `tapDelete` uses a two-step `3000ms` inline confirmation (disabled while `del.isPending`) `[ExpensesClient.tsx:ExpensesPageContent, ExpensesClient.tsx:tapDelete]`.
- Receipt, navigation & drag guards: `/\.(jpg|jpeg|png|webp)$/i` opens `ReceiptLightbox` while other files trigger `downloadBlob`; "Add expense" link honors `allowNavigation()`; mobile card clicks route to `/expenses/${e.id}/edit` if draft else `/expenses/${e.id}`; `dragCounterRef` tracks nested dragenter/dragleave `[ExpensesClient.tsx:ExpensesPageContent, ExpensesClient.tsx:handleDragEnter]`.

## Side Effects
- Server prefetch & client queries: `serverFetch` for `/expenses` and `/categories` (logging catch errors via `console.error`), plus client `GET /expenses`, `GET /expenses/${highlightId}`, `GET /expenses?page=0&size=1`, and `GET /categories` `[page.tsx:ExpensesPage, ExpensesClient.tsx:ExpensesPageContent]`.
- Mutations & exports: `DELETE /expenses/${expense.id}` (`del`), `duplicateExpense(id)` (`duplicate`), and `downloadBlob` for `/expenses/export` (CSV/XLSX) and receipt downloads, invalidating `expenseKeys.all` and `dashboardKeys.all` and showing toast notifications `[ExpensesClient.tsx:del, ExpensesClient.tsx:duplicate, ExpensesClient.tsx:handleExport]`.
- Navigation, timers & overlays: `router.replace`, `router.push` (`/expenses/${e.id}`, `/expenses/${e.id}/edit`, `/reports/new?expense_ids=...`), `400ms`/`3000ms` timers cleaned on unmount, and overlays (`BulkReviewDrawer`, `OfflineQueuePanel`, `ReceiptLightbox`) `[ExpensesClient.tsx:ExpensesPageContent]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
