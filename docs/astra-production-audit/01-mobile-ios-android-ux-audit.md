# Mobile iOS / Android UX audit

> **Baseline report:** source findings and line numbers below refer to `87bec5a15457c3c74ebec613f2459ac1306093a5` (2026-09-06). Another workstream subsequently changed application code. Read the current-state reconciliation in `00-executive-summary.md` before treating a finding as still present. Reconciled HEAD: `bdb6fcba9845be7053b0087253bb4a1c191d96e3` (2026-09-07). Coordinated browser runs passed the mocked public login axe/overflow check at 412×849 in Chromium and WebKit; **all authenticated cases were skipped**. Thus the login matrix's 412 NV is narrowed only by that public-page check, not full session/device verification. No physical-device or fresh screenshot sign-off is claimed.

## Verdict and evidence boundary

**Not ready for mobile field-user sign-off.** Current source contains a broken primary expense navigation path, unsafe partial-save/replay behavior, inconsistent form and modal accessibility, and mobile regressions that the default mobile test command does not exercise.

This is a **source-based audit**, not a physical-device UAT or a fresh visual/browser run. No screenshots were captured by this reviewer. Historical screenshots in `frontend/tests/**` are not proof of current behavior. The coordinated safe-check results belong in `06-test-and-verification-plan.md`. Source-confirmed findings below explicitly distinguish device/layout hypotheses.

Read alongside `02-frontend-audit.md` for financial save/replay defects FE-001–005, fetch/mutation feedback FE-008 and mobile-test gate FE-011. Security SEC-002/003 (account-isolated offline data) and SEC-004 (session expiry/refresh) are prerequisites to claiming reliable iPhone/Android support.

## Route coverage matrix

The route and component inventory is complete in `02-frontend-audit.md`. **NV** means browser/device verification not performed for that width. Static review does not establish absence of overflow, adequate keyboard handling, contrast in all states or screen-reader usability. Each NV cell requires both Chromium/Android-sized and WebKit/iOS-sized verification, English/Romanian, light/dark, realistic populated/error states; real-device keyboard/camera/PWA tests are additional.

| Flow / routes | Source review | 360 | 390 | 412 | 430 | Specific device verification |
|---|---|---|---|---|---|---|
| Login, logout, session expiry `/`, `/login` | Detailed login/AuthProvider/chrome | NV | NV | NV | NV | Password manager, keyboard, 60-min expiry, offline foreground, deep-link recovery |
| Technician and manager `/dashboard` | Detailed client, queues, receipts | NV | NV | NV | NV | Recent-expense navigation, loading versus zero, pending review/bulk actions, sticky FAB |
| `/expenses` | Detailed populated/error/filters/actions/export | NV | NV | NV | NV | Multi-receipt cards, 3s delete confirmation, Undo, narrow action row, URL/back behavior |
| `/expenses/new`, `/expenses/[id]/edit` | Detailed shared ExpenseForm/FX/preview | NV | NV | NV | NV | Keyboard save bar, decimal keyboard, OCR cancel, filename download, receipt-tab scrolling |
| `/expenses/capture` | Detailed full capture control flow | NV | NV | NV | NV | iOS/Android camera and file picker, HEIC/JPEG/PDF, upload failure, offline repeated capture |
| `/reports` | Detailed list, filters, delete, submit | NV | NV | NV | NV | Manager action header, lengthy Romanian copy, focus in delete dialog, quick-submit failure |
| `/reports/new`, `/reports/[id]/edit` | Detailed forms and mutation flow | NV | NV | NV | NV | Required date validation, keyboard fields, dirty back navigation, attach partial success |
| `/reports/[id]` | Detailed lifecycle/evidence/mobile cards | NV | NV | NV | NV | Submit/reject/sign/pay, large totals, receipt downloads, translated decision labels |
| `/reports/[id]/advances`, `/reports/[id]/mileage` | Targeted form/mutation/mobile-card review | NV | NV | NV | NV | Datetime keyboard, silent invalid values, small delete controls, error feedback |
| `/approvals` | Detailed manager queue/rejection/evidence | NV | NV | NV | NV | Error versus all-clear, rejection keyboard, receipt drawer focus/scroll/safe areas |
| `/advances`, `/payments` | Targeted mobile cards/actions/error review | NV | NV | NV | NV | Payment/rejection confirmation and pending/error recovery, large amounts |
| `/profile`, `/profile/signature` | Detailed forms/canvas/output path | NV | NV | NV | NV | Autofill, rotation, dark signature on white export, saving/error announcements |
| `/profile/[id]` | Targeted directory/profile/report-summary review | NV | NV | NV | NV | Long display/email names, report-summary modal, read errors |
| `/insurance`, `/categories` | Targeted forms/mobile actions | NV | NV | NV | NV | Upload dialog labels, small delete controls, narrow file/card content |
| `/search` | Targeted result routes and shared dropdown | NV | NV | NV | NV | Expense result navigation; keyboard and empty/error result behavior |
| `/admin/users`, `/admin/settings` | Targeted server/client, fields/errors | NV | NV | NV | NV | Role-gated mobile directory/config, labels, large tables/values |
| `/admin/email`, `/admin/imap`, `/admin/ldap` | Targeted field/form/layout review | NV | NV | NV | NV | Long hosts/DNs, credential fields, test buttons, simulator result overflow |
| `/admin/ocr`, `/admin/receipts`, `/admin/storage` | Targeted forms/table/cleanup review | NV | NV | NV | NV | Connection/review tables, confirmation focus, long paths/provider errors |

Admin routes are discoverable on mobile through Sidebar for the applicable mod/manager/finance roles; hiding them from the bottom bar is not exclusion from the mobile scope. Read-only targeted review of secondary/admin screens is not a claim that every interaction was executed.

## Existing improvements worth preserving

- `AppShell.tsx:39–95` uses `min-h-dvh`, top/bottom safe-area spacing, 44px menu/profile controls, 64px bottom links and `aria-current`. `app/layout.tsx:33–41` sets viewport-fit cover and does not disable zoom.
- Login has associated labels, username/current-password autocomplete, no autocapitalization/correction and 44px form controls (`app/login/page.tsx:62–117`).
- Core expense fields use IDs, associated labels, decimal input mode, 44px minima and `text-base sm:text-sm` (`ExpenseForm.tsx:416–486`). Expense action buttons and filters largely gained 44px targets.
- SignaturePad resizes its backing store for DPR and preserves strokes on rotation (`SignaturePad.tsx:25–66`); this fixes the old fixed-400px canvas issue, but not signature color/export reliability (MUX-011).
- Mobile report/expense lists use stacked cards, receipt PDFs have a mobile open action instead of relying solely on iframe, and new expense save errors are announced with `role="alert"`.
- Sidebar already attempts focus trapping, Escape, body scroll lock and background inert. The remaining defects below are specific, not a recommendation to discard that work.

## Findings

### MUX-001 — Dashboard and search expense links navigate to a nonexistent route

- **ID:** MUX-001
- **Severity:** High
- **Area:** Mobile UX
- **Confidence:** Confirmed source/route inventory; browser reproduction not run.
- **Evidence:** `frontend/app/dashboard/DashboardClient.tsx:543,743` navigates to `/expenses/${e.id}` on desktop rows and mobile feed links. `frontend/app/search/page.tsx:126` and `frontend/components/ui/SearchDropdown.tsx:79` use the same path. Only `frontend/app/expenses/[id]/edit/page.tsx` exists; no `[id]/page.tsx` or matching redirect exists in `next.config.ts`/middleware.
- **User impact / production risk:** A technician taps a recent or searched expense and gets the not-found route instead of evidence/details. Non-draft expenses also have no proper read-only detail destination.
- **Recommended fix:** Implement one authorized read-only expense detail route, with draft edit action, and route all consumers through it; alternatively explicitly route drafts to edit while providing a real read view for posted items.
- **Acceptance criteria:** Every dashboard/search expense link opens the expected record for every status, with back navigation preserving list/search context; forbidden IDs show access handling rather than leaking data.
- **Suggested tests:** Tap recent expense and search result at all four widths, technician/manager roles, draft/submitted/paid; direct deep link and browser back.
- **Dependencies or sequencing:** Phase 1 blocker; keep backend ownership enforcement unchanged.

### MUX-002 — Closed sidebar remains keyboard-accessible; Romanian background navigation is not inert

- **ID:** MUX-002
- **Severity:** High
- **Area:** Mobile UX
- **Confidence:** Confirmed DOM/control logic; exact VoiceOver/TalkBack announcement and focus escape need device/browser verification.
- **Evidence:** `frontend/components/layout/Sidebar.tsx:135–145` hides a closed sidebar only with `-translate-x-full`, not inert/hidden/focus disabling. At `:70–75`, background bottom-nav lookup hardcodes `aria-label="Primary mobile navigation"`; `frontend/messages/ro.json:70` translates it to `Navigare mobilă principală`. Open focus is set to the aside itself (`Sidebar.tsx:78–79`), but Shift+Tab trapping at `:95–104` handles only first/last descendants, not the initially focused aside. `AppShell.tsx:21–24` recreates onClose and focuses the menu; effect dependencies include onClose.
- **User impact / production risk:** Invisible navigation controls enter tab/screen-reader flow; Romanian users can reach active background nav while drawer is open; initial backwards traversal may leave the modal context. Background route changes can lose form work.
- **Recommended fix:** Visibility-aware inert/hidden semantics for closed mobile sidebar without disabling desktop navigation; stable ID/data ref for background elements; complete focus containment from initial focus and stable callbacks; route-change/viewport-change cleanup.
- **Acceptance criteria:** Closed mobile sidebar has zero focusable descendants; open drawer traps forward/backward focus from every entry state; background is inert in both locales; Escape/close/backdrop restore focus; desktop remains accessible.
- **Suggested tests:** Tab and Shift+Tab from freshly opened aside in EN/RO; use VoiceOver/TalkBack swipe navigation; resize to desktop while open; close from route selection and canceled dirty navigation.
- **Dependencies or sequencing:** Phase 1; coordinate shared dialog primitives (MUX-006), not English text selectors.

### MUX-003 — Dirty navigation protection is partial and does not cover the browser back path

- **ID:** MUX-003
- **Severity:** High
- **Area:** Mobile UX
- **Confidence:** Confirmed guard scope; gesture/back behavior needs device execution.
- **Evidence:** `frontend/lib/useFormGuard.ts:17–42` registers only beforeunload and voluntary chrome interceptors from `navigationGuard.tsx`; no history/popstate interception or persisted form draft exists. Only `ExpenseForm.tsx:113` calls this hook. Report create/edit and signature pages do not register guards. `ReceiptPreview.tsx:100–116` uses same-tab raw anchors for fullscreen/PDF, bypassing shared navigation; `Sidebar.tsx:287–289` invokes logout without checking allowNavigation. `reports/[id]/edit/page.tsx:54–72` resets every field whenever query data changes, including background focus refetch.
- **User impact / production risk:** Android Back/iOS swipe-back, receipt opening, logout or switching away from report/signature pages can lose unsaved work. Returning from a camera/file picker can trigger data refresh that overwrites report edits.
- **Recommended fix:** Persist recoverable drafts and define consistent leave confirmation/restore policy across all financial forms and canvas; preserve dirty fields on background refetch. Protect same-tab evidence navigation or use a controlled viewer. Do not rely on beforeunload alone on mobile.
- **Acceptance criteria:** No silent loss after back gesture, picker return, refresh, offline foreground, logout or profile/signature navigation; successful saves do not leave stale guard prompts.
- **Suggested tests:** Fill report edits, trigger focus refetch with changed server data, navigate back/cancel; draw then rotate/back; test expense preview and bottom nav in browser and installed PWA.
- **Dependencies or sequencing:** Phase 1 with FE-005 offline policy; SEC-002 defines identity-isolated draft persistence. Browser gesture interception can vary, so recovery must not depend entirely on interception.

### MUX-004 — 44px targets and accessible action names are not consistently applied

- **ID:** MUX-004
- **Severity:** Medium
- **Area:** Mobile UX
- **Confidence:** Confirmed declared dimensions/semantics; final computed target-size sweep not executed.
- **Evidence:** `frontend/components/dashboard/PendingReportsTable.tsx:487–493` explicitly uses `w-8 h-8` (32px) toggle; receipt badge at `:120–126` uses min-h-6. `frontend/components/expenses/BulkReviewDrawer.tsx:117–123` close is p-2 + 20px icon (36px) without a name; row delete at `:326–334` is p-1.5 + 16px (28px). `ExpenseForm.tsx:497,511` receipt-removal buttons show only aria-hidden Camera icons, with no accessible name. `components/ToastProvider.tsx:109–119` close is a bare 16px icon with no name. `Sidebar.tsx:270–294` theme/logout are text-xs + py-2, not 44px. `app/approvals/page.tsx:152–198`, report/signature actions and category/mileage deletes similarly lack shared minima.
- **User impact / production risk:** Missed or adjacent taps in the field; screen-reader users cannot identify remove/close; destructive controls are particularly risky.
- **Recommended fix:** Shared 44×44 mobile control contract, enough inter-control spacing, and localized operation+record names; use trash/remove icon instead of camera for removal. Keep icon size independent from hitbox.
- **Acceptance criteria:** Every visible actionable control at 360/390/412/430 meets 44×44 except documented non-mobile exceptions; all icon-only buttons have operation-specific names. Controls do not overlap when target area expands.
- **Suggested tests:** Bounding-box sweep of populated drawers, report/approval/signature/admin forms, toast and all variants; axe names; actual one-handed tap check.
- **Dependencies or sequencing:** Phase 1; preserve already-remediated expense card and bottom navigation sizes.

### MUX-005 — Financial/admin forms lack consistent labels, real validation and announced errors

- **ID:** MUX-005
- **Severity:** High
- **Area:** Mobile UX
- **Confidence:** Confirmed markup/control-flow gaps; iOS focus zoom is a device-risk hypothesis.
- **Evidence:** `frontend/app/reports/new/page.tsx:76–145` has sibling labels without htmlFor/IDs and required date inputs outside a form. Create at `:184–190` checks only nonempty title; required dates never invoke browser form validation. `reports/[id]/edit/page.tsx:13–21,132–175` labels are unassociated and inputCls fixes text-sm even on mobile. `reports/[id]/mileage/page.tsx:71–75,147–200` silently returns for invalid dates/distance and mostly uses placeholders; advances forms are similar. Admin examples: `admin/email/page.tsx:205–267`, `ldap/page.tsx:273–411`, `imap/page.tsx:314–385`, `storage/page.tsx:258–362`, `users/UsersClient.tsx:166–220` have sibling labels without programmatic association; RHF register(name) is not a label association. Core ExpenseForm has one global alert but no per-field aria-invalid/describedby mapping for server validation. `ToastProvider.tsx:81–121` notifications have no alert/status/live region at all.
- **User impact / production risk:** Screen readers cannot navigate/edit reliably, invalid form actions seem inert, required date state is misleading, and financial failures/success/Undo may never be announced. 12–14px focused inputs can induce iOS zoom and make dense action areas harder to use.
- **Recommended fix:** Shared field primitive with IDs, labels, help/error association and error summary; real form submission, explicit date-range validation, server field error mapping; 16px mobile input typography; live status/alert toasts without over-announcing. Use consistent keyboard types/autocomplete where appropriate.
- **Acceptance criteria:** getByLabel works for all financial/admin fields; invalid submit focuses first invalid field and announces error; Enter submits once; required state is enforced; non-auth network failures are not labeled invalid credentials (`login/page.tsx:39–42`).
- **Suggested tests:** Empty/reversed dates, invalid decimal and server validation; getByLabel coverage; VoiceOver/TalkBack error announcement; keyboard/autofill at 360px; locale text-length expansion.
- **Dependencies or sequencing:** Phase 1/Phase 3 gates; backend validation stays authoritative (BE-011). FE-008 owns broader error-state behavior.

### MUX-006 — Active drawers/dialogs lack complete modal focus, scroll and safe-area contracts

- **ID:** MUX-006
- **Severity:** Medium
- **Area:** Mobile UX
- **Confidence:** Confirmed missing modal behaviors; actual clipping/overscroll needs device verification.
- **Evidence:** `frontend/components/reports/ReportReceiptsDrawer.tsx:119–135,257–265` supplies Escape but no dialog role/aria-modal, focus move/trap/restore, body lock, backdrop dismissal or safe-area padding. It uses h-full/fixed inset and a 40vh nested list (`:182–185`) plus a second preview scroller. `BulkReviewDrawer.tsx:104–123` locks body and has safe insets, but no focus management/dialog semantics/Escape. `ReportsClient.tsx:522–563` delete has dialog attributes but no trap, Escape, lock or restore; PendingReportsTable bulk reject has autofocus but not full modal behavior. `ProfileDetailClient.tsx` report-summary overlay is another independent implementation.
- **User impact / production risk:** Keyboard/screen-reader focus reaches background, underlying page scrolls during receipt review, headers/footers may be under notch/home indicator, and keyboard leaves constrained nested scroll areas.
- **Recommended fix:** One tested responsive dialog/drawer primitive implementing all behaviors and safe-area/dynamic-viewport layout; use contained scroll with a visible close/back action and appropriate dismissal policy for in-flight mutations.
- **Acceptance criteria:** Open/close/focus restoration works from touch/keyboard/screen reader, background remains inert and stationary, content is reachable with keyboard open, no bottom/top clipping in installed PWA or landscape.
- **Suggested tests:** Receipt/bulk/delete/rejection/profile dialogs, Escape, backdrop, Android Back policy, tab cycle and VoiceOver rotor, notched iPhone portrait/landscape, keyboard and repeated stacked dialogs.
- **Dependencies or sequencing:** Phase 1, MUX-002 shared implementation; do not treat unused SlideOverReviewDrawer as the live path.

### MUX-007 — Receipt mobile tabs are cosmetic and preview blocks normal scrolling

- **ID:** MUX-007
- **Severity:** Medium
- **Area:** Mobile UX
- **Confidence:** Confirmed layout/control logic; perceived scrolling severity needs device test.
- **Evidence:** `frontend/components/expenses/ExpenseForm.tsx:367–385` toggles Details/Receipt but only hides the form; ReceiptPreview at `:533–555` is rendered without tab visibility state. `ReceiptPreview.tsx:39,120–126` always renders an empty panel even on Details. At `:81` the full image interaction surface is `touch-none` regardless of zoom, while `ExpenseForm.tsx:115–121` refuses pan at zoom≤1. Thus a normal swipe starting on the 350px+ image cannot scroll the page or pan the image. Receipt tab hides the form containing upload/save actions.
- **User impact / production risk:** Users see preview under Details despite tab semantics, empty panel consumes field space, and swiping on a receipt feels stuck. Save/upload controls disappear in receipt-only view.
- **Recommended fix:** Wire actual tab panels (or remove unnecessary tabs), show preview only when useful, use native vertical scrolling at baseline zoom and deliberate pan/pinch behavior at zoom, and retain reachable workflow actions.
- **Acceptance criteria:** Exactly intended panel is exposed/focusable per tab; no empty preview below Details on narrow screens; normal scroll works when swiping receipt at 100%; zoom/pan/reset remain usable and labeled.
- **Suggested tests:** No-receipt and multiple-receipt form, switch tabs, scroll via image surface at each zoom; PDF open/recovery; saving while receipt tab selected.
- **Dependencies or sequencing:** Phase 1 alongside MUX-003 and FE-004; do not remove access to evidence on desktop.

### MUX-008 — Secondary text tokens fail normal-text contrast and motion lacks opt-out

- **ID:** MUX-008
- **Severity:** Medium
- **Area:** Mobile UX
- **Confidence:** Token contrast is calculated from source; full rendered-state axe and visual checks not executed.
- **Evidence:** `frontend/app/globals.css:9,17–18,27,35–36` defines light card #ffffff / muted-foreground #94a3b8 and dark card #151b2b / muted-foreground #64748b. WCAG relative-luminance calculation gives **2.56:1** light and **3.61:1** dark, below 4.5:1 for normal text. These tokens are used in 10–12px financial metadata, e.g. `ReportDetailClient.tsx:346–395`, `DashboardClient.tsx:645–663`. Primary #c2410c text on dark card is approximately 3.31:1. Global CSS and scanned app/components contain no reduced-motion override or motion-safe/motion-reduce modifiers, while empty receipt icon pulses (`ReceiptPreview.tsx:121`) and drawer/Toast/transforms animate.
- **User impact / production risk:** Dates, counts and secondary money labels are difficult to read outdoors and for low-vision users; unnecessary motion affects motion-sensitive users. Text size amplifies the contrast problem.
- **Recommended fix:** Semantic readable secondary/error/status tokens with measured light/dark contrast, larger mobile metadata where important; reduced-motion opt-out for nonessential motion. Keep status distinguishable beyond color.
- **Acceptance criteria:** Normal text ≥4.5:1 and large text/nontext UI applicable thresholds; no critical/serious axe contrast failures; reduced-motion stops decorative continuous/panning/transitions without removing functional progress information.
- **Suggested tests:** Both themes and locales, large currency values, full financial metadata states, forced reduced motion; daylight physical-device review. The simple source-token calculation is not a substitute for rendered contrast testing.
- **Dependencies or sequencing:** Phase 1 accessibility, Phase 5 design-token cleanup; do not prioritize decorative changes above financial/security gates.

### MUX-009 — Romanian flow retains English copy and report decisions use nonexistent translation keys

- **ID:** MUX-009
- **Severity:** Medium
- **Area:** Mobile UX
- **Confidence:** Confirmed source/message lookup; runtime rendering not executed.
- **Evidence:** `frontend/components/expenses/ReceiptScanner.tsx:89–103,121` hardcodes drag/drop/tap/formats/Take photo in English despite a translation hook; `BulkUploadZone.tsx:61–63,77–82` does likewise. Sidebar theme names/control text and close/sidebar labels are English (`Sidebar.tsx:43–44,159,271–279`). `ReportDetailClient.tsx:480,488` calls `t("common:approve")` / `t("common:reject")` while t is scoped to reports; neither EN nor RO reports object contains those keys (read-only JSON lookup confirmed), and `i18n/runtime.ts:13–28` falls back to raw namespace.key. `DashboardClient.tsx:234–236` forces en-US month; report/signature/mileage dates use browser default or en-GB instead of current locale. `i18n/LocaleProvider.tsx:73–76` updates format.ts's mutable locale only in an effect; immediate format consistency needs verification.
- **User impact / production risk:** Mixed-language field UX; manager can see raw `reports.common:approve` instead of an understandable decision label. English-only accessibility text breaks Romanian selectors (MUX-002) and assistive UX.
- **Recommended fix:** Use correct namespace hook and extract remaining user-facing/a11y strings; use locale-aware date-only/instant formatters consistently, with business timezone policy. Add used-key validation, not only EN/RO parity.
- **Acceptance criteria:** No raw translation keys or unexplained English flow instructions in Romanian; approvals/rejections have meaningful localized names; changing language updates labels and number/date formatting together.
- **Suggested tests:** Render all decision states and camera/bulk/admin controls in RO; fail on missing-message fallback; language switch without reload; verify month and date/currency formats.
- **Dependencies or sequencing:** Phase 1 for decision labels, Phase 5 copy consistency; FE-009 owns calendar-day arithmetic.

### MUX-010 — Populated narrow layouts and offline banner have unresolved overflow/occlusion risks

- **ID:** MUX-010
- **Severity:** Medium
- **Area:** Mobile UX
- **Confidence:** **Needs verification** for actual overflow/occlusion; fixed/nonwrapping source patterns confirmed.
- **Evidence:** `frontend/app/expenses/ExpensesClient.tsx:323–387` puts Upload receipts/Export/Add in a single flex row without wrapping; mobile receipt/action strip at `:464–498` has one button per receipt plus copy/edit/delete without wrapping. `ReportsClient.tsx:158–215` similarly combines privileged toggle/export/new. Report detail uses two-column money cards (`ReportDetailClient.tsx:344–396`) and some nonresponsive submit/attach rows. `OfflineSyncProvider.tsx:165–179` places a z60 fixed top-0 banner without safe inset or reserved layout space above `AppShell`'s fixed z30 header. Long merchant/report titles and large amounts have no consistent break/min-width strategy.
- **User impact / production risk:** At 360px, long Romanian action labels, multiple receipts and large totals can overflow or crowd decision controls; offline banner can cover menu/header text and sit under iOS status area. No current evidence establishes all four requested widths are safe.
- **Recommended fix:** Measure populated states; use wrapping/grouped secondary actions, min-w-0/break strategies and clear priority hierarchy. Include network banner in shared header offset/safe-area layout, not an independent overlay. Validate sticky save/FAB against keyboard and bottom-nav geometry.
- **Acceptance criteria:** Document scrollWidth≤clientWidth at all four widths with long realistic data, no action overlap; every last item/save action visible above keyboard/bottom navigation; banner never blocks navigation and is readable on notched devices.
- **Suggested tests:** 3+ receipts per expense, long unbroken merchant/report names, 7+ digit totals, RO manager actions, offline banner, keyboard active, landscape/standalone. Capture before/after screenshots and element bounding boxes.
- **Dependencies or sequencing:** Phase 1; source patterns alone must not be reported as observed pixel overflow.

### MUX-011 — Dark-mode signature exports white ink on transparency

- **ID:** MUX-011
- **Severity:** High
- **Area:** Mobile UX
- **Confidence:** Confirmed encoding/render path; exported PDF visual reproduction still needed.
- **Evidence:** `frontend/components/signature/SignaturePad.tsx:53–54,73–75` draws white strokes in dark mode. Canvas CSS background (`:189`) is not part of `canvas.toDataURL("image/png")` (`:177–181`); no white/opaque fill or ink normalization is performed. Backend `controllers/SignatureController.kt:65–84` decodes and stores those bytes unchanged; `services/PdfService.kt:617–622` inserts the PNG directly into the normally white report page. The same saved signature is invisible against own profile's light preview background (`app/profile/signature/page.tsx:99–105`). Save button only checks isEmpty, not network pending (`SignaturePad.tsx:206–212`); page messages at signature/page.tsx:84–89 lack live semantics.
- **User impact / production risk:** Technicians who sign in dark mode can produce apparently unsigned/light-mode-invisible reimbursement documents. Repeated Save can race, and assistive users have no equivalent non-canvas input path or canvas instructions.
- **Recommended fix:** Canonical export ink independent of UI theme; render saved strokes on suitable UI background or preview normalized artifact. Disable while saving, announce outcome and offer an accessible approved alternative (for example verified image upload) where drawing is not usable.
- **Acceptance criteria:** Identical legible signature artifact in light/dark preview, PDF and print; no concurrent saves; rotation preserves content; save/error states announced and alternate input policy documented.
- **Suggested tests:** Draw in dark theme, save PNG and inspect on white/PDF; switch theme; rotate; slow save/double tap; screen-reader/keyboard completion using supported alternate method.
- **Dependencies or sequencing:** Phase 1 document-signing blocker; coordinate historical signature snapshot requirements (BE-010). Do not silently alter existing signatures without an audit policy.

### MUX-012 — Manager queue renders stray implementation text; visual consistency is not governed by shared primitives

- **ID:** MUX-012
- **Severity:** Low
- **Area:** Mobile UX
- **Confidence:** Confirmed JSX text node; no screenshot generated.
- **Evidence:** `frontend/components/dashboard/PendingReportsTable.tsx:347–350` reads `return ( <>` followed by a second literal `return (` **inside JSX**, immediately before the queue container. This is legal text, not a TypeScript syntax error. Dashboard includes bespoke orange/navy cards while bulk upload/scanner/profile and report actions mix independent blue/green/purple patterns; only Badge/EmptyState/SearchDropdown exist in `components/ui`. Theme/global tokens do not enforce field/button/feedback contracts.
- **User impact / production risk:** Managers see implementation debris before the queue and inconsistent action hierarchy across the same workflow; repeated ad hoc markup is reintroducing the earlier mobile defects.
- **Recommended fix:** Remove the stray text and add a queue visual/text regression. After functional fixes, define semantic primary/secondary/destructive controls, field/error/dialog primitives and a small financial typography/spacing system. Preserve useful domain identity (receipt capture, reimbursement lifecycle) rather than a generic dashboard redesign.
- **Acceptance criteria:** No implementation text in rendered queue; primary action consistent per route; documented token/component usage covers core field and manager flows without shrinking touch targets.
- **Suggested tests:** Populated manager queue text/screenshot assertion in both themes; visual snapshots for expense capture → report → review; inspect with reduced motion/long locale copy.
- **Dependencies or sequencing:** Narrow text fix can accompany Phase 1; broader polish Phase 5 only after financial, security and field-user gates.

## Device sign-off procedure (not executed here)

1. Use isolated technician, manager, finance and mod accounts; seed a draft/submitted/approved/rejected/paid report, non-EUR/manual FX, nonzero mileage/allowance/advances and multiple receipts.
2. At 360, 390, 412 and 430 CSS px run Chromium/WebKit populated/empty/loading/error cases in EN/RO and light/dark. Record actual test count/skips, URL, role, viewport, screenshots, console/page errors and axe results.
3. On a notched iPhone Safari and installed PWA: keyboard open during amount/date/rejection inputs, address-bar expand/collapse, home indicator, rotation, background/resume offline, password manager, camera capture including device-native format, PDF/share download and browser swipe-back.
4. On Android Chrome and installed PWA: Back/predictive back expectations, keyboard resize, numeric/date input, file/camera chooser, permission denial, interrupted upload and foreground replay, low-memory/low-bandwidth behavior.
5. VoiceOver/TalkBack: closed/open sidebar, all modal types, route heading announcement, form error focus, receipt removal, OCR progress/cancel, toast outcome and signature alternative. Hardware keyboard Tab/Shift+Tab is additional, not a substitute.
6. Prove money/evidence consistency after every interruption and navigation; never close UX findings based solely on axe or no-overflow screenshots. The default mobile spec skips many authenticated flows and blocks service workers (FE-011).
