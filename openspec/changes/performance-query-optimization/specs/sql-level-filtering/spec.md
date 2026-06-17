## ADDED Requirements

### Requirement: ExpenseRepository single comprehensive filtered query
`ExpenseRepository` SHALL expose a `findAllWithFilters` method that accepts all optional filter parameters (`userId`, `status`, `reportId`, `categoryId`, `fromDate`, `toDate`) at the JPQL level using the `:param IS NULL OR e.field = :param` pattern.

#### Scenario: filter by category and report at DB level
- **WHEN** `GET /api/expenses?category_id=5&report_id=3` is called
- **THEN** a single SQL query is issued with `WHERE category_id = 5 AND report_id = 3` (no in-memory `filter{}`)

#### Scenario: org-wide query with no user filter
- **WHEN** `findAllWithFilters` is called with `userId = null`
- **THEN** the query returns expenses for all users (the `:userId IS NULL` branch is true)

### Requirement: ExpenseController.listExpenses uses the single filtered query
`ExpenseController.listExpenses` SHALL replace the multi-branch `when` block + in-memory `filter{}` chain with a single call to `expenseRepository.findAllWithFilters`.

#### Scenario: no in-memory filtering in listExpenses
- **WHEN** the `listExpenses` method body is inspected
- **THEN** there are zero `.filter { }` calls on the expenses list

### Requirement: DashboardController uses scoped queries for non-privileged users
`DashboardController.getDashboard` SHALL use `expenseRepository.findAllByUserId(uid)` for non-privileged users instead of `findAll()` followed by in-memory filtering.

#### Scenario: technician dashboard scopes to own expenses
- **WHEN** a `technician` opens `/dashboard`
- **THEN** the SQL query includes `WHERE user_id = ?` (not a `SELECT * FROM expenses` followed by Kotlin filtering)

### Requirement: Expenses sorted by DB-level ORDER BY
Expense list results SHALL be sorted by `ORDER BY e.date DESC` in the JPQL query, not via Kotlin `sortedByDescending`.

#### Scenario: date sort happens in SQL
- **WHEN** `findAllWithFilters` returns expenses
- **THEN** the JPQL includes `ORDER BY e.date DESC` and no Kotlin `.sortedByDescending {}` is applied afterward
