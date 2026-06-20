## ADDED Requirements

### Requirement: Financial records are soft-deleted

The system SHALL soft-delete `Expense`, `ExpenseReport`, and `Receipt` records. A delete operation SHALL mark the row as deleted (setting a `deleted` flag and deletion timestamp) instead of issuing a physical SQL `DELETE`.

#### Scenario: Delete marks instead of removing

- **WHEN** an authorized user deletes a draft expense
- **THEN** the row SHALL remain in the database with `deleted = true` and SHALL NOT be physically removed

#### Scenario: Report delete cascades to soft delete

- **WHEN** a deletable report is deleted
- **THEN** the report and its owned child records SHALL be marked deleted rather than physically removed

### Requirement: Soft-deleted records are excluded from normal reads

The system SHALL automatically exclude soft-deleted rows from standard queries (list, get-by-id, dashboard aggregates) without each query restating the filter.

#### Scenario: Deleted expense absent from list

- **WHEN** an expense has been soft-deleted
- **THEN** it SHALL NOT appear in expense list, report contents, or dashboard totals

#### Scenario: Deleted record not fetchable by id

- **WHEN** a client requests a soft-deleted record by id
- **THEN** the system SHALL respond as if the record does not exist (`404`)

### Requirement: Audit history is preserved

The system SHALL retain soft-deleted financial records for audit purposes, including the deletion timestamp.

#### Scenario: Deleted row retained for audit

- **WHEN** a financial record is soft-deleted
- **THEN** the row and its deletion timestamp SHALL remain queryable through an explicit audit/admin path that bypasses the default exclusion filter
