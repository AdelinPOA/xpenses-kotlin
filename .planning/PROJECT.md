# Xpenses

## Overview

Xpenses is a full-stack expense-management application for submitting, reviewing, approving, paying, and exporting employee expenses, reports, advances, mileage, receipts, inventory, and insurance records.

This is a brownfield project. The current implementation consists of a Kotlin/Spring Boot backend, Next.js frontend, PostgreSQL database, Flyway migrations, container deployment, and Playwright browser tests.

## Current Focus

Establish a trustworthy planning baseline for the existing system, beginning with the locked FX conversion policy: BNR reference rates plus configurable source-currency margins, frozen at the expense date and applied consistently across financial workflows.

## Goals

- Preserve financial correctness and historical rate immutability.
- Make FX policy behavior explicit, configurable, and testable.
- Plan future improvements as verifiable vertical slices grounded in the existing architecture.
- Keep backend, frontend, migrations, and integration tests aligned.

## Non-Goals

- Rewriting the application or changing its Kotlin/Spring Boot and Next.js architecture.
- Recomputing already-posted expenses without an explicit migration decision.
- Replacing the locked BNR-plus-margin policy with a bank-specific scraped rate.

## Locked Decisions

- BNR is the primary reference-rate source.
- Margins apply only to the source-currency leg; EUR is identity and RON has no margin.
- Unsupported BNR currencies fall back to ECB/Frankfurter with the same margin.
- Rates lock to the receipt/expense date, with the latest banking day used for weekends and holidays.
- Existing posted rates remain frozen; manual override remains available.

## Codebase References

- Codebase map: `.planning/codebase/`
- ADR: `docs/adr/0001-bnr-fx-rates-with-margin.md`
- Detailed reviewed backlog: `todo.md`

## Success Metric

Every planned FX change can be traced to the ADR, covered by focused backend/frontend tests where applicable, and demonstrated without silently changing historical financial totals.

## Target Runtime

Java 21/Spring Boot backend, Node/Next.js frontend, PostgreSQL 16, Docker Compose deployment.
