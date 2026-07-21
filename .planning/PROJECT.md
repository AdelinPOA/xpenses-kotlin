# Project Context & Milestone

## Overview
**Project**: `xpenses-kotlin`
**Milestone**: Codebase Optimization, Security & Reliability Hardening
**Core Objective**: Implement security hardening, DB query & soft-delete optimizations, transaction decoupling, monetary precision normalization, Next.js build fixes, and Docker container security.

## Target Scope & Requirements

### Phase 1: Quick Fixes & DX Cleanup (Frontend & DevOps)
- REQ-01: Configure `outputFileTracingRoot` in `frontend/next.config.ts` and update `package.json` lint script to ESLint CLI.
- REQ-02: Update `backend-kotlin-jpa/Dockerfile` and `frontend/Dockerfile` to run as unprivileged non-root user (`appuser`).

### Phase 2: Database Indexing & Soft-Delete Cascading (Backend & DB)
- REQ-03: Create Flyway migration `V27__add_performance_indexes.sql` for high-frequency search fields.
- REQ-04: Implement service-layer cascade soft-delete in `ReportService` and `ExpenseService` for child expenses & receipts.

### Phase 3: Security & Input Validation (Backend Security)
- REQ-05: Implement API Rate-Limiting filter for sensitive endpoints (`/api/auth/login`, `/api/expenses/scan`, export routes).
- REQ-06: Implement binary magic-byte MIME validation for uploaded receipts, signatures, and insurance files.

### Phase 4: Performance & Financial Precision (Backend & Frontend)
- REQ-07: Decouple heavy PDF/Excel document rendering from database transaction boundaries.
- REQ-08: Normalize monetary calculations to `BigDecimal` (replace floating-point `.toDouble()` in OCR & bulk processing).
- REQ-09: Add dynamic imports for heavy UI components (signature canvas, PDF viewer) and fine-tune TanStack Query `staleTime`.
