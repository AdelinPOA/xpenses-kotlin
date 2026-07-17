## ADDED Requirements

### Requirement: Premium Typography System
The frontend SHALL load and apply "Outfit" for all headings and "Inter" for all standard body copy and table metrics, establishing a clean visual text hierarchy.

#### Scenario: User loads any page
- **WHEN** a user visits any page in the application
- **THEN** the text uses the Outfit font family for headers and the Inter font family for body copy

### Requirement: Glassmorphic Sidebar and Headers
The frontend SHALL render the sidebar panel and navigation headers with backdrop-blur styling and translucent backgrounds, creating physical layout depth.

#### Scenario: User navigates on desktop
- **WHEN** a user views the sidebar and top navigation panels on desktop
- **THEN** the sidebar and headers show a semi-transparent blurred background with thin borders

### Requirement: Card Accent Gradients and Scale Hover Effects
The frontend SHALL apply a soft, rounded-2xl design to all dashboard and list content cards, integrating Violet-to-Indigo accent gradients for primary elements and trigger a micro-scale translate lift on hover.

#### Scenario: User hovers over dashboard stats card
- **WHEN** a user hovers over any card item
- **THEN** the card performs a vertical lift animation and expands its shadow glow

### Requirement: Glowing Area Charts and Neon indicators
The frontend SHALL render analytical progress lines as smooth curved area charts with soft gradient fills and neon-ring shadows.

#### Scenario: User views dashboard metrics
- **WHEN** a user views the dashboard progress graphs
- **THEN** the chart lines render as curved glowing lines with a gradient color overlay underneath

### Requirement: Page Entry Transitions
The frontend SHALL perform a soft, 200ms ease-out fade-in and vertical slide-up transition when client-side navigation mounts a new page view.

#### Scenario: User navigates to a new page
- **WHEN** a user clicks a sidebar link to change pages
- **THEN** the new page content smoothly fades in and slides up into position
