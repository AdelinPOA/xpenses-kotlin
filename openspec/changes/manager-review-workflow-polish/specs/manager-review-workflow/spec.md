## ADDED Requirements

### Requirement: Focused Review Queue
The `/approvals` page SHALL be the primary manager Review Queue for submitted Expense Reports and SHALL show compact cards with report title, submitter, submitted date, report period, expense count, total amount, description or business purpose, Approve, Reject, and View Details actions.

#### Scenario: Manager reviews submitted report cards
- **WHEN** a manager opens `/approvals` with submitted reports available
- **THEN** each visible report card shows the identifying, timing, effort, amount, context, and action fields needed for a decision.

#### Scenario: Rejection requires a reason
- **WHEN** a manager starts rejecting a report from `/approvals`
- **THEN** the rejection action is blocked until a non-empty Rejection Reason is entered.

### Requirement: Reports Browser Filter Ergonomics
The `/reports` page SHALL remain a report browser/archive with desktop table results, mobile card results, visible grouped desktop filters, and compact mobile filters behind a control with active filters shown as removable chips only after selection.

#### Scenario: Desktop reports remain tabular
- **WHEN** a manager views `/reports` on a desktop viewport
- **THEN** report results are displayed in a table with search, status, and employee filters grouped above the table.

#### Scenario: Mobile reports use compact filters
- **WHEN** a manager views `/reports` on a mobile viewport
- **THEN** filters are hidden behind a compact control and selected filters appear as removable chips above the card results.

### Requirement: Role-Specific Mobile Primary Navigation
The mobile bottom navigation SHALL expose each role's primary workflow and SHALL include Approvals for managers while preserving Expenses for technicians.

#### Scenario: Manager mobile navigation prioritizes approvals
- **WHEN** an authenticated manager views the app on a mobile viewport
- **THEN** the bottom navigation includes Approvals and does not use Expenses as the primary second tab.

#### Scenario: Technician mobile navigation preserves expense entry
- **WHEN** an authenticated technician views the app on a mobile viewport
- **THEN** the bottom navigation includes Expenses as a primary tab.

### Requirement: Grouped Global Search
Global Search SHALL stay visible in manager desktop surfaces, use the placeholder `Search...`, and render results grouped by result type for all result arrays returned by the search API.

#### Scenario: Neutral search placeholder
- **WHEN** a manager views a page with Global Search
- **THEN** the search input placeholder is `Search...`.

#### Scenario: Search results are grouped
- **WHEN** Global Search returns mixed result types
- **THEN** the dropdown groups visible results under result-type headings.
