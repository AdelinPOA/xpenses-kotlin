# Specification: manual-fx-rate

## Purpose
Allow users to view and manually override the FX rate on individual expense entries, with clear visual distinction between auto-fetched and manually-set rates.

## Requirements

### Requirement: Backend stores manual FX rate flag
The system SHALL store a `fx_rate_manual` boolean column on the `expenses` table to track whether the rate was set by the user (true) or auto-fetched from external API (false). The default SHALL be `false` for new rows without explicit override. Existing expenses SHALL retain `false` (auto) after migration.

#### Scenario: New expense created without manual rate override
- **WHEN** a user creates a new expense in a non-EUR currency without specifying `fxRate`
- **THEN** the system fetches the rate from the external API, stores it as `fx_rate`, and sets `fx_rate_manual = false`

#### Scenario: New expense created with manual rate override
- **WHEN** a user creates a new expense and provides `fxRate` in the request body
- **THEN** the system uses the provided `fxRate` directly without calling the external API, and sets `fx_rate_manual = true`

### Requirement: Backend accepts optional fxRate in create/update DTOs
The system SHALL accept optional `fxRate: BigDecimal?` and `fxRateManual: Boolean?` fields in both `ExpenseCreate` and `ExpenseUpdate` DTOs. When `fxRate` is null (not provided), the system SHALL fall back to auto-fetching via `FxService.getRate()`.

#### Scenario: Update expense without fxRate keeps auto behavior
- **WHEN** a user updates an expense without providing `fxRate`
- **THEN** the system recalculates the rate via API as before, and sets `fx_rate_manual = false`

#### Scenario: Update expense with fxRate uses provided value
- **WHEN** a user updates an expense and provides `fxRate: 0.92`
- **THEN** the system uses 0.92 as the rate, recalculates `amount_eur` based on it, and sets `fx_rate_manual = true`

### Requirement: Frontend shows FX rate as editable field
The expense form SHALL display the current FX rate as an inline-editable field when the currency is not EUR. The field SHALL:
- Show the rate as read-only text with a label "Auto" by default
- Provide a pencil/edit icon next to the rate to enter edit mode
- When activated, switch to a number input and change label to "Manual"
- Send `fxRate` and `fxRateManual: true` in the API payload when a manual rate is entered

#### Scenario: User edits FX rate inline
- **WHEN** the user selects a non-EUR currency in the expense form and clicks the edit pencil next to the displayed FX rate
- **THEN** the rate becomes an editable number input, the label changes to "Manual", and saving sends the manual rate to the backend

#### Scenario: User leaves FX rate unchanged (auto)
- **WHEN** the user selects a non-EUR currency but does not click the edit pencil
- **THEN** no `fxRate` is sent in the API payload, and the backend auto-fetches the rate

### Requirement: Frontend displays manual rate badge
The system SHALL display a "manual" badge on expense list items, report detail rows, and PDF exports where `fx_rate_manual` is true.

#### Scenario: Manual rate shown in expense list
- **WHEN** an expense with `fx_rate_manual = true` is displayed in the expenses list
- **THEN** a small "manual" badge appears next to the original amount or FX rate display

#### Scenario: Auto rate has no badge
- **WHEN** an expense with `fx_rate_manual = false` is displayed
- **THEN** no badge is shown (default behavior)
