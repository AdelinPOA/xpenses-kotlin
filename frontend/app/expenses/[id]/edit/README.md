# Edit Expense Route (`frontend/app/expenses/[id]/edit`)

## Overview
Next.js App Router client route (`/expenses/[id]/edit`) for editing an existing expense or completing immediate OCR receipt verification when returning from receipt capture.

## Interface
- `[page.tsx:EditExpensePage]` — Default-exported client component accepting `{ params: Promise<{ id: string }> }` and reading `upload_failed`, `ocr_source_id`, and `return_report_id` search parameters.
- `[page.tsx:NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED]` — Build-time environment flag checked against `"true"` to gate immediate OCR review UI.
- `[page.tsx:ExpenseForm]` — Dynamically imported form component rendered with `{ expense, highlightReceipts, returnToReportId }`.
- `[page.tsx:ImmediateExpenseReview]` — Dynamically imported immediate OCR review component rendered with `{ expense, sourceId, recoveringConfirmedOperation, onSourceUnavailableAction, onReloadAction }`.

## Invariants
- Return report validation: `requestedReportId` is accepted only when `return_report_id` matches `/^\d+$/`, `Number.isSafeInteger(parsedReportId)`, and `parsedReportId > 0`; `returnToReportId` is passed to `ExpenseForm` only if `expense?.report_id === requestedReportId` `[page.tsx:requestedReportId, page.tsx:returnToReportId]`.
- OCR source lookup gating: `useEffect` runs only when `ocrSourceId`, `expense`, and `user?.id` exist and either `initialReviewPending` (`verification_state === "PENDING" && !last_verified_at`) or `serverAlreadyVerified` (`verification_state === "VERIFIED" && Boolean(last_verified_at)`) is true `[page.tsx:useEffect]`.
- OCR source & remote job matching: local source matches only when `item.id === ocrSourceId`, `item.expenseId === expense.id`, `item.remoteJobId` is a positive safe integer, `Boolean(expense.receipts?.length)`, and `!(serverAlreadyVerified && !Boolean(source?.reviewOperation?.body.confirm))`; remote job matches only when `Number(job.expense_id) === expense.id` and uppercase status is in `["COMPLETED", "PENDING", "PROCESSING", "RETRY_WAIT", "PAUSED"]` `[page.tsx:useEffect]`.
- Immediate review rendering: `waitingForOcrSource` displays a skeleton while `ocrSourceCheckPending` is true; `ImmediateExpenseReview` renders only when `NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED === "true"`, `expense` is loaded, `(ocrReviewOutstanding || recoveringConfirmedOperation)` is true, `matchingOcrSource` is found, and `!ocrSourceUnavailable` `[page.tsx:waitingForOcrSource, page.tsx:showImmediateReview]`.

## Side Effects
- Fetches expense details via `GET /expenses/${id}` (`expenseKeys.detail(parseInt(id))`) and refetches on retry/reload callbacks `[page.tsx:useQuery]`.
- Reads local IndexedDB OCR source queue via `listOcrSources(user.id)` `[page.tsx:useEffect]`.
- Fetches remote OCR job status via `GET /ocr/status/${source.remoteJobId}` when a matching local OCR source exists `[page.tsx:useEffect]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
