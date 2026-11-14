# Technical Constraints

No standalone SPEC or RFC documents were discovered.

- source: `docs/adr/0001-bnr-fx-rates-with-margin.md`
- type: domain-policy
- content: Margins apply only to the source-currency leg. Applying a margin to both legs is explicitly rejected because it partially cancels the spread.

- source: `docs/adr/0001-bnr-fx-rates-with-margin.md`
- type: data-integrity
- content: Existing posted expenses keep their frozen rates. The FX cache may be purged once during migration, but historical numbers must never be silently recomputed.
