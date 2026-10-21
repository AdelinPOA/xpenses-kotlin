# Feature Landscape — Xpenses

> Historical research: references to root `todo.md` now refer to `docs/archive/root-md-2026-10-18/todo.md`. Its findings are not current verification; use `README.md` and the documentation-review reports before planning work.

**Mode:** Ecosystem
**Date:** 2026-08-04
**Source threads:** `todo.md` backlog, comparable tools (SAP Concur, Expensify, Rydoo, Zoho Expense, Certify, field-service tools), Romanian expense-reimbursement practice.
**Vocabulary per CONTEXT.md:** Receipt, Expense, Original currency, EUR amount, FX rate, FX margin, Manual rate, Advance, Technician.

---

## Table Stakes

What users of an expense tool for field-service technicians now expect. Xpenses already covers most of the capture→report→approve→reimburse spine; the cells marked **GAP** are the market floor it is missing.

| Capability | Market expectation | Xpenses today | Confidence |
|------------|-------------------|---------------|------------|
| Receipt capture (photo / upload / bulk) | Must be mobile-friendly, tolerate tilted/low-light photos | Yes — bulk upload UI + sync/async OCR | HIGH |
| OCR extraction of merchant/date/amount/currency | Out-of-box, no template setup; ~97–99% on clean images (LLM tier) | Yes — Gemini multi-tier fallback | HIGH |
| **Duplicate-receipt / amount-altered detection** | Flag duplicated or altered receipts before approval | **GAP** — no perceptual/amount duplicate screening | MEDIUM |
| Email-forward ingestion | "Forward receipt to expense-inbox" | Partial — IMAP import exists but lacks `Message-ID` dedup and sender allowlist | HIGH |
| Auto-categorization | Vendor/merchant → category inference | Partial — category assigned; inference from merchant not present | MEDIUM |
| Policy checks at submission | Flag out-of-policy items (limits, categories, receipts missing) before they reach finance | Partial — validation exists; explicit policy rules engine absent | MEDIUM |
| Approval routing (multi-level, by threshold/department) | Configurable chains | Single-level manage/review present; routing depth limited | MEDIUM |
| Mileage tracking (per-km or actuals + decont) | GPS or log-based, rate matrix per country/year | Basic mileage present with FX snapshot (V31) | HIGH |
| Per-diem / diurnă management | Non-taxable daily cap handling (RO: 57.5 RON/day domestic) | **GAP** — no diurnă concept in backlog | HIGH |
| Advances with settlement | Request → approve → disburse → settle vs actual spend; surplus return / top-up; 30–60 day windows | Present (`AdvanceController`) — needs `canManage` + mutation-gate hardening | HIGH |
| Reimbursement (net, exact EUR debit) | Pay exact amount shown in report | Present — EUR is identity, reimbursement = EUR | HIGH |
| Multi-currency with country-relevant FX | Rates that match real bank debits, frozen at date | **Differentiator** — BNR + margin, frozen, immutable | HIGH |
| PDF report | Print/audit report with totals | Present (`PdfService`) — merge memory issues to fix | HIGH |
| XLSX / CSV export | Open in Excel, feed the accountant | Present (`ExportService`) — needs SXSSF streaming + BOM + fixed layout | HIGH |
| Accounting-ready feedout | Export the accountant can import (SAGA/WinMentor) | **GAP** — export exists but not tuned to accountant import | MEDIUM |
| Dashboards & reporting | Spend visibility, manager dashboard | Present — unbounded aggregation to fix (SQL + Pagable) | HIGH |
| Audit trail | Every change attributable with history | Partial — `@Version` + lifecycle exist; no change-audit log | MEDIUM |
| Corporate card / transaction matching | Auto-match receipts to card feeds | **GAP** — out of scope for this org's model (out-of-pocket + advance) | MEDIUM |

## Differentiators

These are where Xpenses beats the generic market and should be protected — export work must not regress them.

1. **BNR + per-currency margin FX, frozen at expense date, immutable after posting (`FX-01`–`FX-05`).** Concur/Zoho/Rydoo use ECB or provider mid-rates that sit below the amount a Romanian bank actually debits. The ADR-pinned policy with `fx_rate_manual` as the escape hatch is the honest answer to "why is the EUR amount higher than Google's rate?" and is the feature finance will trust. **The feedout must print this exactly.**
2. **Reimbursement equals the exact debit.** "EUR amount is the canonical value and the reimbursement amount" is a crisp, auditable identity (vs. tools that reimburse in original currency or at live rates).
3. **Field-service technician-first workflow.** Decont-style report, advance-driven travel, per-country mileage/diurnă — the shape of a Romanian field-service company's reality, not a startup expense tracker.
4. **Immutable historical postings.** Already-posted expenses never silently recompute (`FX-05`). Rare in the market and invaluable for audit.

## Anti-Features (explicitly NOT to build)

| Anti-feature | Why not |
|--------------|---------|
| Corporate card issuing, virtual cards, or a payments rail | Turns the project into a payments/FI product (KYC, card networks, PSP). Out-of-pocket reimbursement + advances is the org's model. |
| Becoming an e-invoicing operator (e-Factura submission) | Reimbursements are not invoices. The org must already submit supplier invoices via its own invoicing/accounting stack. Xpenses only needs to *feed* that stack. |
| General ledger / journal / payroll / full ERP | SAGA/WinMentor already own the books; Xpenses exports to them, it does not recreate them. |
| Travel booking / trip agent (Concur-Travel style) | No backlog signal; field-service deplasare is advance + per-diem, not booking. |
| Self-training OCR model pipeline | Distraction; LLM OCR already delivers; the value is in validation around it, not in model training. |
| Native mobile offline app | Overwrites the web app's reach; a PWA-grade improvements pass on the existing Next.js frontend serves field technicians cheaper. Revisit only on explicit request. |
| Multi-entity / multi-company consolidation | Single field-service org; the accountant consolidates elsewhere. |

## Feature Dependencies

- **OCR quality depends on storage + jobs:** receipts must be stored (blob) before OCR, and the advisory lock must be scoped to the cache-fill critical section or the pool exhausts under load. OCR's accuracy only *matters* once `fxRate > 0` validation and currency/amount normalization are fixed, else OCR output is plausible-garbage.
- **Email import depends on identity:** a spoofed or dedup-failed `From:` creates orphaned drafts/expenses. Sender allowlist and `Message-ID` uniqueness are prerequisites for treating email as a first-class ingestion path.
- **Exports depend on frozen postings:** CSV/XLSX/PDF exports must read the per-expense FX snapshot (not a live rate) and the posted report totals. The P1 financial-integrity fixes precede export.
- **Advances depend on authorization + lifecycle:** settling an Advance against a Report requires consistent `canManage` rules and a blocked mutation of paid/requested records — otherwise the settlement math is untrustworthy.
- **Feedout depends on accountant target:** the CSV/XLSX layout only means anything once the recipient software (SAGA vs WinMentor vs Excel) is confirmed.

## MVP / Next-milestone Recommendation

**Milestone: "Approval → Accounting: secure, correct, audit-ready reimbursement feedout."**

Scope for the milestone's MVP (one vertical slice, visible to finance):
1. Approved report → single **audit PDF** (unchanged totals, FX snapshot column, per-currency margins listed) and a companion **XLSX/CSV feedout** in a fixed, documented column layout (report no., Technician, date, category, original amount + currency, FX rate + margin + source date, EUR amount, advance-settlement column) that an accountant can import into SAGA-compatible tooling.
2. Underneath it, the P1 financial-integrity fixes so the numbers in the feedout are true, and the P2 security fixes so the pipeline can't be abused to produce the feedout.
3. A **golden-file export test** asserting exported totals == posted EUR values for EUR/RON/margin/fallback/manual-rate cases.

Why this slice: it delivers the org's *money* (finance needs feedouts to pay and record), it exercises the FX policy the company just bet the product on, and every phase has a hard, testable exit criterion consistent with PROJECT.md's core value ("financial records must remain correct and historically stable").