# Audit findings and disposition

Source review date: **2026-10-18**, working tree based on `d62bcdc`. This document reconciles the [full audit](../../archive/root-md-2026-10-18/FULL_APP_AUDIT.md), [earlier audit verification](../../archive/root-md-2026-10-18/FULL_APP_AUDIT_VERIFICATION.md), and legacy WIP/TODO findings. It records evidence, not completed fixes or newly approved product requirements.

## How to read the findings

- **Source-confirmed:** the implementation contains the described mechanism or behavior. User impact, exploitability and severity may still require reproduction.
- **Contradicted or stale:** the stated implementation is absent, or a relevant fix already exists. Do not schedule the original proposed fix without a new reproduction.
- **Partial or runtime-dependent:** a narrower concern is supported, but the original explanation, scope, measurement or production outcome is not established.
- **Product proposal:** an enhancement or policy choice, not a demonstrated defect merely because an audit recommends it.

The detailed evidence reports are [frontend](frontend.md), [backend/domain](backend.md), and [operations](operations.md). Root-document line references in those reports refer to the archived originals. The live glossary remains [CONTEXT.md](../../../CONTEXT.md).

## Source-confirmed behavior and risks

| Finding | Verified scope | Evidence |
| --- | --- | --- |
| BE-01: orphan-file cleanup | Candidate discovery compares local files with receipt references, omitting other file purposes. Cleanup can delete insurance or active OCR-source files; soft-deleted receipt references are also relevant. Scanning alone does not delete. No cleanup or data-loss reproduction was performed. | [AppSettingsService](../../../backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AppSettingsService.kt), [backend report](backend.md) |
| PWA-01/02 and SEC-03: account isolation | Shared query-persistence storage and navigation HTML caching lack full account scoping. Logout cleanup exists. A cross-user disclosure was not reproduced. | [query persister](../../../frontend/lib/queryPersister.ts), [service worker](../../../frontend/public/sw.js), [frontend report](frontend.md) |
| PWA-03: capture recovery differs from global sync | Capture owns OCR-source recovery; global offline sync handles the manual expense queue. Returning to capture can recover its queued sources; they are not necessarily lost. | [capture](../../../frontend/app/expenses/capture/page.tsx), [offline sync](../../../frontend/components/OfflineSyncProvider.tsx) |
| PWA-04: manual creation retries | Local recovery is at-least-once. A lost response after a committed creation can lead to duplicate creation on retry without a server idempotency guarantee. | [expense saving](../../../frontend/lib/expenseSaving.ts), [frontend report](frontend.md) |
| MOB-01: bulk-review errors | Per-file errors have UI handling, but whole-request failure handling is incomplete; some row-edit/delete failures are swallowed. Exact mobile widths were not measured. | [BulkReviewDrawer](../../../frontend/components/expenses/BulkReviewDrawer.tsx) |
| UX-03: full search | The full search page renders/counts reports and expenses, omitting other types represented in the search contract. | [search page](../../../frontend/app/search/page.tsx) |
| UX-04: dashboard label | The mobile Approved summary uses paid counts/totals and a paid-report destination. | [DashboardClient](../../../frontend/app/dashboard/DashboardClient.tsx) |
| FE-01: SSR/client query keys | Some prefetch keys differ from client keys. Redundant requests are possible, not guaranteed on every page load. | [frontend report](frontend.md) |
| FE-02/03: calendar dates | UTC extraction and ISO-date formatting can shift calendar dates across time zones. A missing timezone does not prove every page has a hydration mismatch. | [frontend report](frontend.md) |
| FE-04: manual FX state | Returning to EUR can retain manual FX state in the form payload. Pending-button behavior alone does not provide server idempotency. | [ExpenseForm](../../../frontend/components/expenses/ExpenseForm.tsx), [frontend report](frontend.md) |
| FE-05: HTTP error and refresh handling | The interceptor mutates any truthy error body; Axios has no configured timeout. Proactive and reactive refresh use separate coordination paths. Specific failure/race outcomes were not reproduced. | [API client](../../../frontend/lib/api.ts), [frontend report](frontend.md) |
| BE-02: external calls inside transactions | Some FX/LDAP paths and legacy email methods include external I/O within transactions. Connection hold times and pool exhaustion were not measured. | [backend report](backend.md) |
| BE-04: exception mapping | Dedicated mappings are absent for some upload, integrity and optimistic-lock exceptions. Exact HTTP outcomes need integration tests. Missing request parameters already have a mapping. | [ValidationExceptionHandler](../../../backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/ValidationExceptionHandler.kt) |
| BE-05 / SEC-05: advance authorization | Some advance mutations use read-all privilege, including mod. Paid-advance deletion is constrained to draft reports; the risk is not unrestricted deletion in every report state. | [AdvanceController](../../../backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AdvanceController.kt), [backend report](backend.md) |
| BE-05: lifecycle metadata and editing | Recall retains signature/rejection metadata. Rejected-report expenses become draft and can be edited. Whether policy should forbid this requires a domain decision. | [report lifecycle](../../../backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt) |
| Bulk upload transaction split | Receipt upload tracks rollback cleanup, but bulk creation and attachment are separate calls; attachment failure can leave a created expense without a receipt. | [BulkExpenseController](../../../backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/BulkExpenseController.kt), [backend report](backend.md) |
| OCR retention | Expired worker leases are recovered. The stored 30-day job expiry has no enforced cleanup path; terminal processing failures can retain the source. Permanent provider failure does not itself create a photo-only expense. | [AsyncOcrService](../../../backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt), [backend report](backend.md) |
| Insurance content validation | Extension/size validation and hardened downloads exist; insurance upload does not use the same magic-byte validation seam as receipt/OCR-source uploads. | [InsuranceController](../../../backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt) |

## Contradicted or stale claims

| Original claim | Checked correction |
| --- | --- |
| DESK-01: route-level `max-w-lg` wrappers break the expense form desktop split | The alleged wrappers do not exist in the cited routes. |
| UX-02: expense detail shows only the first receipt | Detail maps all receipts. |
| UX-05: report picker loses items after page 0 / the first 20 | No `page` means an unpaginated backend result. The client filters attached expenses. Server-side unassigned filtering could reduce overfetching. |
| UX-07: missing `insurance.subtitle` call and white Recharts tooltip | The alleged subtitle call does not exist; SpendChart uses custom SVG. Other hardcoded strings still exist. |
| A11Y-02: toasts lack live announcements | Individual toasts already have alert/status roles and `aria-live`. |
| MOB-04: the cited lightbox controls are under 44px | The cited toolbar controls are 44px; other controls require their own measurement. |
| A11Y-01: zero drawers implement focus trapping | Sidebar already implements trapping. Other dialogs still warrant accessibility work. |
| FE-04: the overlay gets stuck because its drop handler stops propagation | The alleged `stopPropagation` is absent. The proposed cause is contradicted; an actual stuck-overlay report still needs browser reproduction. |
| FE-03: `en-EU` is structurally invalid | Intl accepts it. Formatting/fallback is the concern, not invalid tag syntax. |
| BE-06: backup lacks pipefail and uses a broken gzip pipeline | It already uses strict shell options and direct `pg_dump -Fc`. |
| OCR source files are never deleted / no stuck-worker recovery exists | Cancellation/success attempt source deletion, and expired worker leases are recovered. Terminal-source retention is a separate gap. |
| OCR cache cleanup ignores entries never reused | `last_used_at` is initialized at creation; those entries can age out too. |
| Bulk upload has no backend prechecks | Extension, size and magic-byte checks exist before OCR. Frontend size/count checks are a separate concern. |
| Local storage lacks a traversal guard | Canonical path resolution and containment checks exist. |
| Scheduled email ingestion lacks durable deduplication | The current Technician ingestion path uses stable message identity, a ledger and atomic report association. Legacy helpers are a separate path. |
| Storage migration has no per-file progress | A persisted per-file ledger and claims/retries already exist. Crash recovery behavior still needs runtime exercise. |
| Upload rollback always leaves previously stored files | `uploadReceipts` tracks rollback cleanup. The bulk create/attach split is a different remaining issue. |
| No CSV formula-prefix protection exists | ExportService sanitizes leading formula characters. This is not a spreadsheet-application test. |
| Missing pending disables on the cited delete controls | The checked expense/report delete controls already use pending disable. |
| Spring Boot 3.4 / AES-256-GCM | Build declares Spring Boot 3.5.16; CryptoService derives a 16-byte AES-128-GCM key. These corrections alone do not establish vulnerabilities. |
| Compose smoke testing still needs to be added to CI | CI already includes disposable Compose startup, health checks, image/dependency scans and authenticated mobile tests. Workflow presence does not prove a particular run passed. |

Evidence for these corrections is recorded in the [frontend](frontend.md), [backend](backend.md) and [operations](operations.md) reports.

## Partial claims and missing runtime evidence

| Topic | What can be concluded |
| --- | --- |
| BE-03: N+1 | Lazy traversal exists, but Hibernate batch size 16 is already configured. Exact query counts and latency need SQL measurement. |
| SEC-02: proxy/rate-limit bypass | The custom limiter has trusted-proxy checks; framework forwarding is also enabled. Ingress sanitization and filter ordering must be verified before claiming a working production bypass. |
| SEC-04: limiter coverage | Bulk upload is already limited. The report export route is absent from the checked pattern; matched PDF/ZIP routes use a 15/minute fallback, not the asserted five. |
| SEC-01: active production demo accounts | Seeding is conditional, defaults off and has no production-profile refusal. This does not prove that demo accounts exist, are active or accept initial credentials. |
| Backup completeness | The repository script is database-only. Other host jobs, file backups, off-host copies and restore success were not inspected. |
| Mobile/accessibility measurements | iPhone auto-zoom, safe-area clipping, exact drawer widths, contrast and below-fold layouts need rendered/device evidence. No real-device acceptance is established by source inspection. |
| Double submits / optimistic locking | Missing end-to-end idempotency and concurrency-sensitive code justify focused tests; specific race outcomes were not reproduced. |
| Crypto expiry | Encrypted-settings timestamps are not used for TTL; long-lived settings do not automatically require expiry. Legacy CBC key reuse is source-confirmed, exploitation is not. |
| API versus PDF reimbursement | API includes mileage; PDF summary excludes it under the recorded Accounting policy. Treat the two output definitions separately rather than declaring PDF exclusion a bug. |
| Scores, percentages and effort estimates | Audit scores, claimed user frequencies, measured impact and fixed implementation times lack supporting measurement in this review. |

## Reliability of the earlier audit verification

The earlier verification correctly challenged the main false positives: desktop wrappers, first-receipt rendering, first-page restriction, backup implementation, existing batching, toast announcements and locale syntax. Its finding dispositions are useful evidence, but not a certification of the whole application.

Additional precision from this review:

- OCR lease recovery and terminal-source/job-expiry cleanup are different mechanisms; only the former is implemented.
- The active durable email ingestion path must be distinguished from old transactional helpers.
- Base configuration and `prod` overrides differ: production enables secure cookies, Redis/fail-closed rate limiting and Flyway validation. Environment can override effective settings.
- API and PDF reimbursement use different component sets.
- Prior observations about `.env`, health requests or host state are dated observations, not current deployment guarantees. This review did not inspect secret values or attempt production login.

## WIP, TODO and product proposals

The old WIP is not a current list of missing features. Source already contains DPR-aware signatures, manual recovery staging, navigation guards, receipt capture, offline indication, URL filters/search/pagination, export ranges, manager receipt viewing and batch actions, login continuation and show-password controls. Partial items include delete Undo, selectable page size and translation completeness; Cmd-K remains a proposal. The [frontend report](frontend.md) provides the item-by-item inventory.

The full audit's FEAT proposals are enhancements unless supported by an accepted requirement. Field-level OCR provenance, receipt rotation, duplicate warnings, draft suggestions, extra batch operations and web push should not become mandatory fixes merely because they appear in the audit.

GitHub Issues remain the task source of truth. This documentation update creates no issue, changes no priority and fixes no application behavior. Planning should use the narrowed source finding and a concrete verification criterion rather than copy an old audit's proposed patch.

## Verification performed

The documentation review used source/configuration inspection and three independent GPT-6 Luna agents with maximum reasoning. The parent ran TypeScript and translation parity checks successfully (1,028 matching locale keys), checked documentation links and preserved six original documents with SHA-256 hashes.

No production login, destructive cleanup, backup/restore, employee-data query, external provider request, query-count benchmark, full build/test suite or real-device workflow was performed. Browser suites configured to block service workers do not validate the PWA caching concerns above.
