# Service Layer Architecture

## Purpose

TBD

## Requirements

### Requirement: Report state transitions are owned by a service

The system SHALL implement all report state-machine transitions (submit, recall, approve, reject, pay) in `ReportService`. `ReportController` SHALL NOT contain status-validation, persistence, or transaction logic beyond resolving the authenticated user and mapping HTTP request/response.

#### Scenario: Approve via service

- **WHEN** an authenticated `manager` or `chef_finance` approves a `submitted` report they do not own
- **THEN** `ReportService.approve` SHALL set the report status to `approved` within a single `@Transactional` boundary and the controller SHALL return the mapped report DTO

#### Scenario: Invalid transition rejected at service boundary

- **WHEN** a transition is requested for a report not in the required source state (e.g. paying a report that is not `approved`)
- **THEN** `ReportService` SHALL raise a domain error that maps to HTTP `400` and SHALL NOT mutate any persisted state

#### Scenario: Self-approval forbidden

- **WHEN** a user attempts to approve their own report
- **THEN** `ReportService` SHALL reject the operation and the report status SHALL remain unchanged

### Requirement: Expense persistence is owned by a service

The system SHALL move expense create/update/delete/persistence logic into `ExpenseService`. `ExpenseController` SHALL delegate to `ExpenseService` and SHALL NOT call `ExpenseRepository.save`/`delete` directly.

#### Scenario: Create expense through service

- **WHEN** a valid expense create request is received
- **THEN** `ExpenseController` SHALL delegate to `ExpenseService.create`, which performs FX conversion and persistence in one transaction, and return `201` with the mapped DTO

#### Scenario: Edit restricted to draft

- **WHEN** an update targets an expense whose status is not `draft`
- **THEN** `ExpenseService` SHALL reject the update and the controller SHALL return `400`

### Requirement: Service logic is unit-testable without web context

The system SHALL allow the report state machine and expense rules to be exercised in unit tests that instantiate the service with mocked repositories, without standing up a full MockMvc/Spring web context.

#### Scenario: State machine test without MockMvc

- **WHEN** a test invokes `ReportService` transition methods with mocked repositories
- **THEN** the transitions and guard conditions SHALL be verifiable without HTTP or a servlet container
