## Context

The codebase audit highlighted 6 active bugs and design flaws spanning data validation, background thread management, security verification, database precision, and front-end typing. This design details the specific implementation choices to resolve these issues safely.

## Goals / Non-Goals

**Goals:**
- Shift the expense export endpoint to use efficient, database-level filtering instead of in-memory collections processing.
- Prevent precision loss in all financial tax operations by transitioning to `BigDecimal.valueOf(...)`.
- Establish a Spring-managed execution context for storage migration tasks.
- Strengthen WebP validation by inspecting the container sub-signature (magic bytes 8–11).
- Prevent silent file abandonment in storage by adding warning logs for deleted files.
- Enable type-checking for user lists on the insurance frontend page.

**Non-Goals:**
- Changes to API routing or endpoints.
- Modifications to underlying database schemas or Flyway migrations (since table columns already support the required types and fields).
- Introduction of new caching mechanisms or third-party libraries.

## Decisions

### 1. Database-Level Filtering on Export
- **Approach**: Refactor `GET /api/expenses/export` in `ExpenseController.kt` to call `expenseRepository.findAllWithFilters(uid, status, reportId, categoryId, fromDate, toDate)` instead of loading all database records via `findAll()`.
- **Rationale**: Reuses the optimized JPQL query, reducing query overhead and preventing JVM Out-Of-Memory (OOM) risks on larger databases.

### 2. BigDecimal Creation
- **Approach**: Replace all `BigDecimal(double)` constructor calls in `ExpenseController.kt` with `BigDecimal.valueOf(double)`.
- **Rationale**: Static factory `valueOf()` uses the canonical string representation of double, avoiding representation discrepancies (e.g. 0.1 being parsed as 0.10000000000000000555).

### 3. Spring-Managed Threading in Storage Service
- **Approach**: Inject Spring's `@Qualifier("applicationTaskExecutor") private val executor: Executor` into `StorageService.kt` and use `executor.execute { ... }` instead of starting raw JVM threads (`Thread { ... }.start()`).
- **Rationale**: Aligns execution with Spring's container lifecycle, allowing threads to shut down gracefully and preventing resource leaks.

### 4. Extended WebP Signature Check
- **Approach**: Update `validateMagicBytes` in `ExpenseController.kt` to check WebP sub-signatures:
  - Verify container starts with `RIFF` (bytes 0–3: `52 49 46 46`).
  - Verify sub-identifier equals `WEBP` (bytes 8–11: `57 45 42 50`).
- **Rationale**: Prevents users from bypassing security by uploading other RIFF files (WAV, AVI) disguised as WebP.

### 5. Insurance Deletion Warnings
- **Approach**: Add warning logging inside the empty catch block of the storage file deletion step in `InsuranceController.kt`.
- **Rationale**: Ensures file-orphaning errors are reported to operators via standard server logs.

### 6. TypeScript Typing in Insurance Page
- **Approach**: Change `useQuery<any[]>` to `useQuery<User[]>` on the frontend's `insurance/page.tsx` and import the `User` interface from `frontend/lib/api.ts`.
- **Rationale**: Eliminates the need for downstream `(u: any)` casts and restores TypeScript compiler checks.

## Risks / Trade-offs

- **[Risk]**: Database-level filtering in export returns sorted values by default, which may affect previous unsorted behaviors.
  - *Mitigation*: The repository query uses `ORDER BY e.date DESC` by default, which matches the previous `.sortedByDescending { it.date }` in-memory logic. No behavioral difference is introduced.
