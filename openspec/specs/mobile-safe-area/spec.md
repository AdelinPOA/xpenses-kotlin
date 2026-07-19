# mobile-safe-area Specification

## Purpose
TBD - created by archiving change fix-mobile-ios-review. Update Purpose after archive.
## Requirements
### Requirement: Viewport enables edge-to-edge rendering
The root viewport configuration SHALL include `viewportFit: "cover"` so that `env(safe-area-inset-*)` resolves to real values on notched iOS devices, while keeping `width: "device-width"` and `initialScale: 1`. The viewport MUST NOT set `maximumScale` or disable user zoom.

#### Scenario: PWA on notched iPhone
- **WHEN** the app is launched from the iOS home screen on a notched device
- **THEN** CSS `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` resolve to non-zero values

#### Scenario: Desktop unchanged
- **WHEN** the app is viewed in a desktop browser
- **THEN** safe-area utilities resolve to 0 and layouts render identically to before

### Requirement: Safe-area CSS utilities exist
`globals.css` SHALL define utilities for safe-area padding (at minimum `pt-safe` and `pb-safe`) backed by `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` with a 0 fallback, because the installed Tailwind version provides no such utilities.

#### Scenario: Utility compiles
- **WHEN** the production CSS is built
- **THEN** the compiled stylesheet contains `env(safe-area-inset-bottom)` rules used by the tab bar

### Requirement: Fixed mobile chrome respects safe areas
The mobile top header SHALL add safe-area-inset-top padding and the bottom tab bar SHALL add safe-area-inset-bottom padding so neither the iOS status bar/notch nor the home indicator overlaps interactive content. Toast notifications SHALL be positioned clear of the notch.

#### Scenario: Tab bar clears home indicator
- **WHEN** the app runs in standalone mode on a notched iPhone
- **THEN** all four tab-bar labels and icons are fully visible and tappable above the home indicator

#### Scenario: Header clears notch
- **WHEN** any page is viewed in standalone mode
- **THEN** the hamburger button, brand, and profile avatar are below the status bar area

### Requirement: Viewport height uses dynamic units
Full-height containers SHALL use `min-h-dvh` (with a `min-h-screen` fallback) instead of only `min-h-screen`, so content is not sized behind the iOS Safari dynamic URL bar.

#### Scenario: Login page fits visible area
- **WHEN** the login page is opened in iOS Safari with the URL bar expanded
- **THEN** the sign-in card is fully visible without scrolling

### Requirement: Overlays lock body scroll
While the mobile sidebar or the bulk-review drawer is open, body scrolling SHALL be disabled and restored on close.

#### Scenario: No scroll bleed behind drawer
- **WHEN** the bulk-review drawer is open on a touch device and the user swipes
- **THEN** only the drawer content scrolls, the page behind stays fixed

