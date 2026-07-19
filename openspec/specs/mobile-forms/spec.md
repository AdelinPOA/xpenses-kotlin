# mobile-forms Specification

## Purpose
TBD - created by archiving change fix-mobile-ios-review. Update Purpose after archive.
## Requirements
### Requirement: Form controls prevent iOS focus zoom
Text inputs, selects, and textareas SHALL compute to at least 16px font-size on viewports below the `sm` breakpoint (via `text-base sm:text-sm` or equivalent), so iOS Safari does not auto-zoom on focus. Desktop appearance SHALL remain unchanged.

#### Scenario: Focusing amount field does not zoom
- **WHEN** a user on an iPhone taps the Amount field in the expense form
- **THEN** the page does not zoom in

#### Scenario: Desktop density preserved
- **WHEN** the same form is viewed at ≥640px viewport width
- **THEN** controls render at the original 14px size

### Requirement: Login form supports iOS autofill
The username field SHALL set `autoCapitalize="none"`, `autoCorrect="off"`, and `autoComplete="username"`; the password field SHALL set `autoComplete="current-password"`.

#### Scenario: Lowercase username preserved
- **WHEN** a user types `tech1` into the username field on iOS
- **THEN** the first letter is not auto-capitalized

#### Scenario: Keychain autofill offered
- **WHEN** a returning iOS user focuses the login form
- **THEN** iOS offers saved credentials via Passwords autofill

### Requirement: Amount fields use decimal input mode
Monetary amount inputs SHALL use `inputMode="decimal"` (with `type="text"` or retained `type="number"` where validation requires it), preferring a decimal-capable keyboard on iOS.

#### Scenario: Decimal keypad on iPhone
- **WHEN** a user focuses an amount field on iOS
- **THEN** a keyboard suitable for decimal entry is presented

### Requirement: Native controls match color scheme
The stylesheet SHALL set `color-scheme: light` on `:root` and `color-scheme: dark` under `.dark` so iOS native pickers (date wheel, select dropdown) match the active theme.

#### Scenario: Date picker matches dark mode
- **WHEN** dark mode is active and a user opens a date input on iOS
- **THEN** the native picker renders in dark appearance

