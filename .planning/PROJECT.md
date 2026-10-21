# Xpenses

## What This Is

Xpenses is a full-stack expense-management application for submitting, reviewing, approving, paying, and exporting employee expenses and related financial records.

## Core Value

Financial records must remain correct and historically stable while FX policy behavior stays explicit, configurable, and verifiable across every financial workflow.

## Requirements

- FX-01: Apply one FX policy across expenses, advances, and mileage.
- FX-02: Calculate conversions using BNR rates plus source-currency margins, with ECB/Frankfurter fallback where required.
- FX-03: Support configurable currency margins with validated defaults.
- FX-04: Resolve rates for the expense date, including prior banking-day fallback and manual overrides.
- FX-05: Preserve posted financial values and prevent migrations or cache cleanup from recomputing history.

## Overview

Xpenses is a full-stack expense-management application for submitting, reviewing, approving, paying, and exporting employee expenses, reports, advances, mileage, receipts, inventory, and insurance records.

This is a brownfield project. The current implementation consists of a Kotlin/Spring Boot backend, Next.js frontend, PostgreSQL database, Flyway migrations, container deployment, and Playwright browser tests.

## Current State

**Shipped Version:** v1.0 (2026-08-14)
- **Milestone v1.0 (Financial FX Reliability):** Validated and hardened the locked BNR-plus-margin FX policy across expenses, advances, mileage, admin settings, and historical migrations.
- **Verification:** 100% verified across unit, integration (Testcontainers PostgreSQL), and Playwright E2E suites.

## Next Milestone Goals

- Promote items from backlog (`docs/archive/root-md-2026-10-18/todo.md` (historical; recheck against `README.md` and GitHub Issues) and `.planning/codebase/CONCERNS.md`) into Milestone 2 (e.g. Async OCR Scaling & Queue Worker, Email Ingestion Hardening, or Export Enhancements).

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
- Detailed reviewed backlog: `docs/archive/root-md-2026-10-18/todo.md` (historical; recheck against `README.md` and GitHub Issues)

## Success Metric

Every planned FX change can be traced to the ADR, covered by focused backend/frontend tests where applicable, and demonstrated without silently changing historical financial totals.

## Target Runtime

Java 21/Spring Boot backend, Node/Next.js frontend, PostgreSQL 16, Docker Compose deployment.
