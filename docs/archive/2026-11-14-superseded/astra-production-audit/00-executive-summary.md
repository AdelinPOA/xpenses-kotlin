# Xpenses production-readiness audit — executive summary

## Decision

**Do not give unconditional production sign-off.** A current committed-secret disclosure requires immediate owner-led incident response. Financial reconciliation, offline replay/account isolation, mail crash recovery and receipt handling still contain source-confirmed defects or incomplete mitigations. The existing tests are useful but do not exercise the failure scenarios needed for release.

This is a local evidence-based audit and improvement plan, **not a penetration test, complete real-device UAT or certification**. No application code was changed, no live credentials used, no production data mutated and no deploy/restart performed by this audit.

## Revision and timing matter

- Initial audit: `87bec5a15457c3c74ebec613f2459ac1306093a5`, 2026-09-06.
- Another workstream committed application fixes and separate audit documents while this task was paused.
- Reconciled and freshly tested: `bdb6fcba9845be7053b0087253bb4a1c191d96e3`, 2026-09-07.
- Reports 01–04 preserve initial findings and exact baseline source references, with prominent provenance banners. **Use the table below for their current status.** Reports 05–07 incorporate current evidence. Initial failures are not presented as current failures; passing new tests do not automatically close findings.
- Existing running containers are distinct from checked-out code; a source fix is not proof it is deployed.

## Top 10 current priorities

Canonical findings contain severity, evidence, impact, fix, acceptance criteria, tests and dependencies; entries here are prioritized cross-references, not duplicate findings.

| Rank | Issue | Current status / release consequence |
|---|---|---|
| 1 | **SEC-013 — Purported production signing/encryption secrets committed in a separate audit** | Critical disclosure confirmed in `docs/agy/audit/3.8/05-deployment-ops-audit.md`, commit `e2b3f44`; key validity untested. Treat as compromised pending verification. Preserve decryptability during coordinated rotation; never reproduce values. |
| 2 | **SEC-002/003 — Shared-device offline data and replay are not fully identity-isolated** | Owner fields and explicit logout cleanup added, but active replay is not canceled/rechecked across account changes and automatic auth transitions do not consistently clear identity-less query caches. |
| 3 | **BE-001 — PDF reimbursement omits mileage** | `PdfService.kt:558–562` calculates mileage but does not add it; API mapper does. Nonzero-mileage accounting parity remains a release gate. |
| 4 | **BE-002/003/010 — Posted financial/signature evidence remains mutable** | Allowance uses current global setting; new paid/rejected-report advance restrictions leave approved totals mutable; exports reference current profile signatures. Freeze approved/posted values and evidence under explicit finance policy. |
| 5 | **FE-001/003 — Partial saves/retries can create duplicate expenses or reports** | Owner IDs did not implement backend idempotency or durable per-step state. Capture/offline create→receipt and report create→attach remain unsafe on lost responses. |
| 6 | **BE-008 — Legacy mileage distance edits can leave old monetary values** | Nullable historical fuel snapshots cause calculation early-return after distance mutation. Prevent partially recalculated financial records without rewriting posted history. |
| 7 | **BE-004 / SEC-006 — Mail ingestion can duplicate reports and still trusts insufficient sender provenance** | Ledger now wired, but report save/ledger/SEEN are not one crash-safe operation; SEEN failure can reopen successful work. Missing auth headers still accepted. Gate IMAP enablement. |
| 8 | **OPS-004 / BE-007 — Complete evidence recovery and storage failure guarantees not proven** | After-commit deletion improves ordering, but durable cleanup and full DB+receipt+key restore are unverified. Prove recovery before key rotation/migrations. |
| 9 | **FE-004 — Viewing an attached receipt can submit financial edits** | Existing filename button in ExpenseForm still lacks `type="button"`; read-only inspection can save changes/delete staged receipts. Small, high-value immediate fix. |
| 10 | **BE-005/006 — Accepted async OCR is not restart-durable and spans external work in transactions** | Process-local receipt bytes, no recovery worker and transaction/failure propagation hazards remain. Gate asynchronous OCR at production load until durable recovery and bounded work are tested. |

Also urgent: SEC-005 bulk quota still counts requests rather than each receipt; OPS-002 deployed ingress isolation, OPS-003 seeded-account inventory, OPS-006 log bounds, and MUX-001's new broken receipt download. Highest severity does not depend only on remediation size. Phase 0 permits disabling a risky optional feature rather than shipping an unverified partial repair.

## Current-source reconciliation (not closure certification)

“Source remediation present” means inspection found the implementation change. **The fresh suite pass is not targeted browser/crash/financial acceptance proof.** Unlisted baseline findings remain open unless their specified tests establish otherwise; they were not all individually re-executed after external edits.

| Baseline finding | Current source disposition | Evidence / remaining work |
|---|---|---|
| SEC-001 insurance executable MIME | Source remediation present | `8737f16`: `InsuranceController.kt` derives allowlisted MIME, forces attachment and nosniff, also on legacy download. Browser/proxy test still needed. |
| SEC-002 offline account replay | Partial | `e33c2ae`: queue `userId` filtering; `OfflineSyncProvider.tsx:67–94` does not recheck/cancel already-running loop on cookie identity switch; anonymous count uses unfiltered list. |
| SEC-003 private browser caching | Partial | `8707f0e`, `e33c2ae`: SW v4 removes private precache/RSC, old caches purged; explicit logout clears caches. `AuthProvider.tsx:72–80` automatic failures/direct identity changes do not consistently clear QueryClient. Test installed SW upgrade. |
| SEC-004 expiry 403/refresh timer | Source remediation present | `305284c`: JSON 401 entry point and timer no longer reset by every successful poll. Current auth tests pass, but actual expired JWT + concurrent browser renewal still needs testing. FE-005 network/logout remains. |
| SEC-005 bulk OCR quota | Partial | `eafc12f`: route limit/shared user bucket/magic checks. `BulkExpenseController.kt:47–54` charges one quota unit before the file loop, allowing up to twenty scans per unit; shared OCR seam not caller-budgeted. |
| SEC-006 forged mail identity | Remains, limited filter added | `181b27a`, `EmailImportService.kt:604–614`: rejects selected explicit SPF/DKIM failures but accepts missing/unaligned results without authenticated gateway boundary. |
| FE-001 partial-save duplication | Remains | `e33c2ae` added ownership, not operation ID/idempotency. Queue still creates before uploading and persists neither server ID nor progress. |
| FE-002 misleading Undo | Source remediation present by removal | `64461dd` removed reconstruction/Undo. Does not provide reversible deletion; permanence copy and storage semantics still need validation. |
| FE-003 report partial success | Remains | `reports/new/page.tsx:24–55` still offers attached draft expenses and loses created report identity after attach failure. New labels do not fix atomicity. |
| FE-004 receipt button submit | Remains | `ExpenseForm.tsx:512–515` filename button still lacks type inside save form. |
| MUX-001 missing expense detail | Partial; new action contract defect | `3dd1a20` added route. `app/expenses/[id]/page.tsx:24–26` requests `/expenses/{id}/receipts/{receiptId}/download`; backend `ExpenseController.kt:131` maps path without `/download`. Fix URL and assert actual bytes; Back currently discards originating search context. |
| MUX-003 back/draft loss | Partial | `2c3e59c` adds popstate sentinel, report-edit guard/refetch protection, new-tab previews and guarded logout. Report create/signature lack guard/persisted drafts; accepted sentinel-back behavior needs browser execution. |
| MUX-008 contrast/motion | Partial | `8b13e6b` improves secondary tokens and reduced-motion override; dark primary `#c2410c` contrast concern remains. Rendered states unverified. |
| MUX-011 white signature export | Source remediation present for new normal exports | `7d26cb0` recolors canvas pixels dark on export. Existing white-ink stored signatures and fallback path not migrated; PDF/print check needed. |
| BE-003 settled-report advances | Partial | `47fe490` blocks paid/rejected create/delete/pay; submitted/approved reports remain mutable. Require finance policy plus aggregate race test. |
| BE-004 mail ledger | Partial, duplicates still possible | `181b27a`: actual claim wired and 15-minute reclaim added. `EmailImportService.kt:617–628` can mark successful import FAILED after SEEN failure. Report insert and ledger completion lack atomic binding/fencing. |
| BE-007 file/DB ordering | Source ordering repair; durability partial | `bdb6fcb`: deletion after commit; rollback cleanup; remote upload failure propagated. Callbacks are process-local, not a durable cleanup ledger; remote delete failures can leave objects. |
| FE-012 lint | Confirmed still open | `npx eslint app/login/page.tsx` exits 0 with ignored-file warning. A nominal lint pass does not check TSX. |
| OPS-002/003 source defaults | Defaults repaired, deployment/account verification pending | Current Compose uses loopback and demo=false. Existing bindings/accounts cannot be assumed repaired merely by changing YAML. |

Additional commits touch field labels, dialogs, signature UI, toast semantics, receipt tabs and sidebar behavior. These improvements need the full MUX-002/004/005/006/007/009/010/012 acceptance matrix; do not mark them all closed from commit subjects. Financial BE-001/002/008/010 code was not among reconciled changes.

## Executed checks — current HEAD

| Check | Result |
|---|---|
| Fresh Gradle test run | **223 passed**, zero failures/errors/skips |
| TypeScript, translation parity, production Next build | **Passed**; 851 locale keys |
| npm lint | **Passed nominally**, but explicit TSX probe shows ignored source |
| Mobile Playwright | **2 passed, 16 skipped** — mocked public login only, 412×849 Chromium/WebKit |
| Compose quiet config | **Passed** — no startup/deployment guarantee |
| Backup shell syntax / parity-script tests | Passed on unchanged scripts; no restore executed |

Initial baseline had 2 backend failures out of 213 and lint failures against generated report files. These are retained in the exact command ledger in `06-test-and-verification-plan.md`, not used to misstate current results.

## Coverage, strengths and limits

Inventory maps all frontend routes/components/libraries, backend controllers/services/entities/repositories/integrations/migrations/tests and deployment/CI/scripts. Source review covers all requested core flows, with deeper analysis on expenses, reports, auth, receipts and manager review; secondary/admin screens received targeted source review, not exhaustive interaction execution.

Preserve existing controls: server-enforced ownership/roles, BigDecimal and FX snapshots, optimistic versions, canonical storage paths, hashed refresh tokens, production cookie/migration/Redis safeguards, safe-area/dvh mobile chrome, existing accessible expense controls, Testcontainers, Gitleaks and browser infrastructure.

**Not verified:** authenticated mobile flows, physical iOS/Android keyboards/camera/back/PWA, 360/390/430 layout, screen readers, fresh populated screenshots, real PDF signature rendering, two-transaction races, external OCR/S3/IMAP/LDAP, crash recovery, deployed TLS/IAM/firewall, key validity, history/dependency/image scans and complete disaster restore. Exact next tests and owner commands are in report 06. This uncertainty is part of the release decision, not hidden by green checks.

## Deliverables

1. `00-executive-summary.md` — decision, current top ten, reconciliation.
2. `01-mobile-ios-android-ux-audit.md` — baseline mobile findings and route/device matrix.
3. `02-frontend-audit.md` — complete frontend inventory and baseline findings.
4. `03-backend-audit.md` — backend inventory and financial/integration findings.
5. `04-security-privacy-audit.md` — baseline trust-boundary findings plus current SEC-013 incident gate.
6. `05-deployment-ops-audit.md` — current/baseline operational evidence and remediation.
7. `06-test-and-verification-plan.md` — exact executed commands/results and missing acceptance tests.
8. `07-prioritized-roadmap.md` — six implementation phases, files, risks, effort and release gates.

All paths are relative to `docs/astra-production-audit/`. Reports from other workstreams are not substituted for these deliverables; in particular the separate exposed-secret report should not be circulated as supporting evidence.
