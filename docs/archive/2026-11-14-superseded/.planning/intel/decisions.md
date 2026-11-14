# Locked Decisions

## ADR-0001: BNR FX rates with per-currency margins

- source: `docs/adr/0001-bnr-fx-rates-with-margin.md`
- status: locked (Accepted by decision content; no contradictory status metadata present)
- decision: Convert foreign-currency receipts to EUR using the BNR daily reference rate plus a margin on the source-currency leg. EUR is identity; RON uses the inverted BNR EUR rate without margin; unsupported BNR currencies fall back to ECB/Frankfurter with the same margin.
- scope: expenses, advances, mileage, FX cache, report-level rate policy
- constraints: lock the rate at receipt/expense date; weekends and holidays use the most recent banking day; manual-rate override remains available; already-posted expenses retain frozen rates.
