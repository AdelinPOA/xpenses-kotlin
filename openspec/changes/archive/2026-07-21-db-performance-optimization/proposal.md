# Proposal: DB Performance Optimization (Paged SQL Queries & Count Cleanup)

## Intent
Optimize database query performance and memory footprint:
1. Shift report list pagination in `ReportController.kt` from in-memory JVM sublisting to SQL-level DB pagination via `findAllWithFiltersPaged`.
2. Remove redundant type conversion on `countByUserId` call in `DashboardController.kt`.

## Scope
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/DashboardController.kt`
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/`
