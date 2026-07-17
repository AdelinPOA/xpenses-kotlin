# user-profiles-reports-view Specification

## Purpose
TBD - created by archiving change user-profiles-reports-view. Update Purpose after archive.
## Requirements
### Requirement: Get User Reports Filtered by User ID
The backend API SHALL allow privileged users (managers, CFOs, and moderators) to query expense reports filtered by a specific `user_id`. Non-privileged users (technicians) querying reports for a `user_id` other than their own SHALL receive a 403 Forbidden error.

#### Scenario: Privileged user queries a technician's reports
- **WHEN** a Manager requests `GET /api/reports?all=true&user_id=5`
- **THEN** the API returns only reports belonging to user ID 5

#### Scenario: Technician queries another user's reports
- **WHEN** a Technician requests `GET /api/reports?all=true&user_id=5` (where user ID 5 is someone else)
- **THEN** the API returns a 403 Forbidden status code

### Requirement: Get Other User Profile Details
The backend API SHALL allow Managers, CFOs, and Moderators to query basic details of any user by ID via `GET /api/users/{id}`. Technicians requesting profile details of another user SHALL receive a 403 Forbidden error.

#### Scenario: CFO retrieves user details
- **WHEN** a CFO requests `GET /api/users/5`
- **THEN** the API returns the username, display name, email, and role for user ID 5

#### Scenario: Technician retrieves another user's details
- **WHEN** a Technician requests `GET /api/users/5` (where user ID 5 is someone else)
- **THEN** the API returns a 403 Forbidden status code

### Requirement: User Profile View & Reports History Tab
The frontend SHALL display a dynamic user profile view at `/profile/[id]` which is read-only for Managers and CFOs, and includes a "User Reports" tab displaying the history of reports for that technician.

#### Scenario: Manager views technician profile
- **WHEN** a Manager navigates to `/profile/5`
- **THEN** the page displays the technician's details in read-only fields and a table listing all their reports

### Requirement: Shared Staff Directory
The frontend SHALL provide a Staff Directory page listing all company users, visible only to Managers, CFOs, and Moderators.

#### Scenario: Manager accesses Staff Directory
- **WHEN** a Manager navigates to `/admin/users` or `/users`
- **THEN** the page displays a list of all active staff members with clickable links to their profiles

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

