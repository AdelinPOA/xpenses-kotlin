# manager-dashboard Specification

## Purpose
TBD - created by archiving change dashboard-ui-ux-overhaul. Update Purpose after archive.
## Requirements
### Requirement: Action-Only Manager Workspace
The dashboard SHALL display an action-only triage desk for users with manager roles (`manager`, `chef_finance`, `mod`), showing pending expense reports, pending advances, and recent team activity.

#### Scenario: Manager views triage desk
- **WHEN** a manager navigates to `/dashboard`
- **THEN** the system displays the pending reports queue, pending advances queue, and team activity stream without extraneous personal expense clutter.

### Requirement: Inline Accordion Report Review
The system SHALL support expanding any pending report directly within the list to reveal its itemized expenses, receipts, total EUR amounts, advances offset, and review action controls (Approve / Reject with comment).

#### Scenario: Manager expands report details inline
- **WHEN** a manager clicks on a pending report row or card
- **THEN** the itemized expense list, receipts indicator, and note input expand smoothly in-place.

#### Scenario: Manager approves report from inline view
- **WHEN** a manager clicks "Approve" on an expanded report
- **THEN** the report is approved, a success notification appears, and the item is removed from the pending queue.

#### Scenario: Manager rejects report with reason
- **WHEN** a manager provides a rejection note and clicks "Reject"
- **THEN** the report is marked rejected with the reason recorded and the queue updates immediately.

### Requirement: Responsive Mobile Layout for Reviews
The manager review desk SHALL render without nested fixed-height scroll traps on mobile viewports, using full-width touch-friendly cards.

#### Scenario: Manager reviews on mobile device
- **WHEN** a manager views pending reports or advances on a screen narrower than 1024px
- **THEN** cards use fluid full-width layout with standard document scrolling and thumb-friendly action buttons.

