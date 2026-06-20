## 1. Backend Bug Fixes

- [x] 1.1 Refactor the expense export endpoint (`GET /api/expenses/export` in `ExpenseController.kt`) to query using `expenseRepository.findAllWithFilters(...)` instead of loading all database records into memory.
- [x] 1.2 Replace the 4 occurrences of the `BigDecimal(double)` constructor with `BigDecimal.valueOf(...)` in `ExpenseController.kt` (under `createExpense` and `updateExpense`).
- [x] 1.3 Inject the Spring task executor bean (via `@Qualifier("applicationTaskExecutor")`) in `StorageService.kt` and migrate the raw `Thread { ... }.start()` block to `executor.execute { ... }`.
- [x] 1.4 Enhance `validateMagicBytes` in `ExpenseController.kt` for `webp` files to check that bytes 8–11 of the file content match the `"WEBP"` sub-signature (`57 45 42 50`).
- [x] 1.5 Add a warning log `logger.warn("Failed to delete insurance file from storage: $path", e)` inside the empty catch block of the storage file deletion step in `InsuranceController.kt`.

## 2. Frontend Type Fixes

- [x] 2.1 Import the typed `User` interface from `frontend/lib/api.ts` into `frontend/app/insurance/page.tsx` and change `useQuery<any[]>` for fetching user details to `useQuery<User[]>`.
- [x] 2.2 Remove the legacy `(u: any)` type-bypass casts on technician list filtering and option mappings in `frontend/app/insurance/page.tsx`.
