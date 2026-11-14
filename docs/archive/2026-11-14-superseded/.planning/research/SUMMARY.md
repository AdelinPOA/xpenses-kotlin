# Domain Ecosystem Research — Xpenses

> Historical research: references to root `todo.md` now refer to `docs/archive/root-md-2026-10-18/todo.md`. Its findings are not current verification; use `README.md` and the documentation-review reports before planning work.

**Mode:** Ecosystem
**Date:** 2026-08-04
**Scope:** technician/field-service expense management, comparable tools, Romanian/EU regulatory context, and the roadmap backlog in `todo.md`

---

## Executive Summary

Xpenses operates in a market that has largely moved past "digitize the receipt" and toward **policy enforcement at submission, card-led spend control, and close-ready accounting output**. The field-service niche that Xpenses serves adds three distinctive pressures a generic SME tool ignores: **mileage and per-diem rules that vary per country**, **advance (avans) settlement against actual spend with hard tax windows**, and **receipt submission by a mobile worker who is not a desk employee**. The realistic competitive reference points are Rydoo (EU-oriented automation), Expensify (SmartScan receipt capture), SAP Concur (enterprise policy depth — table stakes floor, not a target for a field-service tool), and the Romanian local context where the accountant lives in **SAGA or WinMentor**, not in the expense tool.

The business the app is embedded in is Romanian/EU-facing and cross-border: technicians work abroad, pay in RON/EUR/other currencies, and are **reimbursed in EUR for the exact value debited from their bank account**. This is exactly the setting that makes the completed milestone-1 FX policy (BNR + per-currency margin, frozen at expense date, immutable history) a genuine differentiator rather than a compliance footnote: generic tools convert with ECB/Frankfurter mid-rates that sit visibly below real bank debits. Romania's regulatory environment is the strongest external driver of future work: e-Factura (UBL 2.1/RO-CIUS) and SAF-T D406 are mandatory reporting regimes for B2B and larger taxpayers, while the everyday "decont de cheltuieli" document, per-diem (diurnă) caps, mileage deductibility rules, and the std. accounting-controller in SAGA shape what finance expects an export to look like. **The single most valuable, defensible feature Xpenses can build next is delivery of expense data into the accountant's existing software** — not an e-invoicing platform.

The `todo.md` backlog is not greenfield feature work; it is **hardening of a pipeline that already exists** (OCR on Gemini, IMAP email import, POI/PDF exports, local/S3 storage, `@Async`/`@Scheduled` jobs). The open items cluster into five risk vectors: (1) financial integrity/concurrency (invalid `fxRate`, fallback cached under the wrong date, optimistic-lock double-attach, paid-advance authorization), (2) security (rate-limiter trust of forged headers, stored-XSS file serving, CSRF 403s for non-browser clients, crypto TTL), (3) ingestion data quality (OCR advisory lock across network calls, email deduplication/spoofing, magic-byte validation, upload size), (4) performance (N+1, unbounded lists, OSIV), and (5) frontend money-handling UX (UTC date off-by-one, amount-zero on cleared field, stalled bulk-upload states). Export accuracy problems sit on top of the first vector, so export work must wait on or bundle the financial-integrity fixes.

The next milestone should therefore be a **vertical, externally-visible slice: "Approval → Accounting feedout"** — approve a report, and hand finance a correct, audit-ready PDF plus an accountant-importable XLSX/CSV that reflects the frozen EUR amounts and the locked FX snapshot. Its phases must first quarantine the financial-integrity and concurrency defects that would otherwise corrupt the feedout, then the security items that would let a forged or abused path affect it, then the export layer itself, then (only if the vertical slice needs it) the OCR/email ingestion improvements that feed approved reports. This keeps every phase grounded in the milestone's success metric: **exported numbers exactly equal reported totals, derived from frozen postings, every time.**

## Key Findings

- **Table stakes (HIGH):** receipt capture (photo/upload/email-forward), OCR extraction, auto-categorization, approval routing, policy checks at submission, mileage and per-diem, advances + settlement, reimbursement, multi-currency, duplicate-receipt detection, PDF/XLSX/CSV export, dashboards, audit trail, accounting sync. Xpenses already implements most of this; the gaps versus the market floor are **fraud screening** (duplicate-receipt detection beyond a manual glance, amount-alteration checks) and **accounting-ready feedouts**.
- **2026 market trend (MEDIUM):** automation is moving upstream — tools now prevent non-compliant spend *before* submission and add fraud flags (duplicate/altered/AI-generated receipts), and finance expects **close-ready exports**, not dashboards they must transcribe. This confirms export + integrity as the highest-leverage backlog area.
- **Romania regulatory reality (HIGH):** e-Factura is mandatory for B2B (since Jan 2024; B2C e-reporting Jan 2025; small-entity extension to Jul 2026) in RO-CIUS/UBL 2.1 with fines up to RON 5,000–10,000 and **loss of VAT deduction** on non-compliant invoices — **but employee expense reimbursements are not invoices**, so Xpenses does not need to be an e-invoicing operator. What the company *does* need is a feedout the accountant can post in SAGA/WinMentor (CSV/XLSX import templates are the established transfer format; Quick Importer and similar tools are how data crosses).
- **BNR anchor is market-correct (HIGH):** BNR publishes a daily reference rate (~13:00, XML for developers, history since 2005) and explicitly states its rates are *not compulsory* for actual FX operations or accounting — which is precisely why the ADR margin exists to model real bank debits. BNR + margin + frozen-at-expense-date is defensible to auditors; the fallback-cache-uses-wrong-date defect in the backlog undermines it and must be closed before exports.
- **Reimbursement/advance tax sensitivity (HIGH):** under-documented reimbursements and unresolved advances can be reclassified as **taxable income** (Romanian regime: fixed per-diem cap = non-taxable ceiling of 57.5 RON/day domestic; loose reimbursement = taxable + contributions). Opens a real domain requirement: the report/advance lifecycle must enforce settlement windows and prove documentation, and the feedout must carry diurnă/mileage/decont markers.

## Implications for Roadmap

### Suggested next-milestone structure

Proposed milestone: **"Approval → Accounting: secure, correct, audit-ready reimbursement feedout."**

| Phase | Name | Primary backlog sources | Exit criterion |
|-------|------|-------------------------|----------------|
| 1 | **Financial integrity & concurrency quarantine** — validate `fxRate > 0`, cache fallback under the actual source date, OLE→409 with atomic membership check, completed paid-advance authorization (moderator `canManage`), lifecycle requirement on state transitions, block paid/requested mutations | Core Domain/Concurrency section | No path can persist a corrupt FX amount or double-attach an Expense to two Reports; history unchanged |
| 2 | **Security hardening** — rate-limiter keying + pruning, stored-XSS file serving (magic bytes, `nosniff`, attachment), CSRF non-browser exemption, 413 on oversize uploads, crypto TTL + dedicated secret, email uniqueness | Security / Storage sections | OWASP-style checks green; forged-IP and file-content-type vectors closed |
| 3 | **Approval → Accounting feedout** — frozen-value read model, streaming PDF/XLSX/CSV export, CSV-injection neutralization, i18n money formatting, accountant-ready SAGA/WinMentor layout, export accuracy tests | Export/PDF/Controller sections | Exported report totals == reported totals == posted EUR values, byte-for-byte on goldens |
| 4 | **Ingestion quality (only as the slice demands)** — OCR advisory-lock bound to cache-fill, sync `/scan` throttle + magic bytes, email `Message-ID` dedup + sender allowlist, storage path-traversal + migration reaper | Storage/PDF/OCR/Email section | Every ingested receipt is deduped, type-checked, and attributable to a verified sender |

**Phase ordering rationale:** financial integrity (P1) must precede export (P3) because a feedout that carries a negative EUR amount or a wrong-date FX rate would poison the accountant's books and is the worst failure mode for a finance product. Security (P2) precedes export too, and is cheap relative to its risk (several are one-liner fixes). Export (P3) is the externally-visible deliverable and can be developed independently once P1/P2 are in, because it reads only frozen postings. Ingestion (P4) is deliberately last: OCR/email improvements are throughput/convenience, not correctness, and their known defects (advisory-lock on HTTP thread, duplicate drafts) don't corrupt posted finance.

**Research flags per phase:**
- P1 — verify the narrowed scope of the `[~]` items (advance authorization, FX fallback cache) against current source before scheduling; these were partially fixed.
- P2 — the `[?]` deployment-policy items (CSRF non-browser clients, rate-limiter trust model) require an environment/proxy decision first.
- P3 — confirm the accountant's actual target (SAGA vs WinMentor vs Excel-only) and the exact import layout before building the template exporter; confirm export consumers' expectations (EUR decimal places, separators, column headers).
- P4 — validate OCR provider retention (Gemini) against receipt-data residency rules and confirm email RX provider support for the verify-header approach.

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Field-service expense workflows (mileage, per-diem, advances, reimbursement) | HIGH | Consistent across multiple practitioner sources (ExpenseAnywhere, Rydoo compliance, ANAF-linked guides, Mekari) and matches Xpenses domain vocabulary |
| Romanian regulatory context (BNR, e-Factura, SAF-T, decont, diurnă) | HIGH | Recorded in official/primary sources: bnr.ro XML endpoint, ANAF-linked HG 582/2015, Invoice Navigator, taxpayer summaries (PwC) |
| Competitive landscape (Concur, Expensify, Rydoo, Zoho, field-service tools) | MEDIUM | Derives from vendor marketing and comparison articles (fanruan, worldmetrics, OFX); positioning facts reliable, accuracy claims not independently verified |
| OCR accuracy tiers and best-fit engine | MEDIUM | Tiering (template ~64%, AI ~85–95%, LLM ~97–99%) consistent across sources; absolute numbers are vendor/organization-specific |
| Library/stack recommendations (POI SXSSF, Jakarta Mail, email auth) | MEDIUM | POI streaming facts verified against Apache POI source via ctx7; email-auth lib recommendations could not be full-vetted in this pass |
| Next-milestone prioritization | MEDIUM | Option is a judgment call grounded in backlog severity + domain value; validated against the project's "financial correctness is identity" core value |

### Gaps to Address

1. **No user/stakeholder interview data** — who actually receives the XLSX/CSV, which accounting software is used (SAGA/WinMentor/other), and whether the feedout goes to a human or an import tool. This is the single biggest unknown for the export phase.
2. **Fraud/duplicate-receipt detection is absent from the backlog** yet is market table-stakes in 2026; needs a scoping question (perceptual hash of stored blobs, amount-match on same-merchant/date).
3. **Delivery of the feedout is unspecified** — file download per report vs scheduled monthly package vs API push to the accountant's software.
4. **e-Factura/SAF-T scope decision unstated** — confirm the org is not in-scope for these regimes at the employee-expense level (reimbursements are not invoices), so the roadmap doesn't accidentally build e-invoicing.
5. **Mileage/per-diem configuration depth** — the app has mileage but the backlog has no work to model diurnă caps or per-km policy; whether that is in-scope for the next milestone must be decided explicitly.
6. **OCR provider retention decision** — keep the Gemini multi-tier fallback, or add a self-hosted tier for receipt-data residency; flags the existing "OCR amount double-roundtrip precision loss" item.