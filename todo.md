# TODO.md — xpenses-kotlin

> Generated: 2026-06-20 (session 60)
> Source: codebase audit

## Bugs

### 1. ExpenseController — in-memory filtering on export endpoint
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt:575-584`
- **Severity:** HIGH
- **Problem:** `GET /api/expenses/export` loads all expenses into memory via `findAll()`, then filters in Kotlin. The regular list endpoint already uses `findAllWithFilters()` for DB-level filtering. OOM risk on large datasets.
- **Fix:** Replace `findAll()` + `.filter{}` with `findAllWithFilters(uid, status, reportId, categoryId, fromDate, toDate)`.
- **Status:** [ ] TODO

### 2. ExpenseController — BigDecimal precision loss
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt:126,127,210,211`
- **Severity:** MEDIUM
- **Problem:** Uses `BigDecimal(double)` constructor instead of `BigDecimal.valueOf()` for `taxAmount`/`taxRate` entity fields. Precision silently lost at ~15th decimal. The `amountEur` and `taxAmountEur` calculations already use `.valueOf()` — these 4 lines were missed during the prior fix.
- **Fix:** Replace `BigDecimal(body.taxAmount)` with `BigDecimal.valueOf(body.taxAmount)`, same for `effTaxAmount` and `taxRate`.
- **Status:** [ ] TODO

### 3. StorageService — unmanaged Thread
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt:301-366`
- **Severity:** MEDIUM
- **Problem:** Raw `Thread { }.start()` for storage migration. Not managed by Spring — killed silently on shutdown, no cancellation support, no exception reporting to the caller.
- **Fix:** Inject `@Qualifier("applicationTaskExecutor") Executor` and use `executor.execute { ... }`.
- **Status:** [ ] TODO

### 4. WebP magic-byte validation too weak
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt:548`
- **Severity:** LOW
- **Problem:** Magic-byte check only validates the RIFF header (bytes 0-3: `52 49 46 46`). Any RIFF container (WAV, AVI) passes as WebP. Missing the `WEBP` sub-identifier at bytes 8-11 (`57 45 42 50`).
- **Fix:** Add a separate check for `.webp` files: validate bytes 8-11 equal `57 45 42 50` ("WEBP").
- **Status:** [ ] TODO

### 5. InsuranceController — silent storage deletion failure
- **File:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt:174`
- **Severity:** LOW
- **Problem:** `catch (_: Exception) {}` silently swallows storage deletion errors. DB row deleted successfully, but orphaned file on storage goes unreported.
- **Fix:** Add a logger warning: `logger.warn("Failed to delete insurance file from storage: $path", e)`.
- **Status:** [ ] TODO

### 6. Frontend — `any` types in insurance page
- **File:** `frontend/app/insurance/page.tsx:35,153`
- **Severity:** LOW
- **Problem:** `useQuery<any[]>()` for user list instead of the existing `User[]` type from `@/lib/api`. Forces `(u: any)` casts downstream.
- **Fix:** Change `useQuery<any[]>` to `useQuery<User[]>` and remove `(u: any)` casts.
- **Status:** [ ] TODO
