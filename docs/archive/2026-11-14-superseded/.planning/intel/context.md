# Supporting Context

The repository is an existing brownfield expense-management application. The codebase map in `.planning/codebase/` identifies a Kotlin/Spring Boot backend, Next.js frontend, PostgreSQL persistence, Flyway migrations, and Playwright coverage.

The ADR records that ECB/Frankfurter mid-market rates alone understate real bank debits, while scraping a specific bank card-rate page would be unofficial and provider-specific. BNR is the authoritative base rate, with a configurable margin modeling the bank spread.

Source: `docs/adr/0001-bnr-fx-rates-with-margin.md`
