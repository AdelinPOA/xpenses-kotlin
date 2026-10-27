# Existing Expense Editing and OCR Review

* **Author:** User and assistant
* **Status:** Proposed
* **Date:** 2026-10-26

## Overview

Review the OCR-created expense once after OCR. Later edits to any existing expense save without reopening OCR review or resetting its verification state. When an edit starts from a report, Save returns to that same report with the updated values. New-expense creation stays unchanged.

## The Problem

Observed route: Reports → open a report → choose Edit on an expense → change fields → Save. The edit link does not carry the report ID, so the ordinary edit form returns to `/expenses`; when the expense is pending, the edit page can instead open the OCR review screen. Neither result matches the requested flow.

For every existing expense, Save should store the edit without another OCR review or confirmation. When the edit starts from a report, return to that same report and show the updated expense. Keep the first OCR review in the OCR capture flow.

## Goals

* Show the OCR review screen for a newly created expense that came from OCR, as part of its initial review.
* Do not show that OCR review screen again when editing and saving any existing expense, whether it is attached to a report or not.
* Treat verification as the owner's initial review after OCR, not as a continuing check of later-edited values. Later edits must not reopen review or change an existing state from `VERIFIED` to `PENDING`.
* Acceptance check: after a successful edit from a report, the user is back on that report and sees the saved values; no OCR review is shown for an existing expense. A new OCR-created expense still receives its initial review.
* When editing an expense from a report, save successfully and return to that same report with the updated values visible.
* Preserve the current add-new-expense flow and existing save/error handling where it does not conflict with these goals.

## Non-Goals

* Redesigning OCR or the initial review of a newly created OCR expense.
* Changing which report an expense belongs to as a side effect of editing or returning to a report.
* Changing the creation flow for new expenses.
* Adding a second confirmation step or a replacement review screen after editing.

## Technical Plan (Architecture)

Keep first-time OCR review separate from ordinary editing. Show `ImmediateExpenseReview` only when an authenticated, accepted OCR source/job is linked to the fetched expense, the expense is `PENDING`, and `last_verified_at` is null. The source/job must still represent an uncompleted initial review; a query parameter alone is not proof. Successful initial confirmation sets `VERIFIED` and closes this path. A stale, invalid, mismatched, completed, or unavailable source must not reopen review; show the ordinary edit form instead. `PENDING` alone must not trigger the screen. Manual and non-OCR expenses do not acquire an OCR review requirement. For legacy `PENDING` expenses with `last_verified_at` set, use the ordinary edit form.

Verification is a one-time record that the owner completed the initial OCR review. It does not claim that later-edited fields or receipts were checked again. Preserve a verified existing expense's state and verification metadata after ordinary field edits and receipt additions/deletions. Keep newly promoted OCR expenses pending until their initial review is confirmed. Restrict the explicit `reviewExpense` operation to expenses awaiting that first OCR review; reject a second confirmation for an already verified expense. Keep OCR promotion pending for a newly created expense, but do not reset verification when OCR idempotently encounters an existing expense. Preserve manual and bulk expenses as `NOT_REQUIRED`.

Revise both the canonical glossary and `docs/contracts/expense-verification-and-immediate-review.md` to define `VERIFIED` as completion of the initial OCR review, not a continuing statement about current values. Audit consumers of `verification_state`, including capture routing, expense-list indicators, and API filters; they must not imply that post-review edits were checked against a receipt. This is a product contract change, not only a navigation change. Use the existing status and verification metadata; do not add a database field or endpoint for this policy.

For edits opened from a report, pass a distinct `return_report_id`. Validate it against the fetched expense's current `report_id`; do not send it as an attachment request. If absent, malformed, or mismatched, retain the existing `/expenses` destination. After all intended expense and receipt operations succeed, fetch fresh report detail data, update the report query cache, and then return to that report. If the refresh fails after the save succeeded, return to the report with its existing loading/error/retry UI rather than claiming fresh values are visible. If a mutation fails, remain in the form and explain which changes were saved. Successfully completed receipt additions/deletions are removed from pending form work; retain only unfinished operations for retry. If the field update or any receipt operation has persisted, invalidate expense, dashboard, and report detail data.

```text
New OCR result
    -> explicit OCR review
    -> existing expense

Report detail -- Edit --> existing-expense form
                              |
                              +-- Save succeeds --> refresh and return to same report
                              +-- Save fails ----> stay in form with edits and error

Other existing-expense edit --> existing-expense form
                                     |
                                     +-- Save succeeds --> current non-report destination
```

Likely areas involved are the report expense edit links, the existing-expense edit page and form, the OCR source/review components, backend expense and OCR services, and the canonical verification contract. The OCR capture/review route remains available only for an outstanding first review.

## Alternatives Considered

### Keep the review screen for every pending expense

* **Pros**: Retains the current explicit confirmation step for expenses whose values may have changed.
* **Cons**: An existing expense can return to the same review screen used for initial OCR, even when the user only intends to edit and save.
* **Reason for Rejection**: The requested workflow is to review OCR results once, then edit existing expenses without another review screen or confirmation.

### Reuse report attachment data as return-navigation input

* **Pros**: Avoids adding a separate return-context value to the edit route.
* **Cons**: The form already uses report context when creating or attaching expenses. Reusing that meaning for an existing-expense edit can make navigation look like a membership change and risks modifying the wrong relationship.
* **Reason for Rejection**: Return navigation must not attach, detach, or otherwise change which report owns the expense. The originating report should be treated only as a destination.

### Add a new save endpoint or data field

* **Pros**: Could make the edit path behavior explicit at the API boundary.
* **Cons**: Adds API and storage changes for behavior that can use the existing update operation and report context.
* **Reason for Rejection**: The required change is in routing, edit-flow selection, and existing verification-state transitions; no new endpoint or database field is needed.

### Mark edited verified expenses as pending

* **Pros**: Signals that the user's prior confirmation may no longer describe the modified values.
* **Cons**: It conflicts with the agreed rule that verification occurs after initial OCR only and must not force another review after an existing expense is edited.
* **Reason for Rejection**: The chosen rule is that verification records completion of the initial OCR review only. Later field or receipt edits do not revoke it. This changes the domain contract; update the glossary, verification contract, and any consumers so `VERIFIED` is not mistaken for a continuing check that edited values match the receipt.

## Detailed Implementation Plan

### Target Files to Create/Modify

#### 1. `frontend/app/reports/[id]/ReportDetailClient.tsx` (Modify)

* **Type / Scope**: Report detail navigation.
* **Proposed Changes**: Add the current report ID as return-only context to both mobile and desktop expense Edit links. Do not use it to attach or update the expense's report relationship.
* **Rationale**: The current links omit the report context, so the existing expense form cannot return to the report the user opened.

#### 2. `frontend/app/expenses/[id]/edit/page.tsx` (Modify)

* **Type / Scope**: Existing-expense edit route and initial-review eligibility.
* **Proposed Changes**: Read `return_report_id` and use it only if it matches the fetched expense's `report_id`; otherwise use `/expenses`. Render `ExpenseForm` for existing expenses regardless of verification state. Show `ImmediateExpenseReview` only if all of these are true: the expense is `PENDING`; `last_verified_at` is null; an authenticated OCR source/job is associated with this expense; and the source/job's initial confirmation has not been acknowledged. A query parameter alone or `PENDING` alone is not proof. If the source is completed, stale, invalid, mismatched, or unavailable, use the ordinary form. After confirmation, the server's `VERIFIED` state and verification timestamp permanently close initial review.
* **Rationale**: The current route selects `ImmediateExpenseReview` for any pending expense or any supplied source ID, mixing initial OCR review with later editing.

#### 3. `frontend/components/expenses/ExpenseForm.tsx` (Modify)

* **Type / Scope**: Existing-expense save and navigation.
* **Proposed Changes**: Add a distinct return-report value instead of overloading `reportId`, which is used for creating or attaching expenses. Treat the save as complete only after the field update and every intended receipt operation succeeds. On full success, refresh report detail data before returning to the originating report. If a field update or some receipt operations succeed but another fails, stay in the form, explain the partial save, invalidate expense/dashboard/report data, retain only unfinished receipt work, and retry only that work. Preserve `/expenses` as the destination when no valid return report is supplied, and keep new-expense behavior unchanged.
* **Rationale**: This preserves the report the user came from without changing expense membership or new-expense behavior.

#### 4. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt` (Modify)

* **Type / Scope**: Existing-expense update, receipt mutations, and initial verification.
* **Proposed Changes**: Preserve `VERIFIED`, `lastVerifiedAt`, and `lastVerifiedBy` after ordinary field edits, receipt additions, and receipt deletions. Keep newly promoted OCR expenses `PENDING` until their first review. Permit `reviewExpense` only for an OCR expense still awaiting its first confirmation (`PENDING`, no prior verification timestamp, and valid OCR source association); reject repeat confirmation of a verified expense and review requests for `NOT_REQUIRED` manual/bulk expenses. Preserve owner, draft-only edit, authorization, and report lifecycle checks.
* **Rationale**: The current service invalidates verification on ordinary edits and receipt changes, and permits review operations to change the verification record.

#### 5. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt` (Modify)

* **Type / Scope**: OCR expense promotion.
* **Proposed Changes**: Keep first-time OCR promotion of a new expense in `PENDING`. Ensure retry or idempotent promotion does not reset an already existing expense from `VERIFIED` to `PENDING`.
* **Rationale**: OCR must establish the first review requirement for a new expense without reopening verification for an existing one.

#### 6. `frontend/components/expenses/ImmediateExpenseReview.tsx` (Modify)

* **Type / Scope**: Initial OCR review screen and source recovery.
* **Proposed Changes**: Require the source to be associated with the current expense and show the screen only for an outstanding first review. Do not create/recover a review record from a stale, mismatched, completed, or unavailable source. Preserve recovery for a valid unreviewed OCR source.
* **Rationale**: The component currently recovers source records, so a stale link must not turn an ordinary edit into a review flow.

#### 7. `frontend/lib/ocrSourceQueue.ts` (Modify)

* **Type / Scope**: Local OCR source lookup and recovery.
* **Proposed Changes**: Expose enough source state to distinguish a valid initial review from a completed or stale source, and require expense ID and owner association to match. Do not restore completed review state as an active first review. If local data is missing, use the server source/job association; if that cannot prove an outstanding first review, use the ordinary form.
* **Rationale**: Local source recovery must not bypass the edit route's first-review eligibility rule.

#### 8. `frontend/app/expenses/capture/page.tsx` (Modify)

* **Type / Scope**: OCR capture completion and review resumption.
* **Proposed Changes**: Keep the first review immediately after a newly promoted OCR expense and preserve valid recovery for an unconfirmed first review. Do not offer or reopen review for an expense whose initial confirmation is complete or whose source does not match it.
* **Rationale**: The capture page is the entry point for the one permitted OCR review and uses verification state to route pending work.

#### 9. `CONTEXT.md` (Modify)

* **Type / Scope**: Canonical domain glossary.
* **Proposed Changes**: Define Expense verification as a one-time owner review after OCR. State that ordinary edits do not require another verification and do not reset the status.
* **Rationale**: The current glossary defines verification in terms of current values matching the Receipt, which conflicts with the agreed policy.

#### 10. `docs/contracts/expense-verification-and-immediate-review.md` (Modify)

* **Type / Scope**: Canonical verification and immediate-review contract.
* **Proposed Changes**: Align state meanings, transitions, and UI truth with one-time initial OCR review. Preserve initial confirmation for a new OCR expense; state that later edits do not reset verification. Define behavior for manually created and bulk expenses and note that `VERIFIED` does not attest that later-edited values still match the Receipt.
* **Rationale**: The selected contract currently requires current-value confirmation and invalidation after edits, so changing only the glossary would leave a contradictory normative rule.

#### 11. `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/ExpenseControllerTest.kt` (Modify)

* **Type / Scope**: API-level expense verification regression tests.
* **Proposed Changes**: Replace the test that expects a PATCH of reviewable fields to change `VERIFIED` to `PENDING`. Assert instead that edits persist while state, `last_verified_at`, and `last_verified_by_user_id` remain unchanged. Add tests that a valid initial OCR review can confirm once, repeat confirmation is rejected, and `NOT_REQUIRED` manual/bulk expenses cannot enter OCR review. Keep authorization and stale-version coverage.
* **Rationale**: Existing controller tests encode state invalidation and repeatable review behavior this design changes.

#### 12. `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/ExpenseServiceTest.kt` (Modify)

* **Type / Scope**: Expense service unit tests.
* **Proposed Changes**: Update the receipt-upload test to expect a verified expense to remain verified. Add coverage for deleting a receipt from a verified expense and confirm it does not become pending. Keep existing validation, storage, and authorization expectations.
* **Rationale**: Receipt uploads and deletion currently have separate verification-state transitions and need coverage under the new rule.

#### 13. `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/ocr/AsyncOcrTest.kt` (Modify)

* **Type / Scope**: OCR promotion regression tests.
* **Proposed Changes**: Assert a new OCR-promoted expense remains `PENDING` for initial review and idempotent promotion/recovery does not reset an already reviewed expense.
* **Rationale**: The initial OCR state must remain intact while later retries cannot reopen a completed review.

#### 14. `frontend/tests/expenses/edit-existing.spec.ts` (Create)

* **Type / Scope**: Playwright tests of editing existing expenses.
* **Proposed Changes**: Cover attached and unattached expenses, including `PENDING` expenses with and without prior verification metadata and `VERIFIED` expenses. Assert ordinary edits show the expense form. For report-originated edits, test `return_report_id` matching, missing, malformed, and mismatched values; success returns to the same report with fresh values and unchanged expense membership. Test PATCH failure, partial receipt upload/delete failure, and report refresh failure. Verify initial OCR review appears only for a matching, outstanding source and cannot be reopened through completed, stale, invalid, or unavailable source data.
* **Rationale**: The full requirement spans source eligibility, report return, partial save handling, and unchanged OCR-first-review behavior.

#### 15. `frontend/tests/reports/detail.spec.ts` (Modify)

* **Type / Scope**: Report detail browser tests.
* **Proposed Changes**: Assert both mobile and desktop Edit links include the current report as `return_report_id` and preserve the expense ID.
* **Rationale**: Both responsive layouts must preserve the same return destination.

#### 16. `frontend/tests/expenses/capture-review.spec.ts` (Modify)

* **Type / Scope**: Initial OCR review and recovery browser tests.
* **Proposed Changes**: Preserve the first-review-after-OCR case. Add completed, stale, invalid, mismatched, and missing-source cases that must not reopen review for an existing expense; retain recovery for a valid outstanding first review.
* **Rationale**: This suite exercises the OCR review route and its source recovery behavior.

#### 17. `frontend/tests/expenses/capture-feature-gate.spec.ts` (Modify)

* **Type / Scope**: OCR review feature-gate browser tests.
* **Proposed Changes**: Test that a pending existing expense with prior verification metadata uses the ordinary form when the immediate review gate is enabled, while a valid outstanding first OCR review still uses the review screen.
* **Rationale**: The existing test covers only the disabled gate; the changed route selection must also be checked with the gate enabled.

### Verification Plan

* **Frontend checks**: `cd frontend && npm run typecheck && npm run i18n:check`.
* **Targeted browser tests**: Run `edit-existing.spec.ts`, `reports/detail.spec.ts`, `capture-review.spec.ts`, and `capture-feature-gate.spec.ts`. Confirm the initial OCR review appears only for an outstanding source; all existing-expense edits use the ordinary form; report-originated saves return to the same report; and partial save/refresh errors are shown without losing unfinished work.
* **Backend tests**: `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.controllers.ExpenseControllerTest --tests eu.nt.xpenses.services.ExpenseServiceTest --tests eu.nt.xpenses.ocr.AsyncOcrTest --no-daemon`.
* **Contract checks**: Verify `CONTEXT.md` and `docs/contracts/expense-verification-and-immediate-review.md` agree on the one-time meaning of verification and do not describe it as a continuing check of edited values.
* **Manual checks**: From a draft report, edit an attached expense and save; confirm return to the same report and updated values. Edit an unattached existing expense; confirm no OCR review appears and it returns to `/expenses`. Scan a new receipt; confirm the initial OCR review appears only while outstanding. Confirm failed PATCHes stay on the form, partial receipt failures identify saved and unfinished work, and a report refresh failure is recoverable.
