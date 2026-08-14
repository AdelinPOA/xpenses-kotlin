# Expenses convert to EUR at the BNR reference rate plus a per-currency margin

Receipts are uploaded in many currencies, and technicians are reimbursed in EUR for the exact amount debited from their bank account. ECB/Frankfurter mid-market rates were always below what a Romanian bank (UniCredit, BCR) actually debits — card settlements are priced at the card organization's rate plus the bank's conversion commission (~1–3% over market). From now on the system converts foreign-currency receipts to EUR using the **BNR (Banca Națională a României) daily reference rate** — official, published per banking day at 13:00, immutable history since 2005 — **plus a per-currency margin** that models the bank spread (the "vânzare" side of the market).

Rules settled during design:

- EUR receipts are identity (rate = 1, no margin). RON receipts convert at the plain BNR EUR rate inverted — **no margin**, because a RON payment incurs no currency conversion charge and the RON amount *is* the exact debit.
- Margins apply to the **source-currency leg only**: `USD→EUR = (BNR_USD × (1 + m_USD)) / BNR_EUR`. Applying margins to both legs partially cancels them and does not match how banks price debits.
- Margins are **per currency**, stored as a JSON `AppSetting` (`fx_margins`), defaults EUR +2.0%, USD +2.5%, GBP +2.0%, CHF +2.0%, +2.0% otherwise.
- Currencies BNR does not publish fall back to the ECB/Frankfurter mid-rate with the same margin applied.
- The rate is locked at the **expense date** (receipt date); weekends/holidays use the most recent published banking day. The existing manual-rate override remains the escape hatch.
- The policy applies to **all FX conversions** (expenses, advances, mileage) — one rate policy per report.
- Existing, already-posted expenses keep their frozen rates; only the stale `fx_rates` cache is purged once during migration. Historical numbers are never silently recomputed.

Considered: ECB/Frankfurter alone (too low vs actual debits), BNR reference without margin (same problem), UniCredit's scraped card-rate page (most faithful for UniCredit but unofficial, fragile, and wrong for BCR technicians), margin on both legs (cancels out). Rejected all but the chosen approach.
