## Why

The recent codebase audit identified 6 active bugs and technical debt items across the backend and frontend components (e.g., in-memory filtering risks on large exports, floating-point precision loss, unmanaged background threads, weak file validation, and loose TypeScript types). Resolving these issues is necessary to prevent potential Out-Of-Memory (OOM) crashes, maintain database precision, ensure graceful system shutdowns, improve file security, and increase type safety before production release.

## What Changes

- **Optimized Expense Export**: Refactor the expense export endpoint to execute database-level filtering instead of loading all records into memory.
- **Improved Numerical Precision**: Replace all loose `BigDecimal(double)` constructor usages with `BigDecimal.valueOf(...)` to prevent floating-point representation drift.
- **Spring-Managed Background Tasks**: Replace the unmanaged, raw background thread in the storage migration service with a Spring-managed task executor.
- **Strengthened WebP Image Validation**: Enhance file validation to verify sub-signatures (magic bytes 8-11 equal "WEBP"), preventing RIFF-container files (like WAV/AVI) from passing as WebP images.
- **Logged Storage Deletion Failures**: Add warning logging to the insurance file deletion catch block to prevent silent file abandonment in storage.
- **Strict Frontend Type Declarations**: Replace `any[]` and `u: any` usages in the insurance page with the typed `User` interface.

## Capabilities

### New Capabilities
*None*

### Modified Capabilities
*None (This change focuses entirely on fixing implementation bugs and technical debt without altering spec-level business requirements).*

## Impact

- **Affected Files**:
  - [ExpenseController.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt)
  - [StorageService.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt)
  - [InsuranceController.kt](file:///home/poa/xpenses-kotlin/backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt)
  - [insurance/page.tsx](file:///home/poa/xpenses-kotlin/frontend/app/insurance/page.tsx)
- **API Impact**: `GET /api/expenses/export` will execute database-level filters.
- **Dependencies**: No new libraries introduced.
