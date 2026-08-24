# WIP — UX Improvement Plan

**Status:** AGREED — reviewed and approved by ox-alpha + agy (consultation round 2)
**Scope:** Frontend UX (`frontend/`) with minimal backend additions where noted.
**Users:** field technicians (mobile-first, poor connectivity, submit receipts) · managers / chef_finance (review desk, approve reports & advances).

## Consensus summary

Findings produced by an independent audit of the codebase, cross-reviewed by a second
reviewer ("agy"). Two reviewers agree on all items below. The two highest-value items
(signature pad bug, manager inline receipt viewer) were surfaced by the second reviewer
and verified in code.

| Priority | Item | Type |
|---|---|---|
| P0 | 1. Signature pad DPR scaling bug | Bug fix |
| P0 | 2. Atomic save + duplicate-expense trap | Bug fix |
| P0 | 3. Unsaved-changes guard on expense form | Bug fix |
| P1 | 4. Offline draft queue | Feature |
| P1 | 5. Receipt-first capture flow | Feature |
| P1 | 6. Expenses list: filter pills, pagination, search, URL sync | Feature/Fix |
| P1 | 7. OCR scan progress + cancel | Fix |
| P1 | 8. Auth redirect context (`?next=`) + show-password | Fix |
| P2 | 9. Delete UX (dialog, onError, toasts, undo) | Polish |
| P2 | 10. Manager approval desk: inline receipts + batch approve | Feature |
| P2 | 11. Real notification indicator | Polish |
| P2 | 12. Export date-range picker | Polish |
| P3 | 13. i18n sweep of untranslated components | Polish |
| P3 | 14. Desktop table aria-labels + empty-state differentiation | A11y/Polish |
| P3 | 15. Online/offline connection banner | Polish |
| Backlog | Category icon/color metadata in DB | Refactor (not UX-blocking) |

---

## Phase 0 — Critical fixes (ship first)

### 0.1 Signature pad DPR scaling bug
**File:** `frontend/components/signature/SignaturePad.tsx`
**Bug (verified):** `resize()` applies `ctx.setTransform(dpr,0,0,dpr,0,0)` — drawing space is
CSS pixels. But `getCoordinates()` multiplies by `canvas.width / rect.width` (= dpr), so
strokes land at `dpr²` scale. On dpr=2/3 phones signatures draw 4–9× off-canvas → report
sign-off is broken on mobile.
**Fix:** return raw CSS-pixel coords from `getCoordinates()`:
```ts
return { x: clientX - rect.left, y: clientY - rect.top };
```
**Also fix while here:** `resize()` wipes the drawing on rotation/resize. To preserve it,
snapshot to an off-screen canvas before resizing and restore with
`ctx.drawImage(offscreen, 0, 0, newCssWidth, newCssHeight)` — note `putImageData` bypasses
the context transform and would distort. Simpler acceptable alternative: accept the wipe but
call `setIsEmpty(true)` (currently stale `isEmpty=false` with a blank canvas).
**From review round 2:** translate the Clear/Save buttons in this same change (see 5.1)
to avoid touching the component twice.
**Acceptance:**
- Stroke follows the finger/cursor exactly on dpr=1, 2, 3 devices.
- Saved PNG contains the full signature at backing-store resolution.
- Rotating the device doesn't produce a "Save"-able but empty image.

### 0.2 Atomic save: no more duplicate orphan expenses
**File:** `frontend/components/expenses/ExpenseForm.tsx` (`save` mutation)
**Bug (verified):** expense is created via `POST /expenses`, then receipts upload. If upload
fails, user sees a generic error, presses Save again → duplicate expense.
**Fix (no backend change required):**
1. Keep create-first order (receipts need an expense id).
2. On receipt-upload failure: do NOT leave the user on the form. Instead:
   - invalidate caches,
   - `toast.warning(t("warning_expense_saved_receipt_failed"))`,
   - `router.push(/expenses/${result.id}/edit?upload_failed=1)`.
   - Edit page reads `upload_failed=1` and highlights the receipt dropzone.
3. **Implementation shape (from review):** don't throw from `mutationFn` on receipt failure —
   TanStack Query would skip `onSuccess`. Instead catch and resolve with
   `{ expense: result, receiptUploadFailed: true }`; `onSuccess` branches on that flag.
4. For edits of existing expenses (`isEdit === true`), stay on the current edit page and show
   warning toast + dropzone highlight rather than redirecting.
3. Add a distinct pending state while receipts upload ("Uploading receipts…") so slow
   uploads don't look frozen (submit button already disabled via `isPending`).
**Acceptance:**
- Kill network between create and upload → user lands on edit page for the created expense;
  no way to accidentally create a second one from that failure.

### 0.3 Unsaved-changes guard on ExpenseForm
**Files:** `frontend/components/expenses/ExpenseForm.tsx`, new hook `frontend/lib/useFormGuard.ts`
**Behavior:**
- Track dirty = any field differs from initial values OR `receiptFiles.length > 0` OR
  `deletedReceiptIds.size > 0`.
- Dirty → `beforeunload` handler (covers reload/close).
- In-app nav: guard the Cancel button (confirm dialog). For mobile bottom-nav links, add a
  lightweight `NavigationGuardContext` consumed by `AppShell.tsx` bottom nav + FAB that
  intercepts clicks when dirty and shows a confirm dialog ("Discard changes?").
- After successful save, clear dirty before navigating.
**Acceptance:**
- Filling the form and tapping another tab in the bottom nav prompts before discarding.
- Clean form navigates without prompting.
- No prompt after successful save/redirect.

---

## Phase 1 — Field technician flow

### 1.1 Offline draft queue
**Files:** new `frontend/lib/offlineQueue.ts` (IndexedDB helpers), `ExpenseForm.tsx`,
`ExpensesClient.tsx`, `AuthProvider.tsx` or a small `OfflineSyncProvider`.
**Constraint:** Background Sync API is unsupported in Safari/iOS PWAs → implement an
app-level sync loop, not SW-driven sync.
**Design:**
- IDB store `pending_expenses`: `{ id (uuid), payload, receipts: [{name, type, blob}], createdAt }`.
  File blobs are structured-cloneable — store directly.
- On save: if `!navigator.onLine` or axios error is network-level (`!error.response`),
  queue instead of failing; toast "Saved offline — will submit automatically";
  navigate back to list (draft appears in queue badge).
- Sync loop: run on `online` event + app focus (`visibilitychange`) + after login. POST each
  queued item, then upload its receipts (reuse Phase 0.2 logic). On success remove from store,
  invalidate queries, toast "Synced N offline expenses".
- **Auth expiry while offline (from review):** if sync hits a 401, let the existing refresh
  interceptor run; if refresh also fails, leave items safely in IndexedDB and surface a
  "re-login to sync" state — never discard the queue.
- Expose queue count as a small badge on `/expenses` header ("N offline drafts").
- Conflict rule: offline drafts are always created as **new** expenses (never PATCH),
  avoiding edit conflicts entirely.
**Acceptance:**
- Airplane mode: fill form + attach receipt photo → save → success feedback, data in IDB.
- Go online → auto-syncs within seconds; expense appears with receipt.
- Force-close app while offline → reopening still queues/syncs correctly.

### 1.2 Receipt-first capture (snap → draft)
**Files:** new `frontend/app/expenses/capture/page.tsx`, reuses `ReceiptScanner`,
`processFileScan` logic extracted into `frontend/lib/ocrScan.ts`; update FAB target in
`DashboardClient.tsx` and camera affordances.
**Flow:** FAB → live camera capture (`capture="environment"` input) → show thumbnail +
OCR spinner → on OCR result immediately `POST /expenses` with scanned fields
(status=draft default) + receipt upload → toast "Draft saved — tap to add details" →
stay on capture screen ready for next receipt; small chip shows drafts created this session.
**Edge cases:** OCR fails → still create draft with just the photo, open edit page.
No network → route through the Phase 1.1 offline queue.
**Acceptance:**
- Gas-station test: photograph receipt → draft exists in <5 s with amount/merchant prefilled.
- Camera roll import also works (existing `cameraInputRef` path).

### 1.3 OCR scan progress + cancel
**File:** `frontend/lib/ocrScan.ts` (extracted in 1.2), `ReceiptScanner.tsx`
- Replace opaque spinner with staged status text: "Uploading… / Reading receipt… / (n)s".
- Wire the existing `AbortController` to a visible Cancel button that aborts polling and
  restores the pre-scan state.
- Cap total wait at 60 s with a clear timeout message + Retry.
**Acceptance:** Cancel mid-scan returns to clean form state; elapsed seconds visible.

### 1.4 Connection banner
**New:** `frontend/components/ConnectionBanner.tsx`, mounted in root layout.
`online/offline` listeners → slim top banner "Offline — changes will sync automatically"
(only when a queue exists or offline). Auto-hides on reconnect. i18n'd.

---

## Phase 2 — Expenses list overhaul

### 2.1 Filter pills + URL sync + empty-state split
**Files:** `frontend/app/expenses/ExpensesClient.tsx`
- Pills: `all / draft / submitted / approved / rejected / paid` (align with `Badge.tsx`
  STATUS_STYLES which already supports approved+rejected). Add count per pill if cheap
  (from dashboard stats; optional).
- All filters (`status`, `category_id`, `q`, `page`) become URL search params — single
  source of truth via `useSearchParams`; deep links and back button work everywhere.
  Prune default values from URLs (`q=""`, `page=0/1`, empty filters) so links stay clean.
- Empty states: `hasAnyData && hasActiveFilters` → "No results" + **Clear filters** action
  (EmptyState already supports `actionLabel/onAction`); else current no-expenses state.

### 2.2 Pagination + text search
**Frontend:** `ExpensesClient.tsx` — backend `GET /expenses` **already supports**
`page`, `size` (default 20) (verified in `ExpenseController.kt`). Add prev/next pager +
page size; replace `expenses?.length` total with server-provided total.
**Search box:** merchant/description/date filter input wired to `q` param.
**Backend (small):** add optional `q` request param to `GET /expenses`
(`ExpenseRepository` query: merchant/description ILIKE). ~15 lines incl. repository change.

### 2.3 Delete & duplicate UX
**Files:** `ExpensesClient.tsx`, `ToastProvider.tsx` (add optional `action` to toast)
- Replace `window.confirm` with inline two-step button (tap → becomes "Confirm delete?"
  for 3 s) on mobile cards, same pattern on desktop rows.
- Add `onError` → `toast.error`; add `onSuccess` → `toast.success` with **Undo** action
  (Undo re-POSTs a copy of the deleted payload captured pre-delete; only offered for drafts).
- `duplicate` mutation: success toast + existing navigation.

### 2.4 Export date range
**Files:** `ExpensesClient.tsx`. Backend `GET /expenses/export` **already accepts**
`from`/`to` (verified). Add a small popover with presets (this month, last month, this year,
all time) applied to both CSV/XLSX exports alongside existing status/category filters.

---

## Phase 3 — Manager review desk

### 3.1 Inline receipt viewer in approvals
**Files:** `frontend/app/approvals/page.tsx`,
`frontend/components/dashboard/PendingReportsTable.tsx`, reuse `SlideOverReviewDrawer.tsx`
and `ReceiptPreview.tsx`.
- "Receipt attached" chips become buttons opening the slide-over drawer with the
  expense's receipt(s) rendered side-by-side with line-item details (reuse the existing
  zoomable `ReceiptPreview`).
**Acceptance:** manager can approve/reject a report having viewed every receipt without
leaving the approvals page.

### 3.2 Batch approve
**Backend:** no bulk endpoint exists today (only `bulk-upload`). Add
`POST /api/reports/bulk-status { ids: number[], action: "approve"|"reject", reason? }`
in `ReportController.kt` reusing the single-report approve logic transactionally;
reject requires shared reason.
**Frontend:** checkboxes on `PendingReportsTable` rows (desktop) + long-press multi-select
on mobile; sticky action bar "Approve (n) / Reject (n)". Reuse `useReviewQueueActions`.
**Per-item transactions, not one big one (from review):** iterate ids, try/catch each
status transition independently (via `authorization.canManage` check +
`ExpenseReportLifecycle.approve/reject`), return `{ succeeded: number[], failed: [{id, reason}] }`
so partial failures are retryable per row.
**Acceptance:** 10 pending reports approved in two taps; partial failure reports which
rows failed and retries cleanly.

### 3.3 Real notification indicator
**Files:** `DashboardClient.tsx`.
- Managers/chef_finance: bell dot shows real count of `managerStats.pending_reports +
  pending_advances`; clicking scrolls to the queues (or navigates to `/approvals`).
- Technicians: bell hidden until a notifications source exists — remove the fake dot now
  (false-alert fatigue is worse than no bell).

---

## Phase 4 — Auth & session continuity

### 4.1 Preserve redirect context
**Files:** `lib/api.ts` (401 interceptor), `middleware.ts`, `app/login/page.tsx`
- Interceptor: `window.location.assign(`/login?next=${encodeURIComponent(current path + search)}`)`.
- Middleware: forward incoming `?next=` through the login redirect for cookie-less visits.
- Login page: after success `router.push(searchParams.get("next") ?? "/dashboard")` —
  validate value starts with `/` (open-redirect guard).
**4.2 Show-password toggle** on login form (eye icon, `aria-pressed`).

---

## Phase 5 — i18n & a11y sweep

### 5.1 Translate hardcoded components
Verified zero `useTranslations` usage in: `components/expenses/ReceiptPreview.tsx`,
`components/expenses/BulkReviewDrawer.tsx`, `components/ui/SearchDropdown.tsx`.
Plus scattered literals elsewhere (e.g. "JPG, PNG, PDF or WEBP…" in ExpenseForm,
aria-labels in AppShell/DashboardClient/ExpensesClient desktop table).
- Add keys to `messages/en.json` + `messages/ro.json`; run `npm run i18n:check`.
- Consider extending `scripts/check-i18n-parity.mjs` with a lint rule/grep step that
  flags JSX text nodes and `aria-label=` string literals not wrapped in `t()`.
**Note:** `SignaturePad.tsx` Clear/Save buttons are also untranslated — include.

### 5.2 Desktop table aria-labels
Mirror the mobile cards' `aria-label`s onto the desktop table icon buttons
(edit/delete/duplicate) in `ExpensesClient.tsx`.

---

## Deferred / backlog
- **Category icons/colors on the Category model** — internal refactor; substring matching
  works today. Revisit when admin category editor is touched.
- **Cmd-K command palette** — nice-to-have once global search is reachable on mobile (5.1's
  SearchDropdown work makes this cheap later).

## Delivery notes (from review round 2)
- Ship **Phase 1.4 (connection banner) together with Phase 1.1 (offline queue)** in the same
  PR — the banner is the visual confirmation for queued drafts.
- Phase 0.1 includes the SignaturePad button translations (avoids a second touch).
- No cuts: all P0–P3 items confirmed as real gaps by both reviewers.

## Verification strategy
- **Existing suites:** `npm run lint`, `npm run i18n:check`, `npm run test:e2e`,
  `npm run test:e2e:mobile` must stay green; add Playwright specs:
  - signature stroke position at dpr=2 (`deviceScaleFactor` in a new context),
  - offline queue: e2e with `context.setOffline(true)` → save → online → synced,
  - filter pills incl. rejected, URL params, clear-filters empty state,
  - export date-range params present in download URL,
  - login `?next=` round trip.
- **Manual matrix:** iOS Safari standalone PWA + Android Chrome, dpr 2/3, EN/RO,
  light/dark, technician + manager roles.
- Each phase lands as its own commit series; no phase mixes refactors with behavior changes.

## Risks / open questions
1. **Offline queue vs. server validation** — queued payloads may fail server-side on sync
   (e.g., currency delisted). Design: failed sync items go to a "needs attention" state
   surfaced in the offline-drafts badge, never silently dropped.
2. **Batch approve permissions** — confirm chef_finance vs manager scopes mirror the
   single-approve rules exactly in the new bulk endpoint.
3. **IDB blob storage size** — receipts are compressed client-side already (1600px JPEG);
   cap queue at ~20 items with oldest-first warning.
4. **`beforeunload` + iOS PWA** — unreliable in standalone mode; the NavigationGuard
   context (Phase 0.3) is the primary protection there.
