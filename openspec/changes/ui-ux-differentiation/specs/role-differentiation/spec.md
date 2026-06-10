## ADDED Requirements

### Requirement: Role-Based Visual Themes
The system SHALL apply distinct color accents to the UI based on the user's role.

#### Scenario: Role accent application
- **WHEN** user with 'chef_finance' role is logged in
- **THEN** sidebar and dashboard elements feature 'emerald' (green) accents

### Requirement: Action-Oriented Terminology
The system SHALL use descriptive, action-oriented labels for navigation and roles.

#### Scenario: Nav label update
- **WHEN** user views the sidebar
- **THEN** the 'Approvals' item is labeled 'Review Reports' and the 'Payments' item is labeled 'Process Payments'
