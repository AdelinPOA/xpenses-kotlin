# xpenses-kotlin Code Review

*Generated: 2026-07-19*

---

## 🏗️ Architecture Overview

| Layer | Tech Stack | Pattern |
|-------|-----------|---------|
| **Backend** | Kotlin 2.4, Spring Boot 3.4, PostgreSQL 16 | Layered (Controller→Service→Repository), JPA entities in single file |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript 5, Tailwind v4 | RSC + Client components, TanStack Query v5, dual-API URLs |
| **Auth** | JWT in HttpOnly cookies (15min access / 7d refresh), PBKDF2 HMAC, tokenVersion revocation | Spring Security filter chain + Next.js middleware + AuthProvider |
| **DB** | Flyway migrations (26 versions, `ddl-auto: validate`) | Soft-delete on financial entities, `@Version` optimistic locking |

---

## 🔴 Critical / High Severity Issues

### Backend

| # | Issue | File | Severity |
|---|-------|------|----------|
| **B1** | **Soft-delete not cascaded** — `@SQLDelete` + `@SQLRestriction` on `ExpenseReport`, `Expense`, `Receipt` but **no cascade to children**. Children leak in queries; service layer must manually handle (TODO comments exist). | `Models.kt` | 🔴 Critical |
| **B2** | **Date stored as `TEXT` (`yyyy-MM-dd`)** — prevents native date indexes, range queries, sorting. Parsing in JPQL. | `V1__init.sql`, `Models.kt` | 🔴 Critical |
| **B3** | **Monetary amounts as `DOUBLE PRECISION` in V1** — V20 migrates to `NUMERIC` but entities use `BigDecimal`. Risk of precision loss during transition. | `V1__init.sql`, `V20__*.sql`, `Models.kt` | 🔴 Critical |
| **B4** | **No refresh token reuse detection** — rotated on use but no detection of theft (should revoke chain on reuse). | `JwtTokenProvider.kt`, `AuthController.kt` | 🔴 Critical |
| **B5** | **`Models.kt` = 1,200+ lines, 17 entities** — unmaintainable. Same for `Repositories.kt` (17 repos). | `Models.kt`, `Repositories.kt` | 🔴 Critical |

### Frontend

| # | Issue | File | Severity |
|---|-------|------|----------|
| **F1** | **`ExpenseForm.tsx` = 706 lines** — form, OCR, receipt preview, zoom/pan, FX toggle, upload/delete all in one component. Unmaintainable. | `components/expenses/ExpenseForm.tsx` | 🔴 Critical |
| **F2** | **`ThemeProvider.tsx` bug** — references `setThemeState`/`theme` variables that don't exist (lines 62-65). Context value uses `setTheme` but internal state uses different names. | `components/ThemeProvider.tsx` | 🔴 Critical |
| **F3** | **All API types in `api.ts` (633 lines)** — axios config, interceptors, AND all TypeScript interfaces mixed. Should split to `types/api.ts`. | `lib/api.ts` | 🟡 High |
| **F4** | **Manual `useState` in ExpenseForm** despite `react-hook-form` + `zod` installed. Inconsistent pattern. | `components/expenses/ExpenseForm.tsx` | 🟡 High |
| **F5** | **Middleware only checks cookie existence** — no JWT validation. Relies on client-side `AuthProvider` for actual auth. | `middleware.ts` | 🟡 High |

---

## 🟡 Medium Severity Issues

### Backend

| # | Issue | File |
|---|-------|------|
| B6 | Report state machine logic duplicated across `ReportController.approve/reject/pay/recall` and `ReportService` — should be centralized state machine | `ReportController.kt`, `ReportService.kt` |
| B7 | Missing `@Version` on `User`, `Category`, `Receipt` — lost updates possible | `Models.kt` |
| B8 | `validate-on-migrate: false` in Flyway — allows schema drift in prod | `application.yml` |
| B9 | No header-based JWT fallback — only cookie (limits non-browser clients) | `JwtAuthenticationFilter.kt` |
| B10 | `RateLimitFilter` only on `/api/auth/*` — no general API rate limiting | `SecurityConfig.kt` |
| B11 | Test coverage: only integration tests (Testcontainers). No unit tests for services. | `src/test/` |

### Frontend

| # | Issue | File |
|---|-------|------|
| F6 | `BulkReviewDrawer.tsx` = 323 lines — complex bulk OCR review state | `components/expenses/BulkReviewDrawer.tsx` |
| F7 | `AdminUsersPage.tsx` defines local `userKeys` instead of shared `queryKeys.ts` | `app/admin/users/page.tsx` |
| F8 | No unit/integration tests (only Playwright e2e) | `tests/` |
| F9 | `themes.ts` referenced in AGENTS.md but doesn't exist — themes defined inline in `globals.css` | — |
| F10 | `lib/serverApi.ts` duplicates axios logic instead of sharing with `api.ts` | `lib/serverApi.ts` |

---

## 🟢 Low / Good Patterns

### Backend ✅
- **Security**: PBKDF2-derived HMAC key, tokenVersion revocation, CSRF Origin/Referer check, rate limiting on auth
- **Async**: Two dedicated executors (`applicationTaskExecutor`, `ocrTaskExecutor` with AbortPolicy)
- **Caching**: JCache (Caffeine) + Bucket4j for rate limiting
- **N+1 prevention**: `@EntityGraph` on to-one + `default_batch_fetch_size: 16` for collections
- **Optimistic locking**: `@Version` on financial entities
- **Flyway**: Versioned migrations, never edit existing

### Frontend ✅
- **Dual-API pattern**: SSR uses internal URL, browser uses public URL via rewrites
- **Auth**: HttpOnly cookies, auto-refresh on 401 with request queue
- **Data fetching**: TanStack Query v5 with RSC prefetch + hydration boundaries
- **File downloads**: Blob + `URL.createObjectURL` + synthetic click (no `<a href>` for auth)
- **Dark mode**: CSS-first Tailwind v4 with `.dark` class on `<html>`
- **Responsive**: Mobile cards / desktop tables, mobile bottom nav

---

## 📋 Recommended Action Plan

### Immediate (Critical)
1. **Fix `ThemeProvider.tsx` bug** — broken theme switching
2. **Split `ExpenseForm.tsx`** into: `ExpenseFormFields`, `ReceiptDropZone`, `ReceiptPreview`, `OcrScanner`, `FxRateToggle`
3. **Add refresh token reuse detection** in backend
4. **Implement soft-delete cascade** in service layer (or DB triggers)

### Short-term (High)
5. **Split `Models.kt` / `Repositories.kt`** into per-domain files (`financial/`, `auth/`, `inventory/`, etc.)
6. **Migrate date columns to native `DATE`** via Flyway migration
7. **Extract types from `api.ts`** → `lib/types/api.ts`
8. **Adopt react-hook-form + zod** consistently in forms
9. **Add JWT validation to middleware** (or document why client-only is acceptable)

### Medium-term
10. **Centralize report state machine** into dedicated class
11. **Add `@Version` to User, Category, Receipt**
12. **Enable `validate-on-migrate: true`** in prod Flyway config
13. **Add unit tests** for `ExpenseService`, `FxService`, `ReportService`
14. **Add general API rate limiting** (Bucket4j)
15. **Create `lib/themes.ts`** for theme constants

---

## 🧪 Testing Commands

```bash
# Backend (requires Docker for Testcontainers)
cd backend-kotlin-jpa && ./gradlew test --no-daemon
./gradlew test --no-daemon --tests 'eu.nt.xpenses.report.ReportStateMachineTest'

# Frontend
cd frontend && npx tsc --noEmit && npx eslint .
npm run build
npx playwright test
```

---

## 📁 Key Files to Review First

| Priority | File |
|----------|------|
| 🔴 | `backend-kotlin-jpa/src/main/kotlin/.../models/Models.kt` |
| 🔴 | `backend-kotlin-jpa/src/main/kotlin/.../repositories/Repositories.kt` |
| 🔴 | `frontend/components/expenses/ExpenseForm.tsx` |
| 🔴 | `frontend/components/ThemeProvider.tsx` |
| 🔴 | `backend-kotlin-jpa/src/main/kotlin/.../security/JwtTokenProvider.kt` |
| 🟡 | `backend-kotlin-jpa/src/main/kotlin/.../services/ReportService.kt` |
| 🟡 | `frontend/lib/api.ts` |
| 🟡 | `backend-kotlin-jpa/src/main/resources/application.yml` |

---

## Summary

The codebase is **well-structured for a Spring Boot + Next.js app** with solid security, async, and caching patterns. The main debt is **monolithic entity/repository files**, **missing soft-delete cascades**, **date/money type issues in DB**, and **oversized frontend components**. The critical bugs are the broken `ThemeProvider` and missing refresh token reuse detection.