## Why

The current IMAP delegation email parser (`EmailImportService.kt`) extracts only 4 fields: title, date_from, date_to, and description. It recognizes Kundenauftrag, Positionstyp, TechnPlatz, Kunde, and Adresse but stuffs them all into a free-text description field.

Real delegation emails from the German automotive/industrial sector contain rich structured data that needs to be preserved as first-class fields:

- **Kundenauftrag / Auftrag** — customer order number (e.g., 0007038319)
- **Auftragsart** — order type code (e.g., KR20)
- **Positionstyp** — task/position type (e.g., "Mechanical full installation, start-up" or "Reinigungst. elektr. KSE")
- **TechnPlatz** — technical place; when the identifier starts with "C" followed by digits (e.g., "C374981"), it's a production line identifier
- **Kunde** — customer code + name (e.g., "0022265695 PJSC CARLSBERG UKRAINE")
- **Adresse** — street, postal code, city, country
- **Vorgang** — process number (e.g., "0545 DEJR-N-INB_ER1_Newtech")
- **Arbeitsplatz** — workplace info (e.g., "ER_MT 1049 Disposition Reinigungst. elektr. KSE")

The image attached to this issue shows a real email from a supplier with all these fields in a structured table format.

## What Changes

### Local Parser Enhancement
`parseDelegationEmailLocal()` extracts all structured fields as first-class map entries instead of concatenating them into a description string. Each field has dedicated regex-based extraction with proper keyword matching (German/English/Romanian).

### Gemini Parser Enhancement
`parseDelegationEmailGemini()` schema extended to request all structured fields from the LLM. The response schema grows from 4 fields to 12+ fields.

### ExpenseReport Extension (Optional — depends on storage decision)
Either extend the `ExpenseReport` entity with new nullable columns via Flyway migration, or store structured data as a JSON metadata column.

### Frontend Simulation Display
The side-by-side simulation page (`/admin/imap`) shows the new structured fields in a table/card layout alongside the existing date/title fields.

## Capabilities

### New Capabilities
- `delegation-structured-parsing`: Both local and Gemini parsers return a rich set of structured delegation fields
- `technplatz-line-detection`: TechnPlatz values matching the `Cxxxxxx` pattern are automatically identified as production line IDs

### Modified Capabilities
- `email-import`: Parsed output expands from 4 fields to 12+ structured fields
- `imap-simulation-display`: Frontend shows new fields in the comparison panel

## Impact

- **Backend**: `EmailImportService.kt` — major refactoring of both parsers; `EmailSimulationIn`/`EmailSimulationOut` DTOs extended; optional Flyway migration for new columns
- **Frontend**: `/admin/imap/page.tsx` — simulation result display extended with new fields
- **No breaking changes**: Existing report creation flow still works; new fields are additive
