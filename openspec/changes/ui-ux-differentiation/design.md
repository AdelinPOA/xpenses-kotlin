## Context

The current application uses a single sidebar theme and a generic dashboard layout for all users. Roles are enforced for access control but are not visually distinct. Navigation labels like "Approvals" and "Payments" are functional but could be more descriptive and "human-like."

## Goals / Non-Goals

**Goals:**
- Differentiate user roles through color accents and terminology.
- Personalize the dashboard with greetings and role-specific "Action Cards."
- Improve overall visual hierarchy and user feedback.

**Non-Goals:**
- Changes to the backend authentication or role-based access control (RBAC) logic.
- Adding new user management features beyond visual improvements.
- Redesigning the core layout or switching UI frameworks.

## Decisions

### 1. Role-Based Color Mapping
**Decision**: Use a consistent color mapping for each role across the application.
- `technician`: `blue`
- `manager`: `amber`
- `chef_finance`: `emerald`
- `mod`: `indigo`

**Rationale**: Colors provide immediate subconscious feedback on the current "mode" of the user. Using distinct colors helps users know which role they are currently operating in.

### 2. Personalized Dashboard Greeting
**Decision**: Implement a `DashboardGreeting` component that uses the user's `display_name` and a time-of-day appropriate message.

**Rationale**: Makes the application feel more welcoming and "human."

### 3. Role-Specific Action Cards
**Decision**: Introduce new "Action Cards" on the dashboard that prompt the user for specific actions based on their role.
- **Technician**: Highlights draft reports/expenses that need submission.
- **Manager**: Highlights reports waiting for approval.
- **Chef of Finances**: Highlights approved reports waiting for payment.

**Rationale**: Reduces cognitive load by highlighting the most important tasks immediately upon login.

### 4. Navigation Terminology Updates
**Decision**: Update labels in `Sidebar.tsx`:
- `Approvals` -> `Review Reports`
- `Payments` -> `Process Payments`
- `Categories` -> `Expense Categories`
- `Users` -> `User Management`

**Rationale**: Descriptive labels like "Review Reports" are more action-oriented and user-friendly than generic terms like "Approvals."

## Risks / Trade-offs

- **[Color Blindness]** → Ensure that differentiation doesn't rely solely on color; labels and icons will remain primary indicators.
- **[Visual Clutter]** → Keep accents subtle to maintain a clean aesthetic.
- **[Maintenance]** → Centralize the role-to-color mapping in a utility function to ensure consistency.
