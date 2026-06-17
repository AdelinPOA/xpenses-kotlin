## Spec 1: Local Parser Enhancement

- [x] 1.1 Add new keyword groups to `parseDelegationEmailLocal()`: `vorgangKws`, `arbeitsplatzKws`, `auftragsartKws`, `technikerKws`, `adresseKws` — German/English/Romanian synonyms
- [x] 1.2 Implement `extractFieldAfterKeyword(lines, keywords, stripPrefix)` helper to reduce code duplication across the 8+ field extractions
- [x] 1.3 Add `technplatz_is_line` detection: if first whitespace-delimited token of TechnPlatz value matches `^C\d{6,}`, set `technplatz_line=true` and expose `line_number` = that token
- [x] 1.4 Enhance customer extraction to split `kunde_code` (leading digits) and `kunde_name` (rest of value)
- [x] 1.5 Add multi-line address extraction: after finding `Adresse` keyword, collect subsequent non-keyword lines until next keyword or blank line
- [x] 1.6 Update return map to include 12+ keys: title, date_from, date_to, description, kundenauftrag, auftragsart, positionstyp, technplatz_raw, technplatz_line, kunde_code, kunde_name, adresse, vorgang, arbeitsplatz, techniker
- [x] 1.7 Add `EmailSimulationOut` DTO fields for all new parser output keys

## Spec 2: Gemini Parser Schema

- [x] 2.1 Extend Gemini `responseSchema` JSON with 11 new properties following snake_case naming
- [x] 2.2 Add prompt instruction for line-number detection: "if technplatz_raw starts with C followed by 6+ digits, set technplatz_line to true"
- [x] 2.3 Add prompt instruction: "split 'Kunde' field into kunde_code (numeric prefix) and kunde_name (rest)"
- [x] 2.4 Keep all 4 legacy fields in the schema for backward compatibility
- [x] 2.5 Add backend validation: map Gemini response to the extended map (fill missing optional fields with nulls)

## Spec 3: ExpenseReport Entity & Migration

- [x] 3.1 Create `backend-kotlin-jpa/src/main/resources/db/migration/V4__add_delegation_fields.sql` with 10 nullable TEXT columns + 1 BOOLEAN column
- [x] 3.2 Add 11 new properties to `ExpenseReport` entity in `Models.kt`: `kundenauftrag`, `auftragsart`, `positionstyp`, `technplatzRaw`, `technplatzLine`, `kundeCode`, `kundeName`, `adresse`, `vorgang`, `arbeitsplatz`
- [x] 3.3 Add `@JsonProperty` snake_case annotations on new entity fields for Jackson serialization
- [x] 3.4 Add new fields to `ReportOut` DTO (and `ReportCreate`/`ReportUpdate` if needed)
- [x] 3.5 Update `EmailImportService.processIncomingEmail` and `simulateIncomingEmail` to map new parser fields to entity fields
- [x] 3.6 Add delegation details section to frontend report detail page (`app/reports/[id]/page.tsx`) when delegation fields are present

## Spec 4: Frontend Simulation Display

- [x] 4.1 Extend `DelegationParsed` / `EmailSimulationOut` TypeScript types in `frontend/lib/api.ts` with 11 new optional fields
- [x] 4.2 Replace the `<pre>{description}</pre>` block in each parser card with a structured field table displaying all non-null fields
- [x] 4.3 Add a colored badge component for `technplatz_line: true` ("Production Line" badge)
- [x] 4.4 Ensure responsive layout: cards stack vertically on mobile, labels above values on small screens
- [x] 4.5 Update the MOCK_DELEGATION_EMAIL in the IMAP page to include `TechnPlatz C374981` format (it already has this)

## Verify

- [x] 5.1 Local parser correctly extracts all 12+ fields from the sample email
- [x] 5.2 technplatz_line = true when value is `C374981`, false for `374981`
- [x] 5.3 Gemini response includes new fields when API key is configured
- [x] 5.4 V4 migration runs without error on existing database
- [x] 5.5 Frontend simulation shows structured fields in both parser columns
- [x] 5.6 Existing reports without delegation fields render normally (no UI breakage)
