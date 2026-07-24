# Handoff: Codebase Audit & Fixes

## State
All 13 audit-fix tasks completed and committed (`a8a1e46`). Backend tests pass, frontend tsc+eslint clean.

## What Was Done

### Critical Bugs Fixed
- `JwtAuthenticationFilter` — token version mismatch now returns 401 instead of silently continuing chain
- `ExpenseForm.tsx` — blob URL memory leak fixed (revoke on file list change)
- `useBodyScrollLock.ts` — counter-based nesting support for stacked overlays
- Backend `.dockerignore` created (cuts Docker context from ~2GB to ~200KB)

### Performance
- DashboardController: N+1 queries → single GROUP BY + @EntityGraph queries (6 queries → 2-3)
- ExpenseService: FX rate HTTP calls moved outside @Transactional boundary
- StorageService: `getStorageConfig()` now cached (5min TTL) — eliminated DB read per file op
- RateLimitingFilter: Regex extracted to companion object (was recompiled per request)
- Frontend: TanStack Query keys flattened to primitives (3 components) — stops unnecessary refetches

### Code Quality
- `controllers/ReportOwnership.kt` — shared utility, replaces duplicate `verifyReportOwnership` in AdvanceController + MileageController
- `ExpenseController` → `ExpenseService`: moved receipt upload/delete business logic (100+ lines)
- Removed unused `spring-boot-starter-data-ldap` dependency

## Suggested Skills
- `backend-dev` — for any further backend work
- `frontend-dev` — for any further frontend work
- `openspec-apply-change` — if following OpenSpec workflow for remaining items

## Remaining Items from Audit (Not Done)
- `ExpenseForm.tsx:408` — wrong icon (Camera → Trash2) for delete receipt button
- `middleware.ts:6` — `/api/*` auth bypass in middleware (intentional? needs review)
- `next.config.ts:23` — CSP `unsafe-inline` (requires production nonce setup)
- `docker-compose.yml:74` — hardcoded production URL in docker-compose
- `EmailImportService.kt:406` — Gemini HTTP call inside @Transactional
