# Frontend production audit

## Scope and evidence standard

Read-only source audit of the current working tree, using the repository README, CONTEXT, planning PROJECT/ROADMAP, mobile remediation plan, frontend AGENTS/CLAUDE and React best-practice guidance. Application code was not changed. This reviewer did not run lint/build/Playwright; the coordinated command ledger belongs in `06-test-and-verification-plan.md`. Source-confirmed behavior is not a claim of an observed production incident.

Security findings are owned by `04-security-privacy-audit.md`: SEC-002 (offline account isolation), SEC-003 (private browser/query caching), SEC-004 (403 versus 401 refresh contract). They are release dependencies, not duplicated below. Mobile accessibility/navigation issues are in `01-mobile-ios-android-ux-audit.md`.

## Inventory and architecture map

### All route entry points

All paths below are under `frontend/app/`; each route maps to its listed `page.tsx`. There are no `app/api/**/route.ts` handlers; `/api` is rewritten to Spring by `frontend/next.config.ts`. Middleware is `frontend/middleware.ts` and checks cookie presence, not authoritative authorization.

| Routes | Source / boundary |
|---|---|
| `/`, `/login` | `page.tsx`; `login/page.tsx`, `login/layout.tsx` |
| `/dashboard` | `dashboard/page.tsx` server prefetch → `DashboardClient.tsx` |
| `/expenses` | `expenses/page.tsx` server prefetch → `ExpensesClient.tsx` |
| `/expenses/new`, `/expenses/capture`, `/expenses/[id]/edit` | respective page files; new/edit reuse `ExpenseForm`; capture duplicates creation/attachment orchestration |
| `/reports` | `reports/page.tsx` server prefetch → `ReportsClient.tsx` |
| `/reports/new`, `/reports/[id]/edit`, `/reports/[id]/advances`, `/reports/[id]/mileage` | respective client page files |
| `/reports/[id]` | `reports/[id]/page.tsx` server prefetch → `ReportDetailClient.tsx` |
| `/approvals`, `/advances`, `/payments`, `/categories`, `/insurance`, `/search` | respective client page files |
| `/profile`, `/profile/signature` | respective client page files |
| `/profile/[id]` | `profile/[id]/page.tsx` server prefetch → `ProfileDetailClient.tsx` |
| `/admin/users`, `/admin/settings` | respective server page files → `UsersClient.tsx`, `SettingsClient.tsx` |
| `/admin/email`, `/admin/imap`, `/admin/ldap`, `/admin/ocr`, `/admin/receipts`, `/admin/storage` | respective client page files |

**Absent route:** `/expenses/[id]` has no page although dashboard and search link to it (MUX-001).

Cross-cutting entry points: `app/layout.tsx` (viewport, theme/language scripts, providers and PWA), `app/globals.css`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`. No per-route `loading.tsx` exists; asynchronous server prefetch waits before the client route appears.

### Reusable components — complete map

All below under `frontend/components/`:

- Runtime: `Providers.tsx` owns one persistent QueryClient; `AuthProvider.tsx` session polling/redirects; `OfflineSyncProvider.tsx` queue replay/banner; `PwaRegistration.tsx` service-worker lifecycle; `ThemeProvider.tsx`; `ToastProvider.tsx`.
- Chrome: `layout/AppShell.tsx`, `layout/Sidebar.tsx`.
- Expense workflow: `expenses/ExpenseForm.tsx` (create/edit, FX, receipt mutation, OCR and offline save), `FxRateInput.tsx` (quote/manual/debited amount), `ReceiptScanner.tsx`, `ReceiptPreview.tsx`, `BulkUploadZone.tsx`, `BulkReviewDrawer.tsx`.
- Report evidence: `reports/ReportReceiptsDrawer.tsx` reuses ReceiptPreview.
- Signature: `signature/SignaturePad.tsx`.
- UI primitives: `ui/Badge.tsx`, `ui/EmptyState.tsx`, `ui/SearchDropdown.tsx`. No shared field/error/dialog/button implementation enforces the mobile contract.
- Dashboard: `dashboard/ExpenseStatusOverview.tsx`, `ManagerKpiCards.tsx`, `PendingAdvancesList.tsx`, `PendingReportsTable.tsx` (active accordion/bulk review), `RecentActivityStream.tsx`, `ReimbursementFlowLedger.tsx`, `SlideOverReviewDrawer.tsx`, `SpendChart.tsx`.
- `SlideOverReviewDrawer.tsx` has no current external caller in the inspected source; do not prioritize its defects as if it were the active manager drawer. The live path is PendingReportsTable → ReportReceiptsDrawer.

### Shared libraries and clients — complete map

All below under `frontend/lib/`:

- `api.ts`: Axios instance, browser `/api`, server env fallback, response normalization, refresh interceptor, blob/share downloads and compatibility barrel exports.
- `api/expenses.ts`: bulk upload and duplication; `api/reviewQueue.ts`: review queue and bulk statuses; `api/admin.ts`: OCR/storage/FX/email-admin endpoints.
- `serverApi.ts`: server `cookies()` forwarding and fetch; `auth.ts`: login/logout/me/refresh helpers.
- `queryKeys.ts`: category/expense/report/review/advance/mileage/settings/dashboard/LDAP/email/IMAP/OCR/storage/insurance/search factories. Many callers bypass them or use different key shapes.
- `ocrScan.ts`: image-to-JPEG compression, job upload/poll/cancel/deadline; `offlineQueue.ts`: IndexedDB queue CRUD.
- `navigationGuard.tsx`, `useFormGuard.ts`, `useBodyScrollLock.ts`: voluntary in-app guard and body locking.
- `format.ts`: cached Intl currency formatters and mutable current locale; `haptics.ts`: optional vibration.
- Type contracts: `types/admin.ts`, `common.ts`, `dashboard.ts`, `expense.ts`, `index.ts`, `insurance.ts`, `report.ts`, `reviewQueue.ts`, `search.ts`, `user.ts`.

Related shared runtime: `i18n/LocaleProvider.tsx`, `config.ts`, `request.ts`, `runtime.ts`, `messages.ts`, `messages/en.json`, `messages/ro.json`; `public/sw.js`, `public/manifest.json`.

## Findings

### FE-001 — Receipt-first and offline replay can duplicate expenses after partial success

- **ID:** FE-001
- **Severity:** High
- **Area:** Frontend
- **Confidence:** Confirmed orchestration defect; actual lost-response/parallel-tab scenarios need fault-injection reproduction.
- **Evidence:** `frontend/app/expenses/capture/page.tsx:50–60,116–146`: POST expense, then POST receipts; the created ID is returned only after receipts succeed. On attachment error, the caller has no ID/recovery destination. `frontend/components/OfflineSyncProvider.tsx:65–94`: each retry POSTs a new expense; if receipt upload fails for network reasons the entire original item stays queued. `frontend/lib/offlineQueue.ts:21–29` persists no server expense ID or operation step. `frontend/components/expenses/ExpenseForm.tsx:216–230` queues after any no-response create failure even though server commit may have succeeded. Queue UUID is not sent to `/expenses`; `ExpenseController.createExpense` has no idempotency-key contract. Replay lock is a component ref, not cross-tab.
- **Impact/risk:** Field-network interruptions produce duplicate money claims and unattached/orphan drafts, especially between expense creation and receipt upload. Two open tabs can replay the same queue concurrently.
- **Recommended fix:** Introduce an owner-bound operation ID enforced atomically by backend create, persist server ID and per-receipt progress immediately, and retry only incomplete steps. Share one create-with-receipts coordinator across manual/capture/queue flows. Coordinate cross-tab replay; backend idempotency remains authoritative.
- **Acceptance criteria:** Lost response, attachment timeout, reload and concurrent tabs create exactly one expense with exactly one copy of each receipt. Partial results remain discoverable with a retry action.
- **Suggested tests:** PostgreSQL-backed idempotency tests plus Playwright fault injection at each boundary; two tabs; network restored while `navigator.onLine` remains true.
- **Dependencies/sequencing:** Phase 0 data-loss gate together with SEC-002. Preserve existing queued drafts; do not discard or reassign them during migration.

### FE-002 — Delete “Undo” does not restore the deleted financial record or its receipts

- **ID:** FE-002
- **Severity:** High
- **Area:** Frontend
- **Confidence:** Confirmed.
- **Evidence:** `frontend/app/expenses/ExpensesClient.tsx:200–238`: deletion offers Undo for every draft, but `restoreDeleted` POSTs only original amount/currency/date/merchant/description/category/tax. It omits receipts, report association, stored/manual FX and OCR metadata, and gets a new expense ID. The original delete has already removed the record and associated evidence through the backend service.
- **Impact/risk:** A technician believes a mistaken deletion was reversed although proof of purchase is gone and the restored EUR amount may change under current FX policy. The original report is not restored.
- **Recommended fix:** Implement reversible backend deletion/restore with evidence and exact stored values, or delay the destructive operation during a cancellable grace period. Until then, remove the misleading Undo promise and explicitly warn that receipt deletion is permanent.
- **Acceptance criteria:** Undo preserves original ID/relationship, receipt bytes and hashes, FX/manual flags and monetary values; or UI clearly does not advertise restoration it cannot perform.
- **Suggested tests:** Delete/undo a non-EUR manual-rate draft attached to a report with two receipts; verify DB identity, totals and downloadable hashes.
- **Dependencies/sequencing:** Phase 0. Coordinate backend storage deletion/transaction remediation (BE-007); do not recompute historical rates.

### FE-003 — Report creation followed by attachment loses partial-success identity

- **ID:** FE-003
- **Severity:** High
- **Area:** Frontend
- **Confidence:** Confirmed.
- **Evidence:** `frontend/app/reports/new/page.tsx:29–55`: POST `/reports`, then POST `/reports/{id}/attach`; any attachment failure enters generic `onError` without retaining ID. Re-click Create executes the first POST again. Draft selection at `:24–27,150–177` includes all draft expenses rather than filtering `!report_id`; the detail page does filter them (`ReportDetailClient.tsx:199`).
- **Impact/risk:** Duplicate empty reports and repeated attachment failures; a technician can select a draft already assigned elsewhere and be stranded after successful report creation.
- **Recommended fix:** Atomic create-and-attach API or durable staged UI retaining report ID, invalidating lists on partial success and linking to recovery. Filter to unattached owned drafts and revalidate server-side.
- **Acceptance criteria:** Attachment rejection leaves one recoverable report; retry does not create another; assigned expenses are not offered as available.
- **Suggested tests:** Create succeeds/attach 409 or 400; lost response; another tab attaches an expense first; retry and cancel.
- **Dependencies/sequencing:** Phase 0/early Phase 1 with FE-001 shared mutation orchestration; backend ownership remains enforced.

### FE-004 — Opening an existing receipt submits the expense form

- **ID:** FE-004
- **Severity:** High
- **Area:** Frontend
- **Confidence:** Confirmed HTML behavior.
- **Evidence:** `frontend/components/expenses/ExpenseForm.tsx:384–385` contains the save-on-submit form; existing receipt filename control at `:493–496` is `<button onClick={() => downloadBlob(...)}>` without `type="button"`. Sibling remove buttons correctly declare their type.
- **Impact/risk:** Tapping a filename to inspect evidence saves unsaved financial edits, may delete selected receipts, and can navigate away; inspecting a receipt must be read-only.
- **Recommended fix:** Make all non-submit form controls explicit `type="button"`; add pending/error handling to downloads.
- **Acceptance criteria:** Opening/downloading an existing receipt generates only its GET, never expense PATCH/receipt deletion or navigation.
- **Suggested tests:** Change amount and mark a receipt for deletion, then tap the other filename; assert no mutation, fields and dirty state preserved.
- **Dependencies/sequencing:** Phase 0/early Phase 1 narrow regression fix; MUX-004 supplies accessible names/target sizing.

### FE-005 — Offline resume is treated as logout and there is no queue recovery UI

- **ID:** FE-005
- **Severity:** High
- **Area:** Frontend
- **Confidence:** Confirmed control flow; real PWA offline cold-start/foreground behavior needs device verification.
- **Evidence:** `frontend/components/AuthProvider.tsx:62–80,83–93` clears user and redirects `/login` on **any** `getMe` failure, including offline/network failure; foreground visibility triggers this check. `OfflineSyncProvider.tsx:89–94` marks any HTTP error permanent and `:70` excludes errored items forever. Its public context exposes counts/refresh only (`:22–29`); `ExpensesClient.tsx:311–317` shows “needs attention” without inspecting/editing/retrying queued items. `offlineQueue.ts:35–36,68–79` declares MAX_QUEUE_SIZE=20 but never enforces it. `:51–63` resolves writes on request success rather than transaction completion.
- **Impact/risk:** Technicians lose the usable field workflow while offline, and queued financial evidence rejected once (including transient server failures) has no in-app recovery. Unbounded receipt storage can exhaust browser quota; a transaction abort after request success can contradict “saved offline”.
- **Recommended fix:** Distinguish anonymous/expired from temporarily unverifiable session; make offline permission policy explicit. Add owner-bound queue inspector/retry/edit/export/discard, classify retryable statuses, enforce capacity/bytes within the write transaction and await transaction completion. Preserve drafts on auth failure.
- **Acceptance criteria:** Offline foregrounding does not masquerade as invalid credentials; queued items remain accessible, ownership-isolated and recoverable. 503 retries; invalid data surfaces an editable error. Capacity/quota failures do not claim success.
- **Suggested tests:** Installed PWA offline resume, initial cold start policy, 401/403 versus 503, queue full, quota/transaction abort, language switch and foreground replay.
- **Dependencies/sequencing:** SEC-002/003/004 first; FE-001 defines replay identity. Early Phase 1 mobile gate.

### FE-006 — OCR deadline/cancellation does not bound all work; scanners permit overlapping jobs

- **ID:** FE-006
- **Severity:** Medium
- **Area:** Frontend
- **Confidence:** Confirmed control flow; stalled-server timing/cancellation UI needs execution.
- **Evidence:** `frontend/lib/ocrScan.ts:92–129`: maxWaitMs is checked only between polling requests, not as an abort timer over upload/GET/compression. `frontend/lib/api.ts:7–10` sets no request timeout. `ReceiptScanner.tsx:31–40` leaves its dropzone clickable/key-activatable while scanning; only separate camera button is disabled (`:113–118`). `ExpenseForm.processFileScan:312–353` overwrites `scanAbortRef`, has no overlap guard and unmount cleanup at `:141–147` does not abort. `capture/page.tsx:83` calls scan with no signal/cancel control. `ocrScan.ts:133–136` only recognizes `AbortError`, not every Axios cancellation shape.
- **Impact/risk:** “60 seconds” is not a wall-clock cap; repeated selection races update fields with the wrong receipt, cancel can affect only the newest job, navigation leaves work running.
- **Recommended fix:** One abort/deadline for the entire operation, disabled/guarded entry points, unmount cancellation and generation identity before applying results. Normalize cancellation via the actual HTTP client error contract. Preserve selected photo when OCR fails so manual entry remains possible.
- **Acceptance criteria:** Hung upload and hung poll terminate within declared cap; only one result may update the form; cancel/navigation stops client polling and never applies stale output.
- **Suggested tests:** Never-resolving POST/GET, select two files rapidly, cancel during compression/upload/poll, route change, manual-entry fallback.
- **Dependencies/sequencing:** Backend job durability/transaction fixes remain separate; Phase 1. Provider cancellation may need independent backend support and must not be promised if unavailable.

### FE-007 — Server prefetch keys do not hydrate the consuming queries

- **ID:** FE-007
- **Severity:** Medium
- **Area:** Frontend
- **Confidence:** Confirmed key/request mismatch; bundle/latency magnitude not measured.
- **Evidence:** `frontend/app/expenses/page.tsx:13–21` fetches **all** expenses and seeds `[expenses,list,{status:"",category_id:""}]`; client `ExpensesClient.tsx:154–164` uses paged params `{page:0,size:20,...}`. Reports server `reports/page.tsx:15` seeds an object-filter key while `ReportsClient.tsx:60` uses `[reports,list,statusFilter,showAll]`. Dashboard server `dashboard/page.tsx:13–14` uses `[dashboard,{all:false}]`; client `DashboardClient.tsx:82–85` uses `[dashboard,user.id,"all",showAll]` and initially `showAll=true`. `serverApi.ts:32–35` has no abort deadline and server wrappers await fetch before returning.
- **Impact/risk:** Duplicate backend fetches and private serialized payloads the client never uses; expense pagination benefit is undermined by unbounded server prefetch. Slow/unreachable internal API delays route rendering.
- **Recommended fix:** Share query options/key/normalized parameters between server and client; honor URL filters/page and identity. Prefetch only the bounded data actually consumed; choose deliberate server timeout/streaming fallback.
- **Acceptance criteria:** One initial request per required resource; client consumes hydration without immediate duplicate; deep-linked page/filter and role scope match on both sides; slow API renders recoverable UI.
- **Suggested tests:** Request counts/serialized payload size, page 3 filtered route, manager/company versus technician scope; slow server route trace.
- **Dependencies/sequencing:** Resolve SEC-003 privacy caching before optimizing persisted payloads. Phase 4, but do not ship unbounded payloads at production-scale volumes.

### FE-008 — Failed reads and financial mutations are frequently presented as empty/silent states

- **ID:** FE-008
- **Severity:** Medium
- **Area:** Frontend
- **Confidence:** Confirmed.
- **Evidence:** `ExpensesClient.tsx:162–177,426–439` only reads isLoading and converts missing data to `[]`; `ReportsClient.tsx:59–68,346–377` similarly displays create-first empty state after failure. `DashboardClient.tsx:81–108,417–433` ignores query errors/loading and passes empty pending queues, leading to `PendingReportsTable.tsx:333–342` “all clear”. `BulkReviewDrawer.tsx:41–47,62–93` has no whole-upload onError and silently catches patch/delete errors; uncontrolled `defaultValue` fields can show rejected values. `reports/[id]/mileage/page.tsx:51–69,72–74` has no mutation onError and silently returns for invalid duration. Advances mutations (`reports/[id]/advances/page.tsx:43–77`) likewise lack errors. `ReportsClient.quickSubmit:83–90` has no error feedback.
- **Impact/risk:** A manager mistakes unavailable work for an empty approval queue; technician thinks an inline monetary edit was saved when rejected. Re-taps and duplicate attempts become likely.
- **Recommended fix:** Explicit loading/error/empty/stale states, retry on reads, persistent field/server errors for mutations and per-row pending state. Distinguish data unavailability from zero. Render controlled inline fields or revert/reconcile them after rejection.
- **Acceptance criteria:** Every primary read has retry/error state; no 500/403/timeout renders an “all clear” or “no records” success. Failed inline edits clearly remain unsaved; server validations are actionable.
- **Suggested tests:** Inject 400/403/409/500 and timeout for each named path; mutate amount then fail; manager pending queue fetch failure; bulk request-level failure versus per-file result errors.
- **Dependencies/sequencing:** SEC-004 auth-status repair; shared form/Toast a11y (MUX-005/006). Phase 1.

### FE-009 — Local calendar dates are converted through UTC and export boundaries shift

- **ID:** FE-009
- **Severity:** Medium
- **Area:** Frontend
- **Confidence:** Confirmed date arithmetic; no production export sampled.
- **Evidence:** `frontend/app/expenses/ExpensesClient.tsx:30–46` creates month start/end with local `new Date(year,month,day)` then calls `toISOString().slice(0,10)`. In Europe/Bucharest, local midnight serializes to the previous UTC date. `ExpenseForm.tsx:63`, `capture/page.tsx:101` use UTC today for the field-user default. `ExpenseForm.tsx:333` compares UTC today when deciding whether OCR may replace the date.
- **Impact/risk:** “This month”/“last month” exports can include the previous month's last day and exclude the selected month's last day; shortly after local midnight, new expense defaults to yesterday and FX/report grouping can be wrong.
- **Recommended fix:** Keep date-only values as explicit calendar dates; use local/business-zone formatting instead of UTC timestamp slicing. Define whether device or company timezone owns defaults.
- **Acceptance criteria:** Romanian month ranges are first through last calendar day, including DST boundaries; default receipt date follows approved timezone policy.
- **Suggested tests:** Playwright `timezoneId: Europe/Bucharest` at 00:30 in winter/summer and month/year edges; deterministic unit tests for range helper and OCR replacement logic.
- **Dependencies/sequencing:** Phase 2 financial hardening; agree timezone semantics before changing historical values. Do not migrate/recompute existing dates automatically.

### FE-010 — Cross-screen query invalidation is incomplete

- **ID:** FE-010
- **Severity:** Medium
- **Area:** Frontend
- **Confidence:** Confirmed missing invalidations; stale duration depends on focus/remount/default staleTime.
- **Evidence:** `ExpenseForm.tsx:273–277` invalidates expenses/dashboard but not report detail after changing an attached expense. `reports/[id]/mileage/page.tsx:46–49` and `advances/page.tsx:38–41` only invalidate one report detail and child keys, not report lists/dashboard. `ReportsClient.tsx:75–89` delete/submit invalidates reports/dashboard but not expenses, even with delete_expenses. `ReportDetailClient.tsx:111–133` approve/reject does not invalidate reviewQueueKeys whereas shared `lib/reviewQueueActions.ts` owns that invalidation for other review entry points.
- **Impact/risk:** Immediately returning to a cached report/list/approval screen shows old totals, deleted evidence or already-processed work. Default focus refetch reduces but does not eliminate the stale window.
- **Recommended fix:** Centralize mutation query effects at the domain-operation seam; invalidate or update all affected report/expense/review/dashboard aggregates and await required refresh before claiming completion.
- **Acceptance criteria:** An edit followed by back navigation immediately shows consistent totals and queue membership across all entry points.
- **Suggested tests:** Warm every affected cache first; mutate without blur/reload; navigate immediately. Check amount, receipt count, report state and review queue.
- **Dependencies/sequencing:** FE-007 key normalization first or alongside; Phase 2.

### FE-011 — Mobile/axe command is not a production authenticated-flow gate

- **ID:** FE-011
- **Severity:** High
- **Area:** Testing
- **Confidence:** Confirmed test configuration; execution counts/status belong to coordinator command ledger.
- **Evidence:** `frontend/package.json:12` limits `test:e2e:mobile` to `tests/mobile-ui.spec.ts`. That file `:52–53` skips authenticated cases unless three env conditions are met. Public login `:35–44` mocks `/auth/me` as a successful “guest” identity. Core flows outside that spec (capture, report creation/submit/reject, signature, offline, admin, bulk) do not run under this command. `playwright.config.ts:32` blocks service workers; both mobile devices override viewport to 412×849 (`:5,38,42`). `tests/responsive/overflow.spec.ts:4–8,44–68` uses 375/768/1280 and mostly empty mocked data; it does not establish long-data overflow at the requested four widths.
- **Impact/risk:** Green mobile command can mean only login markup passed, not a functioning technician/manager application. It misses FE-001, MUX-001 and installed-PWA privacy/offline behavior.
- **Recommended fix:** CI deterministic backend-seeded role fixtures, non-skippable release smoke suite, full financial flows in Chromium/WebKit, separate service-worker-enabled PWA suite and explicit 360/390/412/430 assertions. Treat unexpected skips as release failure.
- **Acceptance criteria:** CI artifacts record role, route, locale, viewport, test counts and screenshots/traces; a production gate fails if authenticated fixtures are unavailable or core flows skipped.
- **Suggested tests:** See mobile route matrix and `06-test-and-verification-plan.md`; include negative network/auth tests and nonzero mileage/advances/receipts.
- **Dependencies/sequencing:** Phase 3 implementation, but verified authenticated smoke is a release gate now. Credentials must be isolated/nonproduction.

### FE-012 — Strict TypeScript is enabled, but lint configuration does not establish a TS/React quality gate

- **ID:** FE-012
- **Severity:** Medium
- **Area:** Testing
- **Confidence:** Configuration gap confirmed; exact CLI failure/coverage must be taken from coordinated lint execution.
- **Evidence:** `frontend/tsconfig.json:10` enables strict mode. `frontend/eslint.config.mjs` supplies JS recommended and global/plugin config but no TS/TSX files/parser configuration or enabled React hook rules; it disables `react-hooks/exhaustive-deps`, `no-undef`, explicit-any and image rule, and excludes SW. Package uses eslint 10 with a very old `eslint-config-next` dependency (`package.json`), although that package is not actually imported by the config. Numerous primary flows use `catch(e:any)` and raw unvalidated API data. Do not infer a package incompatibility solely from version age.
- **Impact/risk:** Lint may omit TS/TSX or fail on config errors rather than enforce hooks/types. Compile success does not detect semantic defects such as the literal JSX `return (` in PendingReportsTable (MUX-012).
- **Recommended fix:** Establish an installed-version-supported flat config with explicit TS/TSX parsing, hooks and Next recommendations. Prove representative TSX is included using `--print-config`; remove stale dependencies after confirmation. Scope suppressions rather than turning off global correctness checks.
- **Acceptance criteria:** Lint examines application TS/TSX and fails an intentional local test violation; strict `tsc --noEmit` independently passes; hook defects and missing button semantics receive appropriate checks/tests.
- **Suggested tests:** `npx eslint --print-config components/expenses/ExpenseForm.tsx`; lint, tsc and build in CI. Include SW in a dedicated browser-worker lint config.
- **Dependencies/sequencing:** Phase 3; do not weaken checks to make existing code green.

## Existing strengths and bounded performance observations

- Dynamic server page wrappers use a per-request QueryClient rather than a shared server cache; selected independent prefetches use Promise.all. Identity cache problems are addressed separately in SEC-003, not conflated with that positive control.
- Browser API URL is same-origin `/api`; internal routing is centralized through config/server fetch. No hardcoded production credential was identified in this frontend review. Effective build/runtime internal URL still requires deployment verification.
- Expense client list requests page/size and debounces query search; UI query keys should preserve this behavior when fixing server hydration.
- Signature and bulk drawer are dynamically imported; plain receipt `<img>` is reasonable for authenticated/blob resources and should not be blindly replaced with public image optimization.
- Both desktop and mobile dashboard trees are rendered and hidden with CSS, so their hooks/components remain part of the client tree. LocaleProvider statically imports both language JSON files (`i18n/messages.ts`, approximately 81 KB combined source). These are concrete measurement targets, **not a claimed severe bundle regression**; profile production chunks and low-end Android before making architecture changes.
- Basic form field IDs/autocomplete/16px mobile inputs are substantially improved in login, core expense form and own profile. The prior mobile plan is not evidence that every financial/admin form received the same remediation.

## Verification boundary

No browser, screenshot, real device, load test or build result was generated by this bounded reviewer. Static navigation, hydration keys, mutation sequencing and declared CSS/semantics were inspected. Physical iOS camera output/HEIC, Android file-picker behavior, keyboard viewport, share/download after async requests, cold-start service-worker migration, real API contract behavior and production bundle metrics remain **Needs verification**. Do not claim all-important-flows UAT passed from static review or from existing screenshot files.
