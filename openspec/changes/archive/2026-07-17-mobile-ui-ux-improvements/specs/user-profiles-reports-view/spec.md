## ADDED Requirements

### Requirement: Mobile Viewport Segmented Toggles
The frontend SHALL render an iOS-style segmented toggle control for view toggling on mobile viewports (width < 768px) for pages supporting scoping (Dashboard, Expenses, Reports, Inventory, Insurance). This control SHALL offer smooth visual states and tap interaction.
- Dashboard: `[ My View | Company View ]`
- Expenses: `[ My Expenses | Company Expenses ]`
- Reports: `[ My Reports | Company Reports ]`
- Inventory: `[ My Items | Company Items ]`
- Insurance: `[ My Files | Company Files ]`

#### Scenario: Moderator toggles view on dashboard using mobile segmented control
- **WHEN** a Moderator on a mobile device (iPhone viewport) views the dashboard and taps "Company View" on the segmented control
- **THEN** the dashboard fetches and displays organization-wide data, and the control highlights "Company View" as active

### Requirement: Mobile Card Layout for Expenses and Reports
The frontend SHALL render expense items and report items on mobile viewports (width < 768px) using rounded card layouts (`rounded-xl` with subtle border and shadow) instead of flat vertical divide-y lists, creating a unified and premium feel.

#### Scenario: Moderator views expenses list on mobile
- **WHEN** a Moderator on a mobile device (iPhone viewport) visits the `/expenses` page
- **THEN** each expense is displayed in a distinct rounded card container with consistent border and shadow padding

### Requirement: Expenses Scoping Toggle for Privileged Roles
The frontend SHALL provide a scoping toggle to allow privileged roles (Moderator, Manager, CFO) to query all company expenses via `GET /api/expenses?all=true`. Non-privileged users (technicians) SHALL only see their own expenses and SHALL NOT see the toggle.

#### Scenario: Moderator toggles expenses company view
- **WHEN** a Moderator toggles to "Company Expenses" on the expenses page
- **THEN** the frontend calls `GET /api/expenses?all=true` and displays all company expenses
