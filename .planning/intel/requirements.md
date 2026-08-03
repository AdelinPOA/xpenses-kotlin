# Requirements Intel

No PRD or SPEC documents were discovered. The following implementation requirements are derived from the locked ADR and are traceable to it.

## REQ-fx-policy

- source: `docs/adr/0001-bnr-fx-rates-with-margin.md`
- description: Apply one consistent FX conversion policy to expenses, advances, and mileage.
- acceptance: EUR remains identity; RON converts without margin; other currencies apply a per-currency source-leg margin; unsupported BNR currencies use ECB/Frankfurter fallback.

## REQ-fx-date-lock

- source: `docs/adr/0001-bnr-fx-rates-with-margin.md`
- description: Resolve and freeze the conversion rate using the expense/receipt date.
- acceptance: weekends and holidays use the latest published banking day; manual override remains possible; historical posted values are not silently recomputed.

## REQ-fx-settings

- source: `docs/adr/0001-bnr-fx-rates-with-margin.md`
- description: Store configurable per-currency margins with documented defaults.
- acceptance: `fx_margins` is stored as an application setting with EUR 2.0%, USD 2.5%, GBP 2.0%, CHF 2.0%, and 2.0% default otherwise.
