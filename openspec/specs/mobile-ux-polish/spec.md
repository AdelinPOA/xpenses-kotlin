# mobile-ux-polish Specification

## Purpose
TBD - created by archiving change fix-mobile-ios-review. Update Purpose after archive.
## Requirements
### Requirement: No dead UI in the mobile header
The non-functional notification bell (including its permanent unread dot) SHALL be removed from the mobile header until a notifications feature exists.

#### Scenario: Clean mobile header
- **WHEN** any page is viewed on a mobile viewport
- **THEN** the header shows only working controls (menu, brand, profile)

### Requirement: Destructive delete requires confirmation
Deleting an expense from the expenses list SHALL ask for confirmation (`window.confirm` or equivalent) before the mutation fires.

#### Scenario: Mis-tap protection
- **WHEN** a user taps the trash icon on an expense
- **THEN** a confirmation prompt appears and nothing is deleted unless confirmed

### Requirement: Touch targets meet 44px minimum
Icon-only buttons in primary mobile chrome (sidebar close, receipt zoom controls, header actions) SHALL have a minimum 44×44px hit area on touch devices.

#### Scenario: Sidebar close is easy to hit
- **WHEN** the sidebar is open on a phone
- **THEN** the close button's tappable area is at least 44×44px

### Requirement: Dropdown dismiss layer above page chrome
The export menu's click-outside backdrop SHALL stack above the fixed mobile header and tab bar so tapping anywhere closes the menu.

#### Scenario: Tap header closes export menu
- **WHEN** the export dropdown is open and the user taps the mobile header area
- **THEN** the dropdown closes

### Requirement: Charts show honest empty states
The dashboard spend chart SHALL render an explicit empty state when there is no data, instead of fabricated dummy data points.

#### Scenario: New user dashboard
- **WHEN** a user with no spend data opens the dashboard
- **THEN** the chart area shows an empty-state message, not a fake line

### Requirement: No unauthenticated UI flash
While the initial auth check is pending, the app SHALL render a neutral loading state instead of the shell with `user = null`.

#### Scenario: PWA cold start
- **WHEN** the PWA launches with a valid session
- **THEN** the sidebar/header never renders logged-out placeholders before the session resolves

### Requirement: Toasts fully visible on small screens
The toast container SHALL be inset from both screen edges on mobile (`left-4 right-4`) so no part is clipped off-screen, and SHALL avoid the notch area.

#### Scenario: Toast on 390px iPhone
- **WHEN** a toast appears on an iPhone 12/13/14
- **THEN** the full toast including its close button is visible

