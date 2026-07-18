## ADDED Requirements

### Requirement: iOS-Style Mobile Navigation
The application SHALL utilize a bottom tab bar for primary navigation on mobile breakpoints.

#### Scenario: Navigating on mobile
- **WHEN** a user is on a mobile device (width < 768px)
- **THEN** a bottom tab bar is displayed with primary destinations (Dashboard, Expenses, Reports, Profile/More), and the desktop side drawer is hidden.

### Requirement: iOS-Style Sheet Modals
The application SHALL present primary data entry forms (e.g., Add Expense) within a full-screen, gesture-enabled sheet modal on mobile breakpoints.

#### Scenario: Opening Add Expense on mobile
- **WHEN** a user taps "Add Expense" on a mobile device
- **THEN** a sheet modal slides up from the bottom, presenting vertically scrolling inputs and a tappable receipt thumbnail preview.

### Requirement: iOS-Inspired Visual Aesthetics
The application SHALL apply an iOS-native aesthetic for mobile components, incorporating translucent materials, large bold headers, and grouped inset lists.

#### Scenario: Scrolling a page with a large header
- **WHEN** a user scrolls down on a main page (e.g., Dashboard)
- **THEN** the large bold header transitions smoothly into a standard inline top-bar title.
