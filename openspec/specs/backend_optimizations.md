# OpenSpec: Backend Optimizations & Code Quality Review

## Context
Following a backend review and interview, we identified several performance bottlenecks and code quality issues in the Spring Boot/Kotlin backend. The project currently employs in-memory list filtering which is a bottleneck for large datasets. Additionally, there are type-safety violations (`@Suppress("UNCHECKED_CAST")`) and potential architectural smells that need addressing.

## Goals
1. Improve performance by pushing data filtering to the database level.
2. Ensure strict Kotlin type safety and eliminate generic suppressions.
3. Clean up architectural boundaries (Controllers vs Services, DTO mapping, N+1 query problems).

## Proposed Changes

### 1. Update Project Rules
- **File**: `.agents/skills/backend-dev/SKILL.md`
- **Change**: Modify the "List Filtering" rule to explicitly require SQL-level `WHERE` clauses for filtering instead of in-memory `.filter()` on `findAll()` results.

### 2. Repository Layer Refactoring (Database Filtering)
- **Files**: `Repositories.kt`, `ExpenseController.kt`, `ReportController.kt`, `InventoryController.kt`, etc.
- **Change**: Replace unbounded `findAll()` calls that are subsequently filtered in Kotlin with specific Spring Data JPA query methods or `@Query` annotations utilizing `WHERE` clauses (e.g., `findAllByStatus`, `findAllByUserIdAndDateBetween`).

### 3. Type Safety in StorageService
- **File**: `StorageService.kt`
- **Change**: Remove `@Suppress("UNCHECKED_CAST")` used for nested map parsing. Introduce strongly-typed Kotlin data classes (DTOs) or `@ConfigurationProperties` to handle storage configuration serialization/deserialization safely.

### 4. Architecture and Smells Audit
- **N+1 Queries**: Audit repositories for missing `JOIN FETCH` or `@EntityGraph` annotations when loading related entities (e.g., Expenses with their Receipts).
- **Controllers**: Ensure Controllers do not contain business logic and correctly map Entities to API DTOs before responding.
- **Transactions**: Verify proper use of `@Transactional` at the Service layer boundary.

## Testing & Validation
- Run existing integration tests (`./gradlew test --no-daemon`) to ensure no regressions. Testcontainers (PostgreSQL) will be used automatically.
- Verify that large dataset retrieval endpoints respond faster due to database-level filtering.
