# Pitfalls by Domain — Xpenses

**Mode:** Ecosystem
**Date:** 2026-08-04
**Severity basis:** `todo.md` (reviewed backlog, verified against source) + domain research.
Each pitfall cites the backlog finding where it exists.

---

## Critical

### C1. Export totals drift from frozen postings (financial export accuracy)
An export that reads a live FX cache or re-runs a conversion can differ from the posted EUR amount after the fallback cache is purged or re-keyed. Backlog already flags fallback cached under the wrong date (`FxService.kt:62-80`, `[~] medium`) and pdf merge/number formatting drift. **Fix:** exports read a closed report snapshot; golden-file tests assert `exported == posted`.

### C2. Corrupt FX amount enters report totals (unvalidated manual rate)
`fxRate <= 0` yields zero/negative EUR amounts persisted into report totals (`ExpenseService.kt:91-98`, `FxService.kt:47` rejects only 0, `[medium]`). In an accountant feedout this is a silent accounting error. **Fix:** validate `fxRate > 0` at the DTO and service before any conversion.

### C3. Database connection held across external I/O → pool exhaustion
The same defect class in three places: OCR advisory lock across the 4-tier Gemini chain (`OcrService.kt:146-153`, `[high]`), FX HTTP calls inside open transactions (`ExpenseService.kt:191`, `AdvanceController.kt:106,172,264`, `[high]`), and PDF/email on request threads. Under load this takes down the whole app while finance is trying to run a report. **Fix:** resolve rates before the tx; scope advisory locks to the critical section; outbox for notifications.

### C4. Spoofed email creates expenses (email phishing)
`EmailImportService` trusts `From:` without sender verification (`[medium]` — spoofable). An attacker who can send mail to the inbox can mint expenses/receipts attributed to a Technician. Combined with duplicate drafts on crash/retry (no `Message-ID` dedup). **Fix:** sender-domain allowlist → Technician mapping; unique `Message-ID`; quarantine unknown senders. Document SPF/DKIM/DMARC at the infrastructure level.

### C5. Stored XSS via file serving (bank-grade data exposure)
Client-supplied `Content-Type` echoed on download (`InsuranceController.kt:126,160-165`, `[high]`), no magic-byte check, no `nosniff`/attachment. A `.png` containing HTML serves as HTML on the app origin — session tokens and financial data are at risk. **Fix:** server-side magic-byte→content-type map, `application/octet-stream` or exact map, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.

### C6. Silently wrong storage location (unsupported providers fall back to local)
`smb`/`webdav`/`sftp` configurations silently use the local provider (`StorageService.kt:86-129`, `[medium]`) — receipts land on a disk the operator never configured, and secrets are stored unused. In a finance context this is a data-governance failure. **Fix:** reject unsupported types at config validation.

---

## Moderate

| # | Pitfall | Backlog reference | Mitigation |
|---|---------|-------------------|------------|
| M1 | Local-storage path traversal (canonical containment missing) | `StorageService.kt:207-209` `[medium]` | Mirror the remote branch's `startsWith(canonicalBase+sep)` check |
| M2 | Storage migration non-idempotent; reads point mid-migration | `StorageMigrationEngine.kt:30-57` `[medium]` | Per-file progress + reaper; fail-closed reads during migration |
| M3 | CSV formula injection | `ExpenseService.kt:457-475`, `ReportController.kt:422-436` `[medium]` | Already partially handled in `ExportService.sanitizeFormula`; extend to all fields + Excel BOM note |
| M4 | `OptimisticLockException` → 500 on double-submit; expense double-attach | `ExpenseReportLifecycle.kt:25-127` `[medium]` | Map OLE→409 + retry hint; unique constraint on report–expense join |
| M5 | Fallback FX rate cached under requested date | `FxService.kt:62-80` `[~] medium` | Only cache date-specific successes or store actual source date — P1 hard requirement |
| M6 | Moderators can create/delete paid advances | `AdvanceController.kt:64,98,123,212,222` `[~] medium` | `canManage` for paid-advance paths |
| M7 | Oversize uploads → 500 not 413; size checks post-buffer | `ValidationExceptionHandler.kt`, `InsuranceController.kt:64-93` `[~] medium` | Map `MaxUploadSizeExceededException`; enforce pre-buffer |
| M8 | OCR runs sync on HTTP thread with unbounded concurrency | `OcrController.kt:32-85`, `BulkExpenseController.kt:48-103` `[medium]` | Semaphore + throttle + magic-byte validation |
| M9 | Duplicate emails allowed → ambiguous identity | `UserController.kt:37-58` `[medium]` | Unique constraint + 409 |
| M10 | Cache-download swallows failures → receipts vanish from exports | `StorageService.kt:228-240` `[medium]` | Rethrow / explicit missing return |
| M11 | PDF merge unbounded memory | `PdfService.kt:702-717,47-59` `[medium]` | Chunked/page-streaming merge |
| M12 | Manual FX rate persists after switching back to EUR; amount cleared writes 0 | `ExpenseForm.tsx:152`, `BulkReviewDrawer.tsx:264` `[medium]` | Reset manual rate on currency switch; controlled numeric input |
| M13 | Bulk upload silent failure (no onError) | `BulkReviewDrawer.tsx:38-44` `[high]` | Error banner + distinct state |
| M14 | Stuck drag-drop overlay after drop | `BulkUploadZone.tsx:31-35` + `ExpensesClient.tsx:61-70` `[high]` | Reset counter in `handleFilesDropped` + overlay dragleave |

## Minor

| # | Pitfall | Backlog reference |
|---|---------|-------------------|
| L1 | Proactive refresh bypasses `isRefreshing` guard (storms) | `frontend/lib/auth.ts` + `AuthProvider.tsx:43` `[high] frontend` |
| L2 | `formatDate` UTC-parse off-by-one in negative offsets; no timeZone → SSR mismatch | `frontend/lib/format.ts:57-64` `[medium]` |
| L3 | `en-EU` invalid locale → US date/money formatting | `frontend/i18n/config.ts:5`, `lib/format.ts:9-11` `[medium]` |
| L4 | Server/Client React Query key mismatch → double fetch | `frontend/app/expenses/page.tsx:20` vs `ExpensesClient.tsx:90` `[high]` |
| L5 | N+1 on expense/report/advance lists | `ExpenseMapper.kt:23`, `ReportMapper.kt:90-92`, `AdvanceController.kt:43-49` `[medium]` |
| L6 | Unbounded pagination/search/dashboard queries | `SearchController.kt:45-47`, `DashboardController.kt:179-199` `[medium]` |
| L7 | OSIV on → lazy-load masks; holds connections per request | `application.yml` `[info]` |
| L8 | Rate limiter memory-leak DoS (map never pruned) | `RateLimitingFilter.kt:88-103` `[high]` (paired with trusted-header issue) |
| L9 | `CryptoService` token TTL never validated; CBC keys from `jwt.secret` | `CryptoService.kt:58,96-99` `[medium]` |
| L10 | CSRF 403s all non-browser clients (curl/integrations) | `SecurityConfig.kt:100-104` `[medium]` |
| L11 | `recall` keeps stale signature/rejection metadata | `ExpenseReportLifecycle.kt:77-93` `[low]` |
| L12 | Rejected-report expenses individually editable | `ExpenseService.kt:173` `[low]` |
| L13 | Unknown persisted report status → 500 on every read | `ExpenseReportLifecycleState.kt:14-20` `[low]` |
| L14 | No reaper for stuck OCR jobs; no OCR cross-domain dedup; cache write amplification | `AsyncOcrService.kt:35-37`, `OcrService.kt:164-187` `[low]` |
| L15 | OCR amount double-roundtrip precision loss; MIME from extension | `OcrService.kt:380,417-422,192-204` `[low]` |
| L16 | `@Scheduled` + `@Async` overlapping IMAP polls | `EmailImportService.kt:546-547` `[low]` |
| L17 | Total-sort `OR` fallback → NaN on 0 totals | `ReportsClient.tsx:140-141` `[low]` |
| L18 | `BigDecimal(it)` on corrupt settings → 500; racy category uniqueness | `AppSettingsController.kt:70-88`, `CategoryController.kt:31-43` `[info]` |

---

## Domain-ecosystem pitfalls beyond the backlog (discovered in research)

1. **Advance/reimbursement tax reclassification (HIGH):** unresolved advances or under-documented reimbursements can be treated as **taxable income** (adding income tax + CAS/CASS for the Technician). Domain requirement: settlement windows + documentation completeness must be enforced by the lifecycle, and the feedout must prove it. Not currently in the backlog.
2. **Diurnă (per-diem) cap handling (HIGH):** non-taxable ceiling is 57.5 RON/day (domestic) and 2.5× the legal per-country amount abroad; amounts above the cap are taxable. If Xpenses ever models diurnă, the cap must be configurable per year.
3. **Mileage deductibility nuance (HIGH):** Romania has **no fixed per-km rate**; reimbursement is by actual fuel consumption + decont de transport, with **50% VAT/deductibility limits for personal cars** mixed use and 100% for company cars with travel logs. The app must not hardcode a universal per-km number.
4. **Receipt admissibility (MEDIUM):** fuel reimbursement requires receipts with the **company CUI**; without them the employer loses deductibility. OCR/validation should expect and flag a CUI on fuel receipts.
5. **e-Factura scope creep (MEDIUM):** e-Factura is mandatory B2B in RO-CIUS/UBL 2.1 — but **reimbursements are not invoices**. Building e-invoice submission is out of scope; the feedout must stay a *decont* document, not an invoice. If the org later needs supplier-invoice capture, that is a separate product question.
6. **LLM OCR drift (MEDIUM):** Gemini model versions change behavior; the code pins a specific model but relies on a fallback chain — retry/re-rank logic must be test-pinned so a provider rename doesn't silently change extracted amounts.

## Phase-Specific Warnings

| Phase (per SUMMARY.md) | Watch for | Why now | Failing appears as |
|------------------------|-----------|---------|--------------------|
| P1 Financial integrity | Unvalidated `fxRate`; wrong-date cache; OLE/409; authz on paid advances; mutable paid/requested advances | These defects corrupt the source-of-truth the feedout reads | Negative/zero EUR amounts; expense in two reports; moderator edits a paid advance |
| P2 Security | Rate-limiter trust of `X-Forwarded-For`; stored-XSS file types; CSRF 403 for integration clients; crypto TTL | Prevents a forged/abused path from touching finance | 403s for accountants' scripts; `.png` serving HTML; fake-IP bypass of limits |
| P3 Feedout exports | Frozen-value read model; streaming (SXSSF/StreamingResponseBody); CSV injection; i18n decimal/date format | Export is the milestone's deliverable | Exported ≠ reported totals; memory blowup on big reports; Excel formula executes |
| P4 Ingestion quality | Magic-byte validation; duplicate receipts (content hash / Message-ID); sender allowlist; OCR throttling | Improves data quality feeding P3, only if budget remains | Duplicate drafts; spoofed receipts; pool exhaustion during bulk OCR |

## Cross-cutting notes

- The `[?]` backlog items (OSIV, CSRF non-browser, CSV injection, spreadsheet rendering, provider lifecycle) are deployment/environment-dependent — confirm the proxy + deployment topology (where the reverse proxy lives, which headers it sets) **before** scheduling P2.
- P3 export accuracy is only as trustworthy as P1's rate/postings — treat P1 as a hard dependency of P3, not a preference.
- Preserve frozen historical rates while touching the FX cache (FX-05): any migration in P1/P3 must not recompute already-posted history.