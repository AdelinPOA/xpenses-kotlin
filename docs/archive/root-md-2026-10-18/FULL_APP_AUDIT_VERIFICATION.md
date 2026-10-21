# Verification of FULL_APP_AUDIT.md

Verified on 2026-10-17 against working tree at `d62bcdc` (initially clean).
The audit names `37e01a1`; the differences between these revisions were also inspected.

**Verdict: useful findings, but unreliable as an implementation specification without corrections.** Several headline claims describe code that does not exist, and some risks are presented as measured production failures. The orphan cleaner, browser cache isolation, offline capture integration, SSR query keys, date handling, and advance authorization findings warrant action.

This verification used CodeGraph followed by direct source inspection, repository searches, frontend checks, small date/locale probes, and a read-only local health request. It did not attempt production logins, change accounts or settings, run cleanup or backup actions, query employee records, or reproduce browser/device workflows. “Supported” below means supported by source; it does not imply a reproduced exploit or measured UI failure.

## Corrections required before implementation

1. **DESK-01 is false.** Neither expense form route has the alleged `max-w-lg` parent wrapper. See [new/page.tsx](frontend/app/expenses/new/page.tsx) and [edit/page.tsx](frontend/app/expenses/[id]/edit/page.tsx). The form itself has a responsive `lg:flex-row` layout at [ExpenseForm.tsx:557](frontend/components/expenses/ExpenseForm.tsx#L557), with `max-w-lg` applied to the form column. The proposed two-line parent-wrapper fix has no target.
2. **UX-02 is false.** [Expense detail:183](frontend/app/expenses/[id]/page.tsx#L183) maps every receipt, with previews/download controls. It does not render only `receipts[0]`.
3. **SEC-04 is partly false.** [RateLimitingFilter.kt:43](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/RateLimitingFilter.kt#L43) already limits `/api/expenses/bulk-upload` to five requests per minute. `/api/reports/{id}/export` is missing from the regex. The regex fallback for the existing PDF/ZIP patterns is **15**, not the roadmap's asserted five requests per minute. Async `/api/ocr/jobs` also deserves coverage review.
4. **BE-03's unbatched N+1 claim is false as stated.** [application.yml:19](backend-kotlin-jpa/src/main/resources/application.yml#L19) already sets `hibernate.default_batch_fetch_size: 16`. Lazy collection loads remain, but “one expense query plus 20 receipt queries on every list” is not established. Changing 16 to 50 cannot guarantee the roadmap's total of three SQL queries. No query-count measurements were supplied or run here.
5. **BE-06 describes a different backup script.** [backup-db.sh](scripts/backup-db.sh) already starts with `set -euo pipefail`, executes `pg_dump -Fc` directly, and contains neither the claimed gzip pipeline nor the wrong Docker volume path. It backs up the database only; receipt-volume backup coverage is a separate, valid question. Nightly scheduling, actual backup failures, and off-host coverage are unverified.
6. **UX-05's first-page limitation is false.** The picker sends `{ status: "draft" }`, with no `page`. [ExpenseService.kt:59](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt#L59) explicitly returns an unpaginated list when `page` is absent. The client filters out attached expenses at [ReportDetailClient.tsx:243](frontend/app/reports/[id]/ReportDetailClient.tsx#L243). `no_report` appears in the query key but is not an implemented controller parameter. A server-side unassigned filter could reduce overfetching; this is not evidence that receipts beyond the first 20 are inaccessible.
7. **UX-07 contains nonexistent UI defects.** Insurance does not call `t("subtitle")`; it renders translated file counts. [SpendChart.tsx](frontend/components/dashboard/SpendChart.tsx) uses custom SVG, not Recharts, and has no alleged white tooltip. Hardcoded English does remain elsewhere, but the “80+” count was not substantiated.
8. **A11Y-02 and MOB-04 miss existing fixes.** [ToastProvider.tsx:83](frontend/components/ToastProvider.tsx#L83) already gives individual toasts `role="alert"`/`"status"` and `aria-live`. Its dismiss button has `min-w-11 min-h-11`. [ReceiptLightbox.tsx:134](frontend/components/expenses/ReceiptLightbox.tsx#L134) has safe-area padding and its toolbar buttons use `w-11 h-11`. Smaller controls remain elsewhere.
9. **FE-04's stuck-overlay explanation is contradicted by source.** [BulkUploadZone.tsx:33](frontend/components/expenses/BulkUploadZone.tsx#L33) does not call `stopPropagation()`. The component is under the wrapper with `onDrop={handleDrop}`, which resets the drag state. The audit's proposed reproduction depends on a handler absent from the source. A browser reproduction is needed before retaining this defect.
10. **FEAT-10's “OCR sources are never deleted” is false.** [AsyncOcrService.kt:93](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt#L93) deletes sources after cancellation; [line 271](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt#L271) deletes them after successful receipt promotion. A sweep for stranded/failed files and expired refresh tokens still appears absent.
11. **FE-03's locale diagnosis needs precise wording.** `en-EU` is accepted by `Intl.getCanonicalLocales`; it is not a structurally invalid BCP-47 tag. This host's runtime resolves it to `en`, producing `10/17/2026`. The European formatting issue and ISO-date timezone issue are reproducible, but the “invalid tag” explanation is inaccurate.
12. **Architecture details are wrong.** [build.gradle.kts:5](backend-kotlin-jpa/build.gradle.kts#L5) uses Spring Boot **3.5.16**, not 3.4. [CryptoService.kt:45](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/CryptoService.kt#L45) derives a **16-byte AES-128-GCM key**, not AES-256-GCM. OCR provider keys use this service. These are descriptions to correct, not vulnerabilities inferred merely from version/key size.

Most corrections above also apply to the audit's named revision: these frontend components, application configuration, rate limiter, and backup script are unchanged between `37e01a1` and `d62bcdc`. They cannot be explained solely by the newer commit.

## Finding-by-finding disposition

### UI, mobile, accessibility, and PWA

| ID | Disposition | Evidence / qualification |
|---|---|---|
| UX-01 | Supported workflow mismatch | Dashboard/capture/new/bulk entry points differ; capture remains on its feed. Immediate verification is explicitly requested in `docs/ux/mobile-ios-review/README.md:7-21`. “90% field case” and user anxiety are unmeasured. P0 is a product priority judgment. |
| MOB-01 | Supported, with corrections | `BulkReviewDrawer.tsx:41-47` lacks upload error handling; `:72-92` swallows edit/delete failures; `:196-201` shows the empty success-style state after an upload failure. Nested two-column layout is cramped. Exact 18–20px widths were not measured here. `receipts[0]` is safe for an empty array; only a missing array would throw, while the declared API contract always supplies `Receipt[]`. The check icon has `text-slate-400`, not a green class. |
| MOB-02 | Supported | `AppShell.tsx:141` marks both `/expenses` and `/expenses/capture` active. `OfflineSyncProvider.tsx:183` places the connection banner at fixed top zero above the safe-area-aware header. Actual notch clipping needs device validation. |
| MOB-03 | Supported risk, overstated confirmation | `OcrModelSettings.tsx:40` uses `text-sm`; other inputs use `sm:text-sm`. The existing mobile review explicitly says automatic zoom was **not confirmed on a real iPhone** (`README.md:130`). Retain the font-size concern and qualify the claimed observed behavior. |
| MOB-04 | Partly supported | Some category/admin/report controls remain small; the cited lightbox and toast dismiss examples already use 44px targets. Exact target/spacing compliance requires rendered measurements. |
| DESK-01 | Contradicted | No alleged parent wrappers. See correction 1. |
| DESK-02 | Supported enhancement | `ExpensesClient.tsx:608-623` has no select-all checkbox and no row navigation handler. Individual controls still provide navigation; making the entire row clickable is a design choice. |
| UX-02 | Contradicted | All receipts rendered. See correction 2. |
| UX-03 | Supported | `search/page.tsx:44,148` counts only reports/expenses; sections omit the other entity types represented by the search contract. |
| UX-04 | Supported | `DashboardClient.tsx:715-725` labels the card with `approved_summary_title` while displaying paid counts/totals and linking to paid reports. |
| UX-05 | Contradicted core defect | No first-page limit; client filters unassigned expenses. Server-side filtering remains an optimization. See correction 6. |
| UX-06 | Design review needed | Report detail has many conditional actions, and the newer commit substantially changes this component. Source supports a crowded-action concern, not a measured nine-button layout or a verified below-fold failure at every mobile size. |
| UX-07 | Partly supported | Hardcoded strings remain, including edit-expense and admin/settings labels. Insurance subtitle and Recharts examples are false. `global-error.tsx` still deserves localization/theme review. |
| A11Y-01 | Largely supported | Reviewed dialogs/lightbox lack a common focus trap. Sidebar already implements trapping and inert background handling (`Sidebar.tsx:88-129`), as the audit body acknowledges. Escape and scroll-lock support vary. “Zero drawers” is too broad given the sidebar exception. |
| A11Y-02 | Partly supported | Click-only expense/report cards and rows warrant keyboard work. Toast live-region claim is false. Exact contrast ratios need the actual foreground/background and computed styles. |
| PWA-01 | Supported privacy risk | `queryPersister.ts:8,110-149` uses global storage and restores selected query families; `Providers.tsx:23` initializes it independently of identity. Authentication failures and login do not clear these caches. Some keys include user IDs, so not every query necessarily displays previous-user data. Logout timing/restore races are plausible; deterministic leakage was not reproduced. |
| PWA-02 | Supported privacy risk | `sw.js:81-96` caches successful navigation HTML by URL and `/offline-shell`, without account scoping. SSR pages embed dehydrated data. `AuthProvider.tsx:153-165` removes all caches on logout; session expiry lacks that cleanup. Actual cross-user display requires browser reproduction. |
| PWA-03 | Supported | Capture owns its OCR-source recovery listeners (`capture/page.tsx:311-321`); global sync imports only the manual queue. `:349-355` stores raw file bytes before capture processing. Captures remain recoverable by returning to the capture page, rather than being permanently lost. |
| PWA-04 | Supported architectural gap | Manual expense creation lacks client idempotency; retry after a lost response can duplicate a committed expense. `PwaRegistration.tsx:23` shows update text without its available toast action; manifest has no shortcuts. Do not imply identical shortcut support across all platforms. |

### Frontend and backend

| ID | Disposition | Evidence / qualification |
|---|---|---|
| FE-01 | Supported, with scope correction | Dashboard, expenses, and reports seed different keys from their client queries. Expenses SSR is unpaginated. Settings omits `fxMargins` and gates rendering on its loading state; that is a missing prefetch, **not a fourth mismatched key**. Successful SSR fetches may therefore be followed by client requests; “every load fetches twice” ignores failures and existing client cache state. |
| FE-02 | Supported and reproduced | Local midnight converted with `toISOString()` yields the preceding date in Bucharest. `ExpensesClient.tsx:35-45` affects export boundaries; default expense/advance dates also use UTC extraction. The affected early-morning interval varies between summer and winter offsets. |
| FE-03 | Supported formatting bug, inaccurate terminology | Runtime probe confirms US-style output for `en-EU` and previous-day display of an ISO date in New York. Tag is structurally valid. See correction 11. |
| FE-04 | Partly supported | `ExpenseForm.tsx:243` can retain manual FX for EUR; `:564` has no pending-submit guard. Duplicate submission is a plausible race, not reproduced. Stuck-overlay cause is false. A pending-state guard alone is not an atomic same-tick/idempotency guarantee. |
| FE-05 | Supported | `api.ts:30-34` assigns `.detail` to any truthy response body, including strings; Axios instance has no timeout. `auth.ts:12` and reactive interceptor refresh independently. Repository search found no consumers of the two named dashboard components. |
| BE-01 | Supported, urgent | `AppSettingsService.kt:258-282` skips only `cache`, compares every file solely with receipt paths, then `:287-302` deletes the difference. Insurance and active OCR source paths share storage. JPQL receipt paths exclude soft-deleted entities. **Scan alone does not delete**; clean is the destructive operation. Already-deleted files and remote-only files are outside the “deletes every document” wording. |
| BE-02 | Supported risk | Transactional expense/advance/mileage methods call FX; LDAP sync binds/searches inside a transaction; legacy email import/simulation parse inside transactions. Slow calls may extend connection occupancy once acquired. “Maximum pool size 10 at application.yml:17” is not present in this file and no connection hold times were measured. |
| BE-03 | Partly supported; severity needs measurement | Lazy mapping and repeated allowance lookups exist, OSIV is not explicitly disabled, but batch size 16 already exists. `AppSettingsService.getDailyAllowanceRate()` itself is **not cached**, so routing mapper calls through it alone is no cache fix. See correction 4. |
| BE-04 | Partly supported | Catch-all handler returns 500; upload/optimistic-lock/integrity/method/media/part exceptions lack dedicated mappings. **MissingServletRequestParameterException already maps to 400** (`ValidationExceptionHandler.kt:62`). Non-EUR invalid creation dates are wrapped as **502** by `ExpenseService.resolveFxRate`, rather than necessarily 500; EUR bypasses date parsing in `FxService`. Multipart limits are **10MB**, not the cited 15MB. HTTP outcomes were not integration-tested. |
| BE-05 | Mostly supported, with domain qualification | Advance privileged mutations use `canViewAll` despite `Authorization.kt` excluding mod from manage rights. Requested-advance editing writes actual paid-amount fields. Recall retains rejection/signature metadata. Bulk create/upload is split and can leave an expense after upload failure. Editing rejected-report expenses is possible, but whether recall must be mandatory requires a business rule; the audit's proposed guard allowing `rejected` contradicts its stricter recommendation. |
| BE-06 | Partly supported | CurrencyAPI accepts later source dates; FX caches by requested date; scheduler combines Async/Scheduled; email index is nonunique; remote storage can return a missing local path; S3 client has no close lifecycle; PDF error embeds a local path. Backup-script specifics are false. Concurrent IMAP polls are possible, but the durable ingestion ledger must be considered before asserting duplicate effects. |

### Security and production claims

| ID | Disposition | Evidence / qualification |
|---|---|---|
| SEC-01 | Configuration confirmed; live account claim unverified | Local `.env` has `SEED_DEMO_USERS=true`. `DataInitializer.kt:61` seeds known credentials only when user count is zero and has no production-profile guard. This does not prove those accounts currently exist, are active, or still accept their initial passwords. No production login was attempted. Disabling seeding alone does not deactivate existing accounts; do not hardcode user IDs 1–4 without identifying accounts. |
| SEC-02 | Serious configuration risk; exploit unverified | `application.yml` enables framework forwarded headers, while the limiter trusts `request.remoteAddr`. This undermines the assumption that it sees the original socket peer if forwarding runs first. End-to-end bypass depends on filter ordering and whether ingress replaces/sanitizes supplied headers; “completely bypassed in production” needs evidence. Remove/replace forwarding only with a verified proxy plan, since scheme/host handling also relies on it. |
| SEC-03 | Supported risk | Same issues as PWA-01/02; not an additional independent defect. |
| SEC-04 | Partly contradicted | Bulk upload already limited. Report export and additional expensive endpoints need coverage. See correction 3. |
| SEC-05 | Supported | Advance authorization uses read-all privilege for paid creation and other mutations. Paid-advance deletion is additionally limited to draft reports; this is not unrestricted deletion across report states. |
| SEC-06 | Partly supported | Insurance validates extension and size, then calls `uploadFile` without magic-byte validation. Absence of `nosniff` in the receipt controller does **not** prove absence from the HTTP response: local `/api/health` returned `X-Content-Type-Options: nosniff`, and security headers are not disabled in `SecurityConfig`. Authenticated receipt headers were not fetched. Preserve support for allowed Office/text files if changing validation; receipt-only magic-byte defaults would reject them. |
| SEC-07 | Supported config gap; ingress unverified | Next config supplies CSP but not the listed extra headers or `poweredByHeader: false`. Actual public headers can also be supplied by the reverse proxy/edge. |
| SEC-08 | Observation confirmed; vulnerability not established | Legacy CBC keys derive from JWT secret; GCM uses separate encryption secret; timestamps are not used for expiry. These tokens store long-lived settings, so lack of TTL is not independently a security flaw. Migration/rotation is a hardening proposal requiring compatibility and stored-data review. |
| SEC-09 | Partly confirmed; host claims unverified | `.env` mode is 0644; actual readability also depends on ancestor directory permissions. Repository backup script covers DB only. Completed/cancelled OCR sources are deleted; stranded sources need retention review. SSH/firewall state, exposed ports in running deployment, off-host backups, and volume inventory were not verified. Compose defaults bind app ports to loopback. |

## Product proposals (FEAT-01 through FEAT-14)

These are proposals rather than demonstrated requirements, except where linked to an explicit accepted UX decision. Impact percentages, domestic-currency frequency, time estimates, and proposed feature exclusions have no measured validation in the audit.

| IDs | Verification |
|---|---|
| FEAT-01 | No expense-level duplicate warning found. OCR result caching already uses image hashes; reusing extraction is different from warning about reimbursement duplicates. |
| FEAT-02 | No persisted expense verification field found. Capture already renders a localized `status_needs_review` in its own UI; distinguish that from durable verification outside capture. |
| FEAT-03 | Manual expense idempotency gap supported. “Exactly once” also needs handling for attachments and retries, beyond a new expense column. |
| FEAT-04 | Aggregate OCR confidence/warnings exist in the scan contract, but field-by-field provenance/highlighting is absent from the form. |
| FEAT-05 | Zoom/pan exists; no receipt rotation state found in preview/lightbox. Crop and persisted image editing are additional scope beyond CSS rotation. |
| FEAT-06 | Form already accepts a `reportId` from the route. Automatically suggesting an active draft is a further feature, not absence of report-linked creation. |
| FEAT-07 | Expense selection toolbar offers report creation; the proposed additional batch operations are useful enhancements. |
| FEAT-08 | Proposed global search/review shortcuts were not found in the reviewed components. Existing Escape and search-dropdown keyboard behavior should be preserved. |
| FEAT-09 | OCR can return `category_id`, and form uses it. Merchant-history fallback is the missing enhancement, not all automatic category selection. |
| FEAT-10 | Overstated: successful/cancelled source cleanup exists. Periodic cleanup for stranded sources and expired refresh tokens was not found. |
| FEAT-11 | Login already has Eye/EyeOff visibility toggle (`login/page.tsx:80-94`). Profile password forms remain a separate enhancement. |
| FEAT-12 | EUR defaults are present; saved user currency preference was not found. The claimed 85% RON frequency is unsupported. |
| FEAT-13, FEAT-14 | Receipt splitting and web push are future proposals. Business/tax examples and effort estimates were not verified; do not treat them as requirements derived from code. |

## Verification performed and limits

- `npm run typecheck`: passed.
- `npm run i18n:check`: passed, **1,028 keys** in both locales. This checks parity, not completeness of translated UI.
- `npm run lint`: passed.
- Date/locale probes: `en-EU` canonicalizes successfully, resolves to `en`, and formats 17 October as `10/17/2026`; Bucharest local 1 October midnight becomes `2026-09-30` via UTC slicing; ISO `2026-10-17` formats as `16/10/2026` in New York.
- `GET http://127.0.0.1:8001/api/health`: 200 with `{"status":"ok"}` and `X-Content-Type-Options: nosniff`.
- No builds, backend suites, browser suites, benchmarks, or production mutations were run. Original audit assertions about screenshots, device behavior, SQL counts, active demo credentials, deployed versions, and nightly backup outcomes are not independently validated by these checks.

The section C scorecard and sections I–L should be revised after removing false findings and qualifying risks. In particular, remove the nonexistent parent-wrapper and first-receipt tasks; narrow the backup, rate-limit, localization, target-size, N+1, and cleanup tasks; clarify the rejected-report editing rule; and allocate migration numbers only when implementation begins (the roadmap inconsistently assigns V104/V105). Preserve urgent work on orphan-cleaner safety and identity isolation, alongside confirmation of demo-account and proxy exposure.
