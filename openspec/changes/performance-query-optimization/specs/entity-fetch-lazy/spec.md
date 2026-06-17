## ADDED Requirements

### Requirement: All @ManyToOne relations use FetchType.LAZY
Every `@ManyToOne` annotation in `Models.kt` SHALL specify `fetch = FetchType.LAZY`. No `FetchType.EAGER` declarations SHALL remain on any relation.

#### Scenario: no EAGER relations remain
- **WHEN** `Models.kt` is inspected for `FetchType.EAGER`
- **THEN** zero matches are found

#### Scenario: dashboard loads without LazyInitializationException
- **WHEN** a technician views `/dashboard` (which calls `expenseReportRepository.findAll()`)
- **THEN** the `report.user?.displayName` access succeeds (loaded lazily within the open-in-view session)

### Requirement: Repository JOIN FETCH queries include User relations for list paths
`ExpenseReportRepository.findAllWithExpenses` and related list queries SHALL use `JOIN FETCH r.user` to load the report owner in the same SELECT, avoiding per-row lazy User loads when serializing `ReportOut`.

#### Scenario: report list fetches users in a single query
- **WHEN** `GET /api/reports` lists 20 reports
- **THEN** the Hibernate query log shows `LEFT JOIN FETCH ... user_id` in the main query, not 20 separate `SELECT FROM users WHERE id = ?` statements
