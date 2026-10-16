# Frontend improvement TODO — live execution tracker

Scope: all findings from the Technician, MOD, CFO and Manager frontend review, plus the already-approved mobile work it overlaps. Covers mobile, tablet and desktop. Unrelated backend/security findings in `todo.md` remain separate.

**Handoff created:** 2026-09-19 UTC · **Reviewed HEAD:** `cf5d49c` plus an already-dirty working tree.

## Live progress

> The implementing agent must update this file as work happens. This is an agent-maintained Markdown tracker, not an automatically refreshed dashboard. GitHub Issues remain the canonical specification and issue status.

| Measure | Current value |
| --- | --- |
| Last updated | 2026-09-19 UTC — checklist created |
| Overall | **0 / 36 checkpoints verified complete (0%)** |
| TODO | 31 |
| VERIFY | 2 — F12, F15 |
| IN PROGRESS | 0 |
| BLOCKED | 3 — F18, F19, F35 |
| DONE | 0 |
| Current owner / task | Unassigned / none |
| Next action | F01: inventory current work, reconcile issues and claim files |
| Known gates | #46 contract and backend prerequisites → F18; #47/#48 integration → F19; implementation + physical iPhone → F35 |
| Application changes made by this handoff | None |

The zero counts **newly verified checkpoints in this tracker**, not existing product functionality. In particular, #47 already has implementation and test evidence; verify it instead of rebuilding it.

### Update protocol — required for every task

1. Before starting, reread this file and current issue comments; set the task to `IN PROGRESS`, record your owner/session, and update the summary/current task.
2. On a blocker, set `BLOCKED` with the exact dependency, decision or failed check and the next unblocking action. Continue independent work where safe.
3. Mark `[x]` and `DONE` only when the task's acceptance conditions and applicable definition of done below pass. Record commands/results and evidence or commit links in the task or progress log. Existing work can qualify after verification; it does not need rewriting.
4. Update counts, completion percentage (`DONE / 36`), UTC timestamp, next action and append a log entry after each state change. Additions/removals require updating the denominator and explaining scope changes.
5. Mirror relevant implementation evidence/blockers to the canonical GitHub issue using `gh`. Completing one overlapping task here does not close an entire issue automatically.
6. Before stopping or handing off, record exact remaining work, owned files and verification limitations. A checked box must never mean merely “code written” or “test attempted.”

States: `TODO` = not started; `VERIFY` = existing work needs acceptance/reconciliation; `IN PROGRESS` = claimed; `BLOCKED` = explicit gate; `DONE` = accepted with evidence. Dependency-bearing TODOs are queued, not necessarily ready to start.

Priorities: **P1** correctness, recovery, blocked workflows and essential access; **P2** role usability and workflow polish. Each task's entire scope is required unless a product decision explicitly defers it.

## Start here: constraints and existing ownership

- Read `AGENTS.md`, `frontend/AGENTS.md`, `CONTEXT.md`, relevant `docs/adr/`, and the linked issues **with comments**. Before frontend implementation, read the relevant installed Next guides under `frontend/node_modules/next/dist/docs/`.
- Inventory `git status --short` and existing diffs. Backend OCR, capture/form/list, offline recovery, translations and tests already contain other work. Preserve it; coordinate shared files before editing. Do not reset the tree, stage everything, or include somebody else's changes in a commit.
- Role mapping: Technician is the field-expense role; CFO is `chef_finance`; MOD is the administration role. Preserve server authorization. New navigation does not grant MOD report-approval/payment privileges.
- Preserve slate/orange identity, system typography, sidebar/bottom navigation, safe areas, reduced motion, desktop tables/mobile cards and the Manager Work Hub. Ordinary single-report approval remains direct per #23; payment recording and destructive account changes are different actions.
- Preserve ADR-0001 EUR/FX policy, frozen historical rates and manual overrides. Use authoritative EUR amounts rather than reimplementing FX in display code.
- Preserve ADR-0002 known-ID recovery and its response-loss limitations, ADR-0004 durable OcrJob promotion, and ADR-0005 user-scoped persistence/authenticated-cache boundaries. Never create a second client-side Expense after job promotion.
- **Decision conflict:** #45 chooses immediate verification by default; ADR-0004 describes continuous capture. F02/#46 must reconcile the navigation decision before F18 integration while preserving durability. Verification is separate from financial status; it never auto-submits an ExpenseReport or introduces an unapproved submission gate.
- Use mocked APIs or isolated test accounts/backends. Existing authenticated UI tests can create Expenses. Production data changes, credential bypass and deployment are not authorized by this file.
- Paths below are starting points, not permission to edit blindly. Revalidate findings against the current tree, including changes made by other agents since the audit.

### Canonical issue map

Use `gh issue view <number> --comments`. Read current labels/dependencies before claiming work. Use `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` for tracker operations.

| Issue | Relationship to this checklist |
| --- | --- |
| [#23](https://github.com/AdelinPOA/xpenses-kotlin/issues/23) | Closed Manager workflow spec: preserve Work Hub / Review Queue / report-browser separation and direct single approval. New fixes need their own matching issue, not blind reopening. |
| [#44](https://github.com/AdelinPOA/xpenses-kotlin/issues/44) | Existing detail/download, report-form guard and mobile touch-target work: F15/F31. |
| [#45](https://github.com/AdelinPOA/xpenses-kotlin/issues/45) | Technician mobile parent; not an authorization for finance/admin scope. Track new role work separately. |
| [#46](https://github.com/AdelinPOA/xpenses-kotlin/issues/46) | Durable verification contract/investigation only: F02; gates F18 and relevant recovery changes. |
| [#47](https://github.com/AdelinPOA/xpenses-kotlin/issues/47) | Compact Expense layout/navigation: F12; coordinate F11/F30/F31 without duplicating work. |
| [#48](https://github.com/AdelinPOA/xpenses-kotlin/issues/48) | Bulk layout and truthful recovery: F17. |
| [#49](https://github.com/AdelinPOA/xpenses-kotlin/issues/49) | Resumable immediate verification: F18, after #46/#47 and identified backend prerequisites. |
| [#50](https://github.com/AdelinPOA/xpenses-kotlin/issues/50) | Fullscreen receipt viewer/shared modal lifecycle: F19, after #47/#48 integration. |
| [#51](https://github.com/AdelinPOA/xpenses-kotlin/issues/51) | Consolidated visual evidence and physical iPhone gate: F34/F35. |

F01 must map newly discovered cross-role work to existing matching issues or create focused issues when none exists. Record those links beside the affected tasks; this local tracker must not become a competing specification.

## Suggested execution order

1. F01, then verify the existing visible milestone F12 promptly. F02 investigation and independent F17 bulk fixes can proceed alongside it with separate ownership.
2. Fix financial/action/error defects: F03–F09 and F11; coordinate shared dashboard/locale files.
3. Recovery F10/F16 → F18 once its contract is ready; F19 after its UI prerequisites. Essential account safety/accessibility can proceed independently.
4. Finish role-specific usability and remaining P2 tasks; apply F29–F32 during each UI change, not as cleanup deferred until the end.
5. F33–F36 consolidate regression, visual evidence, physical acceptance and final handoff. Automated checks run incrementally throughout.

## Checklist

### Foundation

- [ ] **F01 — Rebaseline, claim ownership and reconcile tracking.** `TODO` · **P1** · Owner: unassigned · Depends: none.
  - Read current issues/diffs and record which agent owns each shared file. Link the new audit findings to canonical issues; avoid duplicating #44–#51 or replacing the broader `todo.md`.
  - Starting evidence: `docs/ux/mobile-ios-review/README.md`, `EXECUTION.md`, `issue-47/EVIDENCE.md`; optional role-audit artifacts in `/tmp/xpenses-frontend-audit/`.
  - **Accept:** current branch/diff baseline, issue links, owned files and baseline checks recorded. If `/tmp` evidence is absent, reproduce from the examples below; it is not a prerequisite for starting.

- [ ] **F02 — Resolve durable verification/OCR integration contract.** `TODO` · **P1** · Owner: unassigned · Depends: F01 · Issue: #46.
  - Follow #46: inspect actual backend availability and #35–#43 decisions; specify persisted verification, edited-field retention, online/offline confirmation, cancellation/expiry, ownership/version conflicts and historical/manual-Expense compatibility.
  - Reconcile ADR-0004's navigation conflict with #45 without weakening background processing. Identify concrete API/DTO/migration prerequisites; this checkpoint is investigation/design, not a speculative backend rewrite.
  - **Accept:** selected transition/failure contract and tests published; #49 has concrete prerequisites and no implementation-shaping ambiguity. Financial status and report-submission rules remain unchanged.

### Fix-first: money, failed actions and misleading states

- [ ] **F03 — Show the correct net reimbursable balance.** `TODO` · **P1** · Owner: unassigned · Depends: F01.
  - Paths: `frontend/app/payments/page.tsx`, `frontend/app/reports/[id]/ReportDetailClient.tsx`; verify `backend-kotlin-jpa/.../services/mapper/ReportMapper.kt`.
  - Use authoritative `total_reimbursable` for payment context; show Expenses + daily allowance + mileage − paid Advances with Technician/report identity and a report-detail link. Keep Expense totals separately labelled.
  - **Accept:** consistent fixture (€1,250 Expenses + €180 allowance − €500 paid Advances) shows **€930 net**; also test mileage and zero/negative balances under existing domain rules. Do not change frozen FX or imply a bank transfer occurs.

- [ ] **F04 — Repair CFO payment layout on narrow screens.** `TODO` · **P1** · Owner: unassigned · Depends: F01; coordinate F03/F05.
  - Path: `frontend/app/payments/page.tsx`. At 375px the title area measured **9px**; at 320px document width was **326px**.
  - Stack identity, amount/breakdown and full-width action on mobile; retain an efficient desktop row/table. Long titles/dates and Romanian labels must remain readable.
  - **Accept:** 320/375/390px, EN/RO, both themes: no document overflow, amount collision or internally collapsed identity; action target at least 44px high. Geometry assertions and screenshots cover more than `scrollWidth`.

- [ ] **F05 — Make recording report payment deliberate and recoverable.** `TODO` · **P1** · Owner: unassigned · Depends: F03/F04.
  - Paths: Payments and Report detail. Replace one-click “Mark as paid” with a confirmation containing report, Technician and exact net balance; cancel performs no mutation.
  - Disable repeat actions while pending; show success/failure, preserve review context and refresh relevant queries only on acknowledged results. Explain that this records payment status, not a bank transfer.
  - **Accept:** both entry points have equivalent confirmation; rejected/delayed requests cannot look successful or send repeated clicks. Ordinary report approval is unaffected.

- [ ] **F06 — Fix the dashboard Advance payment action.** `TODO` · **P1** · Owner: unassigned · Depends: F01.
  - Paths: `frontend/app/dashboard/DashboardClient.tsx`, `frontend/components/dashboard/PendingAdvancesList.tsx`, `frontend/app/advances/page.tsx`; contract: `backend-kotlin-jpa/.../dto/report/AdvancePayBody.kt`.
  - Current shortcut POSTs no body. Reuse a contextual payment form collecting amount, currency and date (amount/date required; currency currently defaults to EUR). Label it “Record advance payment,” not ambiguous “Approve.”
  - **Accept:** request matches the real DTO, selected Technician/report is visible, required-field errors precede submission, pending actions are disabled, failures are actionable/localized, and success updates dashboard/Advance state. Coordinate the shared form with F25.

- [ ] **F07 — Separate loading, error, stale and truly empty reads.** `TODO` · **P1** · Owner: unassigned · Depends: F01.
  - Paths: Dashboard, Expenses, Reports, Advances, Payments, Approvals, Users and `frontend/components/reports/ReportReceiptsDrawer.tsx`.
  - A dashboard HTTP 500 currently renders “All Clear!”/“All requested travel advances have been processed.” Some other screens show an error and an empty-success state simultaneously.
  - **Accept:** delayed first load, HTTP failure, retry recovery, successful empty data and stale cached/offline data each render honestly on all affected surfaces. Failure never becomes zero money/no pending work/no Receipts; stale data is identified, not silently discarded.

- [ ] **F08 — Fix Capture original-currency/EUR display.** `TODO` · **P1** · Owner: unassigned · Depends: F01; coordinate F02/F18 ownership.
  - Path: `frontend/app/expenses/capture/page.tsx`; current feed assigns `scanned.amount` to `amountEur`. Use the promoted Expense's canonical `amount_eur`; label original amount/currency separately where shown.
  - **Accept:** a 100 RON OCR source is never displayed as €100 merely by relabelling; EUR and another foreign-currency case use authoritative saved values. Loading before promotion has an honest amount state and performs no duplicate Expense creation.

- [ ] **F09 — Use one report-submission preflight everywhere.** `TODO` · **P1** · Owner: unassigned · Depends: F01.
  - Paths: `frontend/app/reports/ReportsClient.tsx`, `frontend/app/reports/[id]/ReportDetailClient.tsx`. List Send currently bypasses the detail receipt audit and has no visible failure explanation.
  - Reuse existing preflight/confirmation semantics, validation and success/error handling from both mobile cards and desktop actions; preserve authorization and existing submission rules.
  - **Accept:** identical report produces equivalent preflight from list/detail; cancel sends nothing; a 400/500 stays recoverable with visible feedback; repeated taps while pending do not submit again.

- [ ] **F10 — Resume/count pending OCR work application-wide.** `TODO` · **P1** · Owner: unassigned · Depends: F02; coordinate F16.
  - Paths: `frontend/components/OfflineSyncProvider.tsx`, `frontend/lib/ocrSourceQueue.ts`, `frontend/lib/expenseSaving.ts`, capture page and `ExpenseForm.tsx`.
  - Current global recovery/count covers Expense-save work but not OCR sources resumed only by capture/form routes. Share lifecycle ownership so mount/focus/reconnect can recover accepted work from another route; count logical pending items without double-counting a promoted job.
  - **Accept:** capture offline → navigate to Dashboard/Reports → reconnect resumes without reopening Capture; global count converges correctly; repeated events/tabs and account switching preserve owner isolation/known IDs. Keep authenticated API responses out of service-worker HTTP caches.

- [ ] **F11 — Remove selected-Expenses toolbar/navigation overlap.** `TODO` · **P1** · Owner: unassigned · Depends: F01; coordinate #47.
  - Paths: `frontend/app/expenses/ExpensesClient.tsx`, `frontend/components/layout/AppShell.tsx`. At 768×1024, toolbar y=942–1001 intersects bottom navigation y=960–1024.
  - Share a safe-area-aware offset and align the toolbar's breakpoint with bottom-navigation visibility (`lg` in the audited shell), including short landscape layouts.
  - **Accept:** selection actions and all bottom tabs are separately reachable at 375/390/640/768/844/1023px widths; no intersections with controls, and desktop positioning remains sensible.

### Technician

- [ ] **F12 — Verify/finish the compact Expense layout milestone.** `VERIFY` · **P1** · Owner: unassigned · Depends: F01 · Issue: #47.
  - Existing implementation evidence: `docs/ux/mobile-ios-review/issue-47/EVIDENCE.md` records list first row y=207 and New Expense amount y=297 at 375px. Preserve these improvements and verify the current dirty tree rather than rebuilding the layout.
  - Check compact receipt header, amount/currency priority, optional details, one primary Add action, secondary Export/Bulk actions, accessible filter disclosure and URL/back/forward/reset/pagination behavior. Download controls inside forms must not submit; busy scanning prevents overlaps.
  - **Accept:** #47 criteria hold: first list row y≤300 and two complete ordinary rows above navigation; amount input y≤300 at 375×667 under the defined fixture; no hidden amounts/clipped labels; desktop and failure/filter states retained. Record current evidence and reconcile issue status.

- [ ] **F13 — Make cross-page Expense selection totals truthful.** `TODO` · **P2** · Owner: unassigned · Depends: F01.
  - Path: `frontend/app/expenses/ExpensesClient.tsx`. Selected IDs persist across pages but sum is calculated from current-page data.
  - Preserve cross-page selection with authoritative selected-record totals; selected count, displayed EUR total and submitted IDs must describe the same set. Handle filtering, clear, pagination and records that become ineligible explicitly.
  - **Accept:** select records on at least two pages, change page/filter, deselect and create an ExpenseReport: count/total/IDs agree. Do not silently change to page-local selection without a recorded product decision.

- [ ] **F14 — Correct Technician dashboard metric semantics.** `TODO` · **P2** · Owner: unassigned · Depends: F01.
  - Paths: `frontend/app/dashboard/DashboardClient.tsx`, `frontend/components/dashboard/ExpenseStatusOverview.tsx`.
  - Distinguish Approved from Paid, align card counts/amounts/filter links, and calculate the gauge from the same entity type and period. Pending amount/count/link must describe the same statuses. Remove hard-coded English through F32.
  - **Accept:** consistent fixtures prove status labels, drilldowns and percentages agree; zero data works. Preserve the intentional **Last Order / Report** meaning of Total Spend rather than relabelling it a monthly total.

- [ ] **F15 — Verify/finish Expense detail navigation and mobile form safety.** `VERIFY` · **P1** · Owner: unassigned · Depends: F01 · Issue overlap: #44.
  - Paths: Expenses list/detail, dashboard recent/category rows, `frontend/app/reports/new/page.tsx`. Provide real keyboard-accessible Expense detail links, including desktop non-draft rows; preserve edit access separately.
  - Reconcile #44 receipt-download endpoint/history fallback/OCR-metadata and Report-creation unsaved-edit guard work. Do not duplicate already-shipped fixes. Keep row selection/action clicks distinct from navigation.
  - **Accept:** mouse/keyboard and mobile users can open/view/download and return from list/search/dashboard; failed downloads explain recovery; dirty Report creation protects title/dates/description/selected Expenses on supported leave paths. Record genuine swipe-back/device limitations in F35.

- [ ] **F16 — Retain failed captures and expose per-item recovery.** `TODO` · **P1** · Owner: unassigned · Depends: F02; coordinate F10.
  - Paths: capture page, `ExpenseForm.tsx`, `OfflineQueuePanel.tsx`, OCR queue/capture modules.
  - Give queued/failed items clear progress, Retry, explicit Discard and retained-photo manual completion. Inspect the current permanent-failure branch that removes the persisted source; apply #46 retention/cancellation/expiry semantics instead of silently losing recovery data.
  - **Accept:** network/OCR/upload/auth/quota failures stay distinguishable; reload preserves eligible work, retry reuses acknowledged IDs and discard affects only the selected owner's work. Test discard versus in-flight completion and explain expired/unrecoverable sources honestly.

- [ ] **F17 — Deliver readable bulk editing and truthful bulk recovery.** `TODO` · **P1** · Owner: unassigned · Depends: F01 · Issue: #48.
  - Paths: `frontend/components/expenses/BulkReviewDrawer.tsx`, `BulkUploadZone.tsx`. Implement #48's per-row identity/edit layout, real upload/partial/empty/failure states, acknowledged save status, retry and delete failure behavior.
  - Retain attempted edits across failures; serialize/version saves so stale responses cannot mark newer values saved. Validate file type/count/size with actionable feedback; unsupported HEIC must not be silently dropped or falsely claimed converted.
  - **Accept:** at 375/390px, amount width ≥96px and currency ≥80px; `1234.56`/date readable. Cover all-failed 500, mixed results, rejected/out-of-order edits, failed delete and closing with unsaved edits. Retry known work without blind whole-batch duplication claims.

- [ ] **F18 — Integrate resumable immediate verification.** `BLOCKED` · **P1** · Owner: unassigned · Depends: F02/F12 and #46's backend prerequisites · Issue: #49.
  - **Unblock:** accepted #46 contract and #47 foundation, with required backend work integrated. Recheck current issue dependencies, not just this snapshot.
  - Converge equivalent Add entry points on Photo/File/Manual. Flow: retained source/draft → immediate verification → explicit confirmation → Expenses with item highlighted; secondary “Confirmă și scanează următorul” confirms before reopening capture.
  - **Accept:** #49 criteria pass for interrupted OCR/edits, reload, offline confirmation, response loss, known-ID retries, historical/manual Expenses and account switch. Preserve Report association/manual FX; highlighted item is visible despite prior filters/page; confirmation failure never navigates as success. Verification is durable and separate from financial status.

- [ ] **F19 — Deliver fullscreen Receipt viewing and shared modal lifecycle.** `BLOCKED` · **P2** · Owner: unassigned · Depends: F12/F17 · Issue: #50.
  - **Unblock:** #47/#48 shared form/drawer integration. Design may proceed separately; serialize overlapping implementation.
  - Paths: `ReceiptPreview.tsx`, `ExpenseForm.tsx`, `BulkReviewDrawer.tsx`, `ReportReceiptsDrawer.tsx`; reuse sound `Sidebar.tsx` behavior and `useBodyScrollLock.ts` rather than designing a framework.
  - **Accept:** compact thumbnail opens fullscreen mobile viewer; close/selector/zoom/reset are reachable and labelled. Focus trap/restore, Escape, background inertness and nested scroll-lock cleanup work; edits/scroll survive dismissal. Preserve actual PDF capability and provide non-gesture alternatives; physical pinch/VoiceOver remain F35.

### MOD / administration

- [ ] **F20 — Give MOD an administration-focused home/navigation.** `TODO` · **P2** · Owner: unassigned · Depends: F01; coordinate F23.
  - Paths: `frontend/components/layout/AppShell.tsx`, Dashboard, admin routes. Prioritize authorized Users/Integrations/operational work rather than dominant Capture; keep personal Expenses and Profile accessible through secondary navigation.
  - Use existing truthful operational data or clear shortcuts; do not invent health/queue metrics if no endpoint exists. Define the final translated labels/destinations in the linked issue.
  - **Accept:** desktop and mobile expose MOD's actual tasks directly; Technician/Manager navigation is preserved; hidden and direct routes still respect existing server permissions.

- [ ] **F21 — Make account changes safe and understandable.** `TODO` · **P1** · Owner: unassigned · Depends: F01.
  - Path: `frontend/app/admin/users/UsersClient.tsx`. Add user-specific labels to role selectors; show old/new role or target account in confirmation for privilege/deactivation changes.
  - Include pending, success and error feedback; on failure restore/retain the truthful saved state. Preserve self-role/deactivation protections and block repeat mutations while pending.
  - **Accept:** role/active-state failures and cancellation are visible/tested in desktop table and mobile cards; success updates the right account; keyboard/assistive names identify the target. Touch geometry is completed under F31.

- [ ] **F22 — Improve directory browsing and role terminology.** `TODO` · **P2** · Owner: unassigned · Depends: F01; coordinate F21/F32.
  - Add name search, role/active/auth-source filters where supported, pagination and explicit result counts/reset. Keep selection/filter behavior stable after account updates.
  - Standardize MOD's displayed name (currently Administrator versus Moderator) through one agreed label in both locales; keep API role identifiers unchanged.
  - **Accept:** representative multi-page data, no matches, failed requests, long names and RO labels remain usable on mobile/desktop; filtering/pagination neither hides changes silently nor grants broader data access.

### CFO / finance

- [ ] **F23 — Give CFO a finance-first dashboard/navigation.** `TODO` · **P2** · Owner: unassigned · Depends: F03; coordinate F20.
  - Prioritize Dashboard / Approvals / Payments / Reports / More (translated and adapted to existing navigation), with Profile/Advances/personal capture still accessible.
  - Show awaiting-payment workload, net EUR balance and age using real data, distinct from approved/paid status. Use report context plus Receipt access for review; desktop may use a selected-report panel and mobile a focused sheet.
  - **Accept:** CFO can reach review/payment work without the burger detour; figures reconcile to backend fields; unavailable data has an honest state. No invented metrics, duplicated payment mutations or unwanted Manager KPI dashboard.

### Manager and shared Advance workflows

- [ ] **F24 — Keep the Manager Work Hub compact and actionable.** `TODO` · **P2** · Owner: unassigned · Depends: F01; preserve #23.
  - Paths: Dashboard, `PendingReportsTable.tsx`, `PendingAdvancesList.tsx`, Approvals. Keep pending ExpenseReports first, Advances second, activity last; add compact queue jumps/counts and waiting-age cues.
  - Keep `/approvals` the primary decision workspace and `/reports` the browser/archive. Reduce unnecessary preview expansion/card sprawl without hiding decision context or restoring KPI-first content.
  - **Accept:** mobile users can discover/jump to pending Advances without traversing every expanded report; desktop remains scannable; direct single approval and required rejection reason remain intact. Derive age from real dates and test zero/large queues.

- [ ] **F25 — Keep Advance payment/rejection attached to its context.** `TODO` · **P1** · Owner: unassigned · Depends: F06.
  - Path: `frontend/app/advances/page.tsx` and relevant dashboard actions. Current payment form appears after the whole queue without focus/identity; rejection immediately sends an empty reason.
  - Use an inline panel or focused sheet showing Technician, ExpenseReport and requested amount. Move focus to it; collect an explicit Rejection Reason for rejection, show pending/error feedback and retain inputs on failure. Verify API persistence/authorization rather than merely sending an ignored field.
  - **Accept:** with a long queue, the selected action and identity are visible on mobile/desktop; cancel sends nothing; failure is recoverable; successful payment/rejection refreshes the correct item across all authorized roles.

- [ ] **F26 — Make Global Search scope and mobile access truthful.** `TODO` · **P2** · Owner: unassigned · Depends: F01.
  - Paths: `frontend/components/ui/SearchDropdown.tsx`, `frontend/app/search/page.tsx`, shell; verify backend `SearchController.kt`. Current `{q}` requests default to personal records even for Managers.
  - Add explicit authorized My/Company scope consistently to dropdown/full results and a mobile entry point; preserve grouped results. Fix “See all” so truncation in any category exposes a route to the remaining results, not only when combined count exceeds ten.
  - **Accept:** a Manager finds another Technician's permitted record in Company scope; personal scope stays personal; unauthorized roles cannot widen scope. Six results in one category expose the sixth via See all; query/scope survive navigation and keyboard use.

- [ ] **F27 — Make report export match its stated scope.** `TODO` · **P2** · Owner: unassigned · Depends: F01.
  - Path: `frontend/app/reports/ReportsClient.tsx`; verify export API support. Owner/text filters currently affect visible data but export sends only format/all/status.
  - Default filtered export must include active owner/text/status/scope filters. If offering unfiltered export, name it explicitly “Export all”; implement necessary filter contract rather than implying the visible subset was exported.
  - **Accept:** CSV/XLSX contain exactly the expected records for combined filters and permissions, including across pagination; current-scope and all-scope choices are distinguishable; errors are visible.

- [ ] **F28 — Make the activity stream describe real facts.** `TODO` · **P2** · Owner: unassigned · Depends: F01.
  - Paths: `frontend/components/dashboard/RecentActivityStream.tsx`, backend Dashboard mapping. `report_updated` currently falls through to submitted; record owner can be presented as approval/payment actor.
  - Prefer “Recently updated ExpenseReports” with current status/owner/time until genuine actor events exist. Only use performed-action wording when the source supplies that actor/event; a new event system is not required for this fix.
  - **Accept:** draft updates, submissions, approvals and payments have truthful wording; an owner is never claimed to have approved/paid merely because they own the ExpenseReport. EN/RO agree.

### Shared accessibility, responsive behavior and language

- [ ] **F29 — Make review/list controls keyboard and screen-reader usable.** `TODO` · **P1** · Owner: unassigned · Depends: F01; coordinate F15/F19/F21.
  - Paths: `PendingReportsTable.tsx`, Reports list, Expense/dashboard drilldowns and receipt/rejection drawers. Replace visual-only selection controls with accessible stateful controls; expose expansion state/relationships and labelled report links.
  - Sort headers need keyboard-operable buttons and correct `aria-sort`; icon actions need names tied to the record. Apply shared modal focus/Escape/inertness/restoration to bulk rejection and receipt review, not just the sidebar.
  - **Accept:** complete keyboard selection/sort/review/rejection flows work, focus is visible/restored, axe flags for unnamed controls are resolved, and background content cannot be operated through an open modal. Physical VoiceOver remains a separate gate.

- [ ] **F30 — Correct semantic contrast in both themes.** `TODO` · **P1** · Owner: unassigned · Depends: F01; coordinate #47.
  - Paths: `frontend/app/globals.css`, badges, dashboard/approval controls, sidebar and related components. Audit examples: amber status **1.97:1**, green approval text **3.69:1**, Directory label **3.74:1**.
  - Fix shared foreground/background tokens and component usage, not arbitrary global orange-button recoloring. Preserve the palette and distinguish financial statuses with text as well as color.
  - **Accept:** normal text reaches 4.5:1; large text and applicable non-text controls reach their WCAG thresholds; light/dark, hover/focus/selected/error states pass targeted axe plus visual inspection without new failures.

- [ ] **F31 — Standardize touch targets and mobile editable typography.** `TODO` · **P1** · Owner: unassigned · Depends: F01 · Issue overlap: #44/#47.
  - Cover MOD deactivate (28×28), Manager Advance actions (28–30px high), payment action (36px high), bulk selection/clear/create and icon links throughout touched workflows.
  - Use ≥44×44 CSS px action hit regions and ≥16px editable text on targeted mobile layouts, including **844×390 landscape** where `sm:` styles may otherwise shrink inputs. Keep real focus/scroll paths and safe-area offsets.
  - **Accept:** geometry/font assertions cover portrait/tablet/landscape and long RO labels, without shrinking content to hit density goals or introducing overlapping hit regions. Keyboard/browser-bar behavior is checked on device in F35.

- [ ] **F32 — Finish consistent EN/RO copy and state vocabulary.** `TODO` · **P2** · Owner: unassigned · Depends: F01; update alongside every task.
  - Paths: `frontend/messages/en.json`, `ro.json` and touched components. Translate Expense status overview and remaining hard-coded copy; eliminate raw keys such as `common.error` and ambiguous Approved/Paid/Save/Confirm wording.
  - Keep original currency/EUR amount, local saved/server saved, verification/financial status and payment recording distinct. Use the agreed MOD name from F22; provide localized accessible labels and actionable errors.
  - **Accept:** translation parity passes; all four roles have coherent EN/RO copy in normal, loading, empty, error, pending and recovery states. Long translations reflow; no English-only fallback or raw key hides a failure.

### Regression, evidence and handoff

- [ ] **F33 — Complete automated and isolated integration regression.** `TODO` · **P1** · Owner: unassigned · Depends: affected implementation tasks; run incrementally.
  - Add regression tests for each defect and its failure path; cover all four roles and authorization boundaries. Reuse repo fixtures but correct invalid `active`/`is_active` shapes and inconsistent money totals before drawing conclusions.
  - Run frontend typecheck, lint, i18n parity, build and relevant Playwright projects/specs; consult current `frontend/package.json`/config for commands. Run active LSP diagnostics on changed code and applicable backend/controller/migration/concurrency tests when contracts change.
  - **Accept:** commands, environment, pass/fail/skipped results and pre-existing failures are recorded. Delayed/rejected/out-of-order mutations, double taps, owner switches, lost responses and known-ID reuse are covered where relevant. Mocked UI success is supplemented by isolated backend contract checks for changed actions; no full-suite claim from a subset.

- [ ] **F34 — Produce same-data visual evidence for every role.** `TODO` · **P1** · Owner: unassigned · Depends: corresponding UI tasks · Issue overlap: #51.
  - Baselines are captured before each UI change. Compare EN/RO × light/dark at **375×667, 390×844**; regression checks at **320×568** (Payments), **768×1024** (selected Expenses), **844×390** landscape and **1280×800 or wider** desktop.
  - Cover Technician list/form/capture/review/bulk/viewer; MOD dashboard/directory; CFO dashboard/payments/approvals; Manager Work Hub/Review Queue/reports/Advances/search. Include empty/error/pending/long-content states and keyboard/axe evidence.
  - **Accept:** persistent evidence location linked here/issues, consistent fixtures, before/after measurements (positions, widths, complete rows, contrast, control intersections) and manual visual critique. Snapshot regeneration or zero document overflow alone is not acceptance. Respect privacy in screenshots.

- [ ] **F35 — Pass the real iPhone Safari/PWA acceptance gate.** `BLOCKED` · **P1** · Owner: human/device tester needed · Depends: #47/#48/#49/#50 implementation and F33/F34 evidence · Issue: #51.
  - **Unblock:** ready build in an isolated environment plus a physical iPhone and human tester; record model/iOS version. Mark ready-for-human in the issue when implementation blockers are resolved.
  - Test Safari and installed PWA: portrait/landscape, dynamic bars/safe areas, keyboard field/action visibility, camera/library/PDF, denied permissions/cancel/unsupported files, VoiceOver, enlarged text, viewer zoom/close and scroll restoration.
  - Test real service-worker cold start and online→offline→reload→reconnect, background/return during OCR and edits, retries and account switch. Default mocked Playwright contexts block service workers and do not establish these guarantees.
  - **Accept:** each check recorded Pass/Fail/Not tested with evidence; unresolved failures or unavailable hardware keep this task open. Emulated WebKit is never reported as physical iPhone verification.

- [ ] **F36 — Reconcile delivery status and hand off remaining work.** `TODO` · **P2** · Owner: unassigned · Depends: completed implementation and F33–F35 for full acceptance.
  - Link owned changes/commits, test results and visual evidence; synchronize canonical issues and this summary. Keep parent #45/#51 open until their full criteria are accepted; do not close them merely because one local checkpoint passes.
  - **Accept:** every completed task has evidence, remaining work/blockers have an owner/next action, and current branch/diff is documented without overwriting others. If physical acceptance is blocked, hand off honestly rather than declaring full completion. Deployment remains separately authorized.

## Definition of done for implementation tasks

A task is `DONE` only when all its acceptance bullets hold, its regression test(s) pass, applicable frontend/backend checks pass (or pre-existing failures are explicitly separated), EN/RO and light/dark remain usable, and the tracker/issue include evidence. UI changes require relevant same-data screenshots and manual inspection. Physical-device claims require F35 evidence; automated completion may be recorded independently without claiming physical acceptance.

## Audit evidence and known limits

The role audit exercised **32 mocked browser/page configurations** in Chromium/WebKit and four focused action/error scenarios. Automated accessibility findings occurred in 20 configurations; these are not 20 unique defects or a full accessibility certification. Browser-confirmed examples: payment title collapse, tablet toolbar overlap, unnamed MOD role selectors/desktop report links, dashboard HTTP-500 false All Clear, bodyless Advance payment request, and silent rejected report-list submission. Capture FX and route-scoped OCR recovery were established from code, not physical-device/offline execution.

Optional artifacts from that session: `/tmp/xpenses-frontend-audit/REVIEW.md`, `results.json`, `interactions.json`, screenshots and temporary audit scripts. This directory is ephemeral and may be absent in another checkout. Persistent prior mobile evidence is under `docs/ux/mobile-ios-review/`; refresh evidence for the current tree rather than treating old results as current proof.

No production transaction, physical iPhone run or release was performed by the review or this planning handoff.

## Progress log — append, do not replace history

| UTC date/time | Task | Transition / evidence | Owner | Next action / blocker |
| --- | --- | --- | --- | --- |
| 2026-09-19 | Planning | Created this 36-checkpoint handoff; no implementation newly accepted. Read current #44–#51 and existing #47 evidence. | Review agent | Implementing agent starts F01; existing unrelated work preserved. |

<!-- Append one row for each start, blocker, verified completion or handoff. Example: YYYY-MM-DDTHH:MMZ | F03 | IN PROGRESS -> DONE; test command/result; evidence path; commit if any | owner | F05. Keep top summary synchronized. -->
