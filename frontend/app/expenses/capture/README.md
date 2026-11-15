# Capture Expense Route (`frontend/app/expenses/capture`)

## Overview
Next.js App Router client route (`/expenses/capture`) managing mobile/desktop receipt camera capture and file upload, local IndexedDB OCR source queueing, background claim/upload recovery, and manual OCR job completion or retry.

## Interface
- `[page.tsx:CapturePage]` — Default-exported client route component reading `reportId` search param and rendering `CaptureSession` or `CaptureDisabled`.
- `[page.tsx:CAPTURE_REVIEW_ENABLED]` — Build-time flag `process.env.NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED === "true"`.
- `[page.tsx:CaptureDisabled]` — Internal fallback component linking to `/expenses/new?mode=manual` when immediate capture review is disabled.
- `[page.tsx:CaptureSession]` — Internal stateful capture/recovery session component keyed by `${user?.id ?? "signed-out"}:${reportId ?? "no-report"}`.
- `[page.tsx:ManualValues]` — Internal interface `{ amount, currency, date, merchant, description }` with helpers `emptyManualValues`, `fileFromSource`, `localManualValues`, `toStoredManualValues`, and `makeManualRequest`.

## Invariants
- Feature flag & `reportId` guard: immediate capture/review UI requires `CAPTURE_REVIEW_ENABLED === true`; `reportId` is accepted only when `Number.isSafeInteger(rawReportId) && rawReportId > 0` `[page.tsx:CAPTURE_REVIEW_ENABLED, page.tsx:CapturePage]`.
- Capture & file constraints: camera input uses `accept="image/*" capture="environment"` and file input uses `accept=".jpg,.jpeg,.png,.pdf,.webp"`; `handleFile` rejects new files if `!user?.id`, if any queued source already has `expenseId`, or if any queued source lacks `expenseId`; capture buttons are disabled while `processing || Boolean(pendingSource)` `[page.tsx:CaptureSession, page.tsx:handleFile]`.
- Processing & claim invariants: `processSource` requires `user?.id`, `navigator.onLine`, non-presence in `inFlightRef`, and a valid `claimOcrSource`; fetched expense must satisfy `verification_state === "PENDING"` and non-negative safe integer `version`; `reportLinkStatus` is `"LINKED"` on matched `report_id`, `"CONFLICT"` on mismatch, else `"NOT_REQUESTED"`; claim is renewed every `10,000ms` and aborts on renewal failure `[page.tsx:processSource]`.
- Recovery & cleanup rules: `refreshRecovery` keeps server jobs when `expense?.verification_state === "PENDING"`, status is in `["PENDING", "PROCESSING", "RETRY_WAIT"]`, or `allowed_actions` includes `"retry"` or `"complete_manually"`; local sources are removed only when `!unsynced && !source.reviewOperation` and the expense is already `"VERIFIED"`/`"NOT_REQUIRED"` or obsolete `[page.tsx:refreshRecovery]`.
- Manual completion & retry idempotency: `makeManualRequest` requires finite `amount > 0` and truthy `date`; `submitManualCompletion` skips manual validation when `manualJob.expense_id` exists, reuses `jobActionOperation.key` when action/body match, locks inputs during `manualSaving || manualSource?.reviewSyncState === "uncertain"`, and marks state `"uncertain"` on ambiguous errors (`status === undefined || status >= 500`); `runRetry` reuses `jobActionOperation.key` when previous action was `"retry"` `[page.tsx:makeManualRequest, page.tsx:submitManualCompletion, page.tsx:runRetry]`.

## Side Effects
- Opens native camera/file pickers, reads `File.arrayBuffer()`, generates UUIDs via `crypto.randomUUID()`, triggers `triggerHaptic(15)`, and enqueues/mutates local OCR sources (`enqueueOcrSource`, `claimOcrSource`, `renewOcrSource`, `markOcrSourceUpload`, `acknowledgeOcrSource`, `persistOcrReviewState`, `releaseOcrSource`, `createRecoveredOcrReview`, `removeOcrSource`, `discardUnacceptedOcrSource`) `[page.tsx:handleFile, page.tsx:processSource, page.tsx:refreshRecovery, page.tsx:discardLocalSource]`.
- Executes `captureReceipt`, `GET /expenses/${expenseId}`, `listRecoverableOcrJobs`, `completeOcrJobManually`, and `retryOcrJob`; invalidates `expenseKeys.all` and `dashboardKeys.all`; navigates to `/expenses/${expense.id}/edit?ocr_source_id=...` `[page.tsx:processSource, page.tsx:refreshRecovery, page.tsx:submitManualCompletion, page.tsx:runRetry]`.
- Registers `window` `"online"`, `document` `"visibilitychange"`, `20,000ms` recovery polling interval, `10,000ms` claim renewal interval, `200ms` debounced persistence timer, `window.confirm` on local discard, and aborts all `AbortController`s on unmount `[page.tsx:CaptureSession, page.tsx:processSource, page.tsx:discardLocalSource]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
