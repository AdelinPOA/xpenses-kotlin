## ADDED Requirements

### Requirement: Personalized Dashboard Greeting
The system SHALL display a personalized greeting on the dashboard that includes the user's display name and a greeting appropriate for the time of day.

#### Scenario: Morning greeting
- **WHEN** user logs in at 9:00 AM
- **THEN** system displays "Good morning, [Name]!"

#### Scenario: Evening greeting
- **WHEN** user logs in at 7:00 PM
- **THEN** system displays "Good evening, [Name]!"

### Requirement: Role-Specific Action Cards
The system SHALL display contextual action cards on the dashboard based on the user's role.

#### Scenario: Technician action card
- **WHEN** user with 'technician' role views dashboard
- **THEN** system displays a card highlighting draft expenses and reports needing submission

#### Scenario: Manager action card
- **WHEN** user with 'manager' role views dashboard
- **THEN** system displays a card highlighting reports awaiting their approval
