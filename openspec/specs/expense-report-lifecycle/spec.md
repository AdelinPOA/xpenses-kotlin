# expense-report-lifecycle Specification

## Purpose
TBD - created by archiving change deepen-expense-report-lifecycle. Update Purpose after archive.
## Requirements
### Requirement: Lifecycle module owns report transitions
The system SHALL expose a single Expense Report lifecycle module for report actions that change lifecycle state or lifecycle-owned associations.

#### Scenario: Submit draft report
- **WHEN** the report owner submits a draft Expense Report with at least one attached Expense
- **THEN** the lifecycle module changes the Expense Report status to `submitted`
- **AND** the lifecycle module changes each attached Expense status to `submitted`
- **AND** the lifecycle module records the submitted timestamp and recalculates the report total

#### Scenario: Recall submitted or rejected report
- **WHEN** the report owner recalls an Expense Report with status `submitted` or `rejected`
- **THEN** the lifecycle module changes the Expense Report status to `draft`
- **AND** the lifecycle module changes each attached Expense status to `draft`
- **AND** the lifecycle module clears the submitted timestamp

#### Scenario: Approve submitted report
- **WHEN** an authorized manager or finance actor approves another user's submitted Expense Report
- **THEN** the lifecycle module changes the Expense Report status to `approved`
- **AND** the lifecycle module changes each attached Expense status to `approved`
- **AND** the lifecycle module records the approver and approval timestamp

#### Scenario: Reject submitted report
- **WHEN** an authorized manager or finance actor rejects another user's submitted Expense Report with a reason
- **THEN** the lifecycle module changes the Expense Report status to `rejected`
- **AND** the lifecycle module changes each attached Expense status to `draft`
- **AND** the lifecycle module records the rejecter, rejection timestamp, and rejection reason

#### Scenario: Pay approved report
- **WHEN** an authorized finance actor marks another user's approved Expense Report as paid
- **THEN** the lifecycle module changes the Expense Report status to `paid`
- **AND** the lifecycle module changes each attached Expense status to `paid`
- **AND** the lifecycle module records the paid timestamp

### Requirement: Lifecycle module owns draft association changes
The system SHALL perform lifecycle-owned draft association changes through the Expense Report lifecycle module.

#### Scenario: Attach draft expenses
- **WHEN** the report owner attaches draft Expenses to a draft Expense Report
- **THEN** the lifecycle module associates each Expense with the Expense Report
- **AND** the lifecycle module updates changed timestamps on affected records

#### Scenario: Delete draft report without deleting expenses
- **WHEN** the report owner deletes a draft Expense Report without requesting Expense deletion
- **THEN** the lifecycle module detaches attached Expenses from the Expense Report
- **AND** the lifecycle module leaves those Expenses in `draft`
- **AND** the lifecycle module soft-deletes the Expense Report through the repository

#### Scenario: Delete draft report with expenses
- **WHEN** the report owner deletes a draft Expense Report and requests Expense deletion
- **THEN** the lifecycle module deletes the attached draft Expenses through the existing Expense deletion behavior
- **AND** the lifecycle module soft-deletes the Expense Report through the repository

#### Scenario: Sign report
- **WHEN** the report owner signs an Expense Report with an available signature
- **THEN** the lifecycle module records the signer and signed timestamp without changing the Expense Report status

### Requirement: Lifecycle module enforces actor permissions
The system SHALL enforce lifecycle action permissions inside the Expense Report lifecycle module.

#### Scenario: Owner-only action by non-owner
- **WHEN** an actor who does not own the Expense Report attempts an owner-only lifecycle action
- **THEN** the lifecycle module rejects the action with a forbidden result

#### Scenario: Manager action by unprivileged actor
- **WHEN** an actor without manager or finance permission attempts to approve or reject an Expense Report
- **THEN** the lifecycle module rejects the action with a forbidden result

#### Scenario: Finance action by non-finance actor
- **WHEN** an actor without finance permission attempts to mark an Expense Report as paid
- **THEN** the lifecycle module rejects the action with a forbidden result

#### Scenario: Actor approving own report
- **WHEN** a manager or finance actor attempts to approve their own Expense Report
- **THEN** the lifecycle module rejects the action with a bad-request result

### Requirement: Lifecycle module uses typed internal states
The system SHALL convert persisted Expense Report status strings into typed lifecycle states before evaluating transition rules.

#### Scenario: Known persisted status
- **WHEN** the lifecycle module loads an Expense Report with a known persisted status string
- **THEN** it evaluates lifecycle rules using the corresponding typed internal state
- **AND** it writes the existing public status string value back to persistence and JSON responses

#### Scenario: Invalid transition
- **WHEN** an actor attempts a lifecycle action from a state where that action is not valid
- **THEN** the lifecycle module rejects the action with a bad-request result

### Requirement: Lifecycle module emits lifecycle events
The system SHALL emit lifecycle events for notification-worthy Expense Report transitions instead of sending email directly from transition implementation.

#### Scenario: Report submitted event
- **WHEN** an Expense Report is submitted successfully
- **THEN** the lifecycle module returns a `ReportSubmitted` lifecycle event containing the report title, owner display name, total amount, and currency

#### Scenario: Report approved event
- **WHEN** an Expense Report is approved successfully
- **THEN** the lifecycle module returns a `ReportApproved` lifecycle event containing the report title and owner notification target

#### Scenario: Report rejected event
- **WHEN** an Expense Report is rejected successfully
- **THEN** the lifecycle module returns a `ReportRejected` lifecycle event containing the report title, owner notification target, rejecter display name, and reason

#### Scenario: Report paid event
- **WHEN** an Expense Report is marked paid successfully
- **THEN** the lifecycle module returns a `ReportPaid` lifecycle event containing the report title and owner notification target

### Requirement: Controller modules remain compatible adapters
The system SHALL preserve existing Expense Report HTTP routes, response statuses, and public status string values while delegating lifecycle behavior to the lifecycle module.

#### Scenario: Existing route delegates to lifecycle
- **WHEN** a client calls an existing lifecycle route such as submit, recall, approve, reject, pay, sign, attach, or delete
- **THEN** the controller authenticates and parses HTTP input
- **AND** the controller delegates lifecycle behavior to the lifecycle module
- **AND** the response remains compatible with existing clients

