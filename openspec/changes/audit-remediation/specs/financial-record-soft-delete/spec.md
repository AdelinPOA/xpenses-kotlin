## MODIFIED Requirements

### Requirement: Financial records are soft-deleted

The system SHALL soft-delete `Expense`, `ExpenseReport`, `Receipt`, and `MileageRecord` records. A delete operation SHALL mark the row as deleted (setting a `deleted` flag and deletion timestamp) instead of issuing a physical SQL `DELETE`. A Flyway migration SHALL add the `deleted` (and deletion-timestamp) column to `mileage_records`, and the `MileageRecord` entity SHALL apply `@SQLDelete` + `@SQLRestriction("deleted = false")` consistent with the other financial entities.

#### Scenario: Delete marks instead of removing

- **WHEN** an authorized user deletes a draft expense
- **THEN** the row SHALL remain in the database with `deleted = true` and SHALL NOT be physically removed

#### Scenario: Report delete cascades to soft delete

- **WHEN** a deletable report is deleted
- **THEN** the report and its owned child records SHALL be marked deleted rather than physically removed

#### Scenario: Mileage record is soft-deleted

- **WHEN** a mileage record is deleted
- **THEN** the row SHALL be marked `deleted = true` with a deletion timestamp and SHALL NOT be physically removed, and SHALL be excluded from normal reads

## ADDED Requirements

### Requirement: Soft-delete of versioned records is optimistic-lock-safe

The system SHALL make the soft-delete of `Expense` and `Receipt` optimistic-lock-safe by adding a `@Version` field to each entity and including the version predicate (`AND version = ?`) in their `@SQLDelete` statements, consistent with `ExpenseReport`. Two concurrent soft-deletes of the same row SHALL NOT both succeed silently.

#### Scenario: Concurrent soft-delete detects conflict

- **WHEN** two transactions attempt to soft-delete the same `Expense` (or `Receipt`) concurrently
- **THEN** at most one SHALL succeed and the other SHALL fail with an optimistic-locking error rather than both reporting success

#### Scenario: Version increments on mutation

- **WHEN** an `Expense` or `Receipt` is updated
- **THEN** its `@Version` value SHALL increment, enabling stale-write detection on subsequent operations
