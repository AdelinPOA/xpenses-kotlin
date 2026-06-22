## ADDED Requirements

### Requirement: Report state transition and notification are atomic

The system SHALL ensure that a report state transition (e.g. submission) and the enqueueing of its approver notification succeed or fail together. The notification SHALL be enqueued in the same transaction as the state change — via a `@TransactionalEventListener(phase = AFTER_COMMIT)` or a DB-backed outbox row written in the transaction — so that a committed transition reliably produces exactly one notification and a rolled-back transition produces none.

#### Scenario: Rolled-back transition sends no notification

- **WHEN** a report submission transaction fails and rolls back
- **THEN** no approver notification SHALL be sent or left enqueued

#### Scenario: Committed transition enqueues exactly one notification

- **WHEN** a report submission transaction commits
- **THEN** exactly one approver notification SHALL be enqueued/dispatched, even if the email send itself is performed asynchronously after commit

### Requirement: Approver lookup does not load all users

The system SHALL resolve the set of notification recipients (approvers) using a targeted query by role rather than loading every user via `userRepository.findAll()` and filtering in memory.

#### Scenario: Approvers fetched by role

- **WHEN** the system determines who to notify about a submitted report
- **THEN** it SHALL query users by the approver role(s) directly and SHALL NOT load the full user table into memory
