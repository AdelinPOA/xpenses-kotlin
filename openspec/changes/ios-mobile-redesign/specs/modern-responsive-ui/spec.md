## MODIFIED Requirements

### Requirement: Mobile-First Responsive Layouts
The application SHALL provide a layout that adapts seamlessly to any screen size, treating mobile viewports as the primary constraint while serving divergent layout paradigms for mobile vs. desktop.

#### Scenario: Viewing dashboard on mobile
- **WHEN** a user accesses the dashboard on a device with a screen width < 768px
- **THEN** the layout is a single column, navigation uses a bottom tab bar, and the iOS aesthetic is applied.

#### Scenario: Viewing expense form on mobile
- **WHEN** a user accesses the expense creation form on a mobile device
- **THEN** the form opens within a full-screen modal sheet sliding up from the bottom.

#### Scenario: Viewing dashboard on desktop
- **WHEN** a user accesses the dashboard on a device with a screen width >= 768px
- **THEN** the layout utilizes a dense, data-heavy AppShell with a side drawer for navigation.
