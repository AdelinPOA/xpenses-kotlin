## ADDED Requirements

### Requirement: Gemini Response Schema Expansion for Delegation Emails

The system SHALL extend the Gemini LLM response schema from 4 legacy fields (title, date_from, date_to, description) to at least 12 structured fields covering all delegation email data. The Gemini prompt SHALL request the following fields in its `response_mime_type: application/json` schema:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `kundenauftrag` | string | Customer order number | `0007038319` |
| `auftragsart` | string | Order type code | `KR20` |
| `positionstyp` | string | Task / position type description | `Mechanical full installation, start-up` |
| `technplatz_raw` | string | Technical place as written in the email | `C374981 Lwiw 40kcph Ukraine Can line 1` |
| `technplatz_line` | boolean | `true` if `technplatz_raw` starts with `C` followed by exactly 6 digits | `true` |
| `kunde_code` | string | Customer code (numeric identifier) | `0022265695` |
| `kunde_name` | string | Customer full name | `PJSC CARLSBERG UKRAINE` |
| `adresse` | string | Street, postal code, city, country | `vul. Mykoly Khvylovoho 15, 04080 Kyiv, Ukraine` |
| `vorgang` | string | Process / Vorgang number | `0545 DEJR-N-INB_ER1_Newtech` |
| `arbeitsplatz` | string | Workplace information | `ER_MT 1049 Disposition Reinigungst. elektr. KSE` |
| `techniker` | string | Technician name or identifier | `Adelin Popescu` |

#### Scenario: Gemini returns all 12+ structured fields for a standard delegation email

- **WHEN** the Gemini parser processes a delegation email containing `Kundenauftrag: 0007038319`, `Auftragsart: KR20`, `Positionstyp: Mechanical full installation`, `TechnPlatz: C374981 Lwiw 40kcph Ukraine Can line 1`, `Kunde: 0022265695 PJSC CARLSBERG UKRAINE`, `Adresse: vul. Mykoly Khvylovoho 15, 04080 Kyiv, Ukraine`, `Vorgang: 0545 DEJR-N-INB_ER1_Newtech`, `Arbeitsplatz: ER_MT 1049 Disposition Reinigungst. elektr. KSE`
- **THEN** the Gemini response contains all 11 structured fields populated with correct extracted values and `technplatz_line` is `true`

#### Scenario: Gemini returns minimal fields when email contains only core data

- **WHEN** the Gemini parser processes a delegation email containing only `Kundenauftrag`, dates, and `Kunde` without optional fields like `Vorgang` or `Arbeitsplatz`
- **THEN** the Gemini response populates `kundenauftrag`, `date_from`, `date_to`, `kunde_code`, `kunde_name` and sets missing optional fields to empty strings / `false`

#### Scenario: Gemini identifies non-line TechnPlatz

- **WHEN** the Gemini parser processes a delegation email where `TechnPlatz` does NOT match the `C`+6-digits pattern (e.g., `TF-12-0456`)
- **THEN** `technplatz_raw` contains the full value and `technplatz_line` is `false`

### Requirement: Prompt Changes for Structured Field Extraction

The system SHALL modify the Gemini parser's system prompt to instruct the LLM to extract each structured field individually rather than concatenating them into a description. The prompt SHALL:

- Instruct Gemini to parse all identifiable delegation fields from the email body, prioritizing exact matches from structured table blocks over free-text mentions
- Specify the exact JSON schema shape including field names (`kundenauftrag`, `auftragsart`, `positionstyp`, `technplatz_raw`, `technplatz_line`, `kunde_code`, `kunde_name`, `adresse`, `vorgang`, `arbeitsplatz`, `techniker`) and their types
- Instruct Gemini to set `technplatz_line` to `true` if `technplatz_raw` starts with the letter `C` followed by exactly 6 digits (regex pattern `C\d{6}`), otherwise `false`
- Request that `kunde_code` and `kunde_name` are split from the combined `Kunde` field (e.g., `"0022265695 PJSC CARLSBERG UKRAINE"` → `kunde_code: "0022265695"`, `kunde_name: "PJSC CARLSBERG UKRAINE"`)
- Request that `adresse` captures the full address block (street, postal code, city, country) as a single string
- Preserve the existing 4 legacy fields (`title`, `date_from`, `date_to`, `description`) in the response for backward compatibility
- Instruct Gemini to prefer original text formatting and preserve exact numbers, dates, and codes without normalization

#### Scenario: Prompt instructs splitting of combined Kunde field

- **WHEN** the Gemini system prompt includes the Kunde extraction instructions
- **THEN** the prompt explicitly tells the model to split the combined `Kunde` value into `kunde_code` (leading digits) and `kunde_name` (remaining text)

#### Scenario: Prompt instructs technplatz_line detection rule

- **WHEN** the Gemini system prompt includes TechnPlatz extraction instructions
- **THEN** the prompt explicitly states that `technplatz_line` SHALL be `true` if and only if `technplatz_raw` starts with `C` followed by exactly 6 digits

#### Scenario: Prompt preserves backward-compatible legacy fields

- **WHEN** the Gemini system prompt is updated with the new schema
- **THEN** the response schema still includes `title`, `date_from`, `date_to`, and `description` fields alongside the 11 new fields

### Requirement: Structured Field Extraction via LLM

The Gemini parser SHALL use the expanded response schema to enable backend code to access each delegation field individually by name from the parsed JSON. The backend SHALL:

- Validate that the Gemini response JSON conforms to the expected schema (all required fields present, types correct)
- Extract `technplatz_line` as a boolean from the JSON response; if absent or invalid, default to `false`
- Map Gemini response fields to the internal `DelegationData` DTO fields for downstream processing
- Log a warning for any expected field that is empty or missing in the Gemini response, but still proceed with available data

#### Scenario: Backend validates Gemini response schema

- **WHEN** the Gemini parser receives the LLM JSON response
- **THEN** the backend reads each field by name (`kundenauftrag`, `auftragsart`, `positionstyp`, `technplatz_raw`, `technplatz_line`, `kunde_code`, `kunde_name`, `adresse`, `vorgang`, `arbeitsplatz`, `techniker`) and populates the `DelegationData` DTO

#### Scenario: Backend handles partial Gemini response gracefully

- **WHEN** the Gemini response is missing the `vorgang` field (returned as empty string)
- **THEN** the parser logs a warning `"Gemini response missing optional field: vorgang"` and proceeds with all other populated fields

#### Scenario: technplatz_line defaults to false when absent

- **WHEN** the Gemini response JSON does not contain the `technplatz_line` field
- **THEN** the backend defaults `technplatz_line` to `false`

## MODIFIED Requirements

### Requirement: Gemini Parser Adapter Expansion

The Gemini parser adapter SHALL be modified to construct the extended schema definition for the Gemini API call. The schema definition object passed to the Gemini `generationConfig` SHALL include all 11 new fields in addition to the 4 legacy fields.

#### Scenario: Schema definition constructed with all fields

- **WHEN** the Gemini parser adapter builds the `generationConfig.response_schema`
- **THEN** the schema object contains exactly 15 properties: `title`, `date_from`, `date_to`, `description`, `kundenauftrag`, `auftragsart`, `positionstyp`, `technplatz_raw`, `technplatz_line` (type: boolean), `kunde_code`, `kunde_name`, `adresse`, `vorgang`, `arbeitsplatz`, `techniker`
