# Specification: email-notifications

## Purpose
The purpose of email-notifications is to implement dynamic, templated transactional email alerts triggered by backend report lifecycle actions, with a user-facing toggle to subscribe/unsubscribe.

## Requirements

### Requirement: Send email on report submission
When a user submits a report, the backend system SHALL send an email notification to the manager of the user or all managers if no manager is designated, alerting them of the report awaiting review.

#### Scenario: Submitter has a manager
- **WHEN** user with email `tech@example.com` who has manager `manager@example.com` submits report ID `123`
- **THEN** an email is sent to `manager@example.com` with the subject "New Expense Report Submitted for Approval" containing details of the report.

#### Scenario: Submitter has no manager
- **WHEN** user with email `tech@example.com` has no assigned manager and submits report ID `123`
- **THEN** an email is sent to all users with the role `manager` in the system.

### Requirement: Send email on report approval
When a manager approves a report, the system SHALL send an email notification to the report submitter.

#### Scenario: Report approved
- **WHEN** a manager approves report ID `123` submitted by `tech@example.com`
- **THEN** an email is sent to `tech@example.com` with the subject "Expense Report Approved" containing approval details.

### Requirement: Send email on report rejection
When a manager rejects a report, the system SHALL send an email notification to the report submitter containing the rejection reason.

#### Scenario: Report rejected
- **WHEN** a manager rejects report ID `123` submitted by `tech@example.com` with reason "Missing receipt for taxi"
- **THEN** an email is sent to `tech@example.com` with the subject "Expense Report Rejected" containing the rejection reason "Missing receipt for taxi".

### Requirement: Send email on report payment
When a CFO marks a report as paid, the system SHALL send an email notification to the report submitter.

#### Scenario: Report paid
- **WHEN** a CFO marks report ID `123` submitted by `tech@example.com` as paid
- **THEN** an email is sent to `tech@example.com` with the subject "Expense Report Paid" containing payment confirmation details.

### Requirement: User preference for notifications
The system SHALL allow users to toggle their email notifications preference from their Profile page, and the backend SHALL query and respect this setting before sending any transactional emails to a user.

#### Scenario: User deactivates notifications
- **WHEN** user toggles notifications to OFF and saves their profile
- **THEN** their database preference `notifications_enabled` is updated to FALSE, and they do not receive any notification emails on submission, approval, rejection, or payment.
