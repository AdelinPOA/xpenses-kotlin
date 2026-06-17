## ADDED Requirements

### Requirement: Extended DelegationParsed TypeScript Interface

The frontend SHALL define an extended TypeScript interface `DelegationParsedExtended` (or replace `EmailSimulationParsed` with it) that includes all legacy fields plus the 11 new structured delegation fields. The interface SHALL be defined in `frontend/lib/api.ts`.

| Property | Type | Description |
|----------|------|-------------|
| `title` | `string` | Report title (legacy) |
| `date_from` | `string` | Start date (legacy) |
| `date_to` | `string` | End date (legacy) |
| `description` | `string` | Human-readable summary (legacy) |
| `kundenauftrag` | `string?` | Customer order number |
| `auftragsart` | `string?` | Order type code |
| `positionstyp` | `string?` | Task / position type description |
| `technplatz_raw` | `string?` | Technical place as written |
| `technplatz_line` | `boolean?` | `true` if raw value starts with `C` + 6+ digits |
| `kunde_code` | `string?` | Customer numeric code |
| `kunde_name` | `string?` | Customer full name |
| `adresse` | `string?` | Full address (street, postal code, city, country) |
| `vorgang` | `string?` | Process / Vorgang number |
| `arbeitsplatz` | `string?` | Workplace information |

#### Scenario: interface defines all 14 properties

- **WHEN** the `DelegationParsedExtended` (or updated `EmailSimulationParsed`) type is inspected in `frontend/lib/api.ts`
- **THEN** it SHALL declare all 4 legacy fields (`title`, `date_from`, `date_to`, `description`) as required `string` properties
- **THEN** it SHALL declare `kundenauftrag`, `auftragsart`, `positionstyp`, `technplatz_raw`, `kunde_code`, `kunde_name`, `adresse`, `vorgang`, `arbeitsplatz` as optional `string?` properties
- **THEN** it SHALL declare `technplatz_line` as an optional `boolean?` property

#### Scenario: EmailSimulationOut uses the extended type

- **WHEN** `EmailSimulationOut` interface is inspected in `frontend/lib/api.ts`
- **THEN** the `parsed`, `local_parsed`, and `gemini_parsed` properties SHALL use the extended type (either `DelegationParsedExtended` or the updated `EmailSimulationParsed`) rather than the 4-field-only `EmailSimulationParsed`

### Requirement: Structured Fields Table Replaces Description Block in Simulation Cards

Each parser card (Local Parser and Gemini Parser) in the admin IMAP simulation result SHALL replace the single `description` `<pre>` block with a structured table or card grid showing each structured delegation field as a labeled row. The display SHALL retain the existing `title`, `date_from`, and `date_to` at the top.

The structured fields SHALL be rendered in a two-column label-value layout inside each parser card. Field labels SHALL use human-readable names:

| JSON Key | Display Label |
|----------|--------------|
| `kundenauftrag` | Customer Order |
| `auftragsart` | Order Type |
| `positionstyp` | Position Type |
| `technplatz_raw` | Technical Place |
| `technplatz_line` | (badge, see below) |
| `kunde_code` | Customer Code |
| `kunde_name` | Customer Name |
| `adresse` | Address |
| `vorgang` | Process / Vorgang |
| `arbeitsplatz` | Workplace |

#### Scenario: local parser card shows structured fields in a table

- **WHEN** `simulationResult.local_parsed` is non-null and has structured fields populated (e.g., `kundenauftrag: "0007038319"`)
- **THEN** the local parser card SHALL render:
  - The existing `title`, `date_from` / `date_to` section at the top (unchanged)
  - Below the date row: a structured field table showing a label-value row for each non-null/non-empty structured field
  - The `description` field MAY still be shown as a `<pre>` block at the bottom of the structured fields, but the structured data SHALL be the primary visual element

#### Scenario: empty/null structured fields are hidden from the table

- **WHEN** a structured field (e.g., `arbeitsplatz`) is `null`, `undefined`, or empty string `""`
- **THEN** that field SHALL NOT render a row in the structured table
- **THEN** only populated fields (non-null, non-empty) SHALL appear

#### Scenario: gemini parser card mirrors same structured layout

- **WHEN** `simulationResult.gemini_parsed` is non-null
- **THEN** the Gemini parser card SHALL render the identical structured table layout as the local parser card

### Requirement: technplatz_line Colored Badge

When `technplatz_line` is `true`, the `technplatz_raw` value SHALL be accompanied by a colored badge/tag reading "Production Line" (or similar). When `technplatz_line` is `false` or absent, no badge SHALL be shown.

#### Scenario: badge displayed when technplatz_line is true

- **WHEN** `technplatz_raw` is `"C374981 Lwiw 40kcph Ukraine Can line 1"` and `technplatz_line` is `true`
- **THEN** the Technical Place row SHALL display:
  - Label: `Technical Place`
  - Value: `C374981 Lwiw 40kcph Ukraine Can line 1`
  - Immediately after the value (inline or on next line): a colored badge with text `Production Line`
- **THEN** the badge SHALL use a color scheme distinct from the card background (e.g., green/emerald background with white or dark text, or a blue/indigo accent)

#### Scenario: no badge when technplatz_line is false

- **WHEN** `technplatz_raw` is `"Building 7, Floor 2"` and `technplatz_line` is `false` or `null`
- **THEN** the Technical Place row SHALL show `"Building 7, Floor 2"` without any badge

#### Scenario: no badge when technplatz_raw is null

- **WHEN** `technplatz_raw` is `null` or `undefined`
- **THEN** the Technical Place row SHALL NOT render

### Requirement: Customer Code and Name Displayed in Adjacent Rows

When both `kunde_code` and `kunde_name` are present, they MAY be displayed as a single combined row (code + name) or as two adjacent rows in the structured table. When only one is present, that row SHALL display alone.

#### Scenario: both kunde_code and kunde_name shown as combined row

- **WHEN** `kunde_code` is `"0022265695"` and `kunde_name` is `"PJSC CARLSBERG UKRAINE"`
- **THEN** the table SHALL either:
  - Show a single "Customer" row with value `"0022265695 PJSC CARLSBERG UKRAINE"`, OR
  - Show two rows: "Customer Code" → `"0022265695"` and "Customer Name" → `"PJSC CARLSBERG UKRAINE"`

### Requirement: Responsive Layout for Simulation Display

The structured field table SHALL be responsive and render legibly on mobile screen widths (320px+). The side-by-side parser cards SHALL remain in a single column on small screens.

#### Scenario: stacked layout on mobile

- **WHEN** the viewport width is less than 1024px (below the `lg:` breakpoint)
- **THEN** the two parser cards SHALL stack vertically (one card per row) with full width

#### Scenario: structured table wraps labels on small screens

- **WHEN** the viewport width is less than 480px
- **THEN** each structured field row SHALL stack the label above the value instead of side-by-side, ensuring readability without horizontal scrolling

#### Scenario: technplatz_line badge wraps gracefully

- **WHEN** `technplatz_raw` value is long (e.g., `"C374981 Lwiw 40kcph Ukraine Can line 1"`) and the viewport width is narrow
- **THEN** the value text SHALL wrap to multiple lines and the badge SHALL appear on a new line if insufficient horizontal space exists

### Requirement: Backward-Compatible Rendering

The simulation display SHALL gracefully handle legacy `EmailSimulationParsed` objects that contain only the 4 original fields (from older API responses or cached data). The new structured table section SHALL simply be absent when all structured fields are null/empty.

#### Scenario: old API response with only 4 fields renders without errors

- **WHEN** `simulationResult.local_parsed` contains only `title`, `date_from`, `date_to`, `description` (all 11 new fields are `null`)
- **THEN** the local parser card SHALL render the existing title/dates/description display without the structured fields table
- **THEN** no rendering errors or console warnings SHALL occur
