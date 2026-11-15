# New Report Route (`frontend/app/reports/new`)

## Overview
Next.js App Router client route (`/reports/new`) for creating a new expense report, optionally pre-selecting draft expenses passed via URL query parameters and protecting submission with an idempotency key.

## Interface
- `[page.tsx:NewReportPage]` — Default-exported client route component wrapping `NewReportContent` in a `<Suspense>` boundary with a loading spinner fallback.
- `[page.tsx:NewReportContent]` — Internal form component rendering report metadata inputs, currency selector, and draft expense selection inside `AppShell`.

## Invariants
- Query parameter parsing: `expense_ids` search param is split by comma and parsed with `parseInt(..., 10)`, keeping only positive integers (`!isNaN(x) && x > 0`) `[page.tsx:initialIdsParam]`.
- Validation & dirty rules: `isDirty` is true when `title.trim()`, `description.trim()`, `dateFrom`, `dateTo`, or `selectedIds.size > 0` is truthy; `handleSubmit` requires non-empty `title.trim()`, both `dateFrom` and `dateTo`, and `dateTo >= dateFrom`; submit is disabled while `create.isPending` `[page.tsx:isDirty, page.tsx:handleSubmit, page.tsx:NewReportContent]`.
- Currency & payload shaping: `currency` defaults to `"EUR"` within `CURRENCIES`; empty `description`/`dateFrom`/`dateTo` serialize as `null`, and `expense_ids` is omitted (`undefined`) when `selectedIds.size === 0` `[page.tsx:currency, page.tsx:create]`.
- Idempotency key lifecycle: `submitKeyRef.current` is reused across retries and reset to `null` whenever `[title, description, dateFrom, dateTo, currency, selectedIds]` changes `[page.tsx:create]`.

## Side Effects
- Queries draft expenses via `GET /expenses` (`params: { status: "draft" }`, key `expenseKeys.list({ status: "draft" })`) and pre-populates empty `dateFrom`, `dateTo`, and `title` when `selectedIds.size > 0` `[page.tsx:draftExpenses, page.tsx:NewReportContent]`.
- Sends `POST /reports` with `Idempotency-Key` header (`create`); on success clears dirty state, invalidates `reportKeys.all`, `expenseKeys.all`, and `dashboardKeys.all`, and navigates to `/reports/${report.id}` `[page.tsx:create]`.
- Registers unsaved-changes guard via `useFormGuard` and handles cancel via `router.back()` `[page.tsx:useFormGuard, page.tsx:NewReportContent]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
