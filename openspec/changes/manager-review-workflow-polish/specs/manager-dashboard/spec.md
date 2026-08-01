## MODIFIED Requirements

### Requirement: Manager KPI Header Metrics
The Manager Dashboard SHALL NOT display KPI-first header cards for manager users. It SHALL operate as a Manager Work Hub that prioritizes pending Expense Reports, then pending Advance Payments, then recent team activity.

#### Scenario: Rendering manager work hub
- **WHEN** the Manager Dashboard loads data from `/api/dashboard/manager`
- **THEN** pending Expense Reports render before pending Advance Payments and recent team activity, and KPI-first metric cards are absent.

### Requirement: Side-by-Side Pending Workflow Tables
The Manager Dashboard SHALL render a compact pending Expense Reports preview and a pending Advance Payments preview as work queues. Desktop layouts MAY place these previews side-by-side, while mobile layouts SHALL stack pending reports before pending advances.

#### Scenario: Displaying pending queues
- **WHEN** pending reports or advances are returned by the API
- **THEN** pending reports are listed first and pending advances are listed after them with quick action affordances.

## ADDED Requirements

### Requirement: Manager Pending Report Preview Context
The manager dashboard pending report preview SHALL expose report period and description or business purpose in addition to the existing report title, submitter, submitted date, expense count, and total amount.

#### Scenario: Pending report preview contains decision context
- **WHEN** pending report summaries are returned by `/api/dashboard/manager`
- **THEN** each summary includes date range and description fields that the frontend can render without opening the full report.
