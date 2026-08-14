# technician-dashboard Specification

## Purpose
TBD - created by archiving change dashboard-ui-ux-overhaul. Update Purpose after archive.
## Requirements
### Requirement: Mobile Action-Oriented Technician Feed
The mobile dashboard for technicians SHALL provide a prominent quick-action button for adding/capturing receipts, an active reimbursement status summary card, and a streamlined recent expense feed.

#### Scenario: Technician opens mobile dashboard
- **WHEN** a technician accesses the dashboard on a mobile screen
- **THEN** they see an active reimbursement summary (Draft, Submitted, Paid totals), recent expense list with status badges, and a prominent quick-add action button.

### Requirement: Desktop Master-Detail Workspace
The desktop dashboard for technicians SHALL provide a 2-column layout with a comprehensive recent expenses table on the left and reimbursement status, category distribution, and monthly spend overview on the right.

#### Scenario: Technician views desktop dashboard
- **WHEN** a technician accesses the dashboard on a desktop screen
- **THEN** they see the recent expenses table occupying the main area, with the status summary (displaying actual EUR amounts for Draft, Submitted, and Paid reports) and category breakdown in the right rail.

### Requirement: Accurate Report Status Reimbursements
The report summary widget SHALL display computed EUR totals for each report lifecycle state (Draft, Submitted, Paid) instead of placeholder dashes.

#### Scenario: Display report status amounts
- **WHEN** the dashboard loads report statistics
- **THEN** the draft, submitted, and paid rows display the count and corresponding EUR total.

