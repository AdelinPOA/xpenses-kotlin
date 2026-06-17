## ADDED Requirements

### Requirement: Storage decision — Option A, separate nullable columns
The delegation email structured fields SHALL be stored as individual nullable columns on the `expense_reports` table rather than as a single JSON metadata column.

#### Rationale
- The set of fields is fixed and known at design time (10 fields from the parser + 1 boolean)
- Individual columns enable SQL-level filtering, indexing, and reporting (e.g. "all reports for customer X")
- The existing entity pattern (V1 init + V2/V3 migrations adding columns) already follows this model
- JSON metadata columns add serialisation/deserialisation overhead and cannot be queried efficiently with JPQL or Spring Data derived queries

#### Scenario: decision against JSON metadata column
- **WHEN** the storage approach is evaluated
- **THEN** a single JSON column SHALL NOT be used; instead each field SHALL get its own `TEXT` or `BOOLEAN` column

### Requirement: Flyway V4 migration adds 11 nullable columns
A new Flyway migration file `V4__add_delegation_structured_fields.sql` SHALL be created at `backend-kotlin-jpa/src/main/resources/db/migration/V4__add_delegation_structured_fields.sql`. It SHALL add the following columns to the `expense_reports` table, all nullable with no default value unless specified:

| Column | Type | Notes |
|--------|------|-------|
| `kundenauftrag` | `TEXT` | Customer order number (e.g., `0007038319`) |
| `auftragsart` | `TEXT` | Order type code (e.g., `KR20`) |
| `positionstyp` | `TEXT` | Task/position type description |
| `technplatz_raw` | `TEXT` | Raw TechnPlatz value (e.g., `C374981 Lwiw 40kcph Ukraine Can line 1`) |
| `technplatz_line` | `BOOLEAN NOT NULL DEFAULT FALSE` | `true` if `technplatz_raw` starts with `C` followed by digits |
| `kunde_code` | `TEXT` | Customer numeric code (e.g., `0022265695`) |
| `kunde_name` | `TEXT` | Customer name (e.g., `PJSC CARLSBERG UKRAINE`) |
| `adresse` | `TEXT` | Full address (street, postal code, city, country) |
| `vorgang` | `TEXT` | Process/Vorgang number |
| `arbeitsplatz` | `TEXT` | Workplace information |
| `techniker` | `TEXT` | Technician name or identifier |

#### Scenario: V4 migration applies cleanly on a fresh database
- **WHEN** `./gradlew flywayMigrate` is run against an empty database
- **THEN** migrations V1, V2, V3, and V4 all succeed
- **THEN** the `expense_reports` table has 11 new columns with correct types and nullability

#### Scenario: V4 migration applies on an existing database with data
- **WHEN** `./gradlew flywayMigrate` is run against a database containing existing expense_reports rows
- **THEN** the migration succeeds
- **THEN** all existing rows have `NULL` for the 10 new text columns and `FALSE` for `technplatz_line`

#### Scenario: V4 migration is idempotent on re-run
- **WHEN** `./gradlew flywayMigrate` is run a second time
- **THEN** Flyway detects the V4 checksum has not changed and skips it (already applied)

### Requirement: ExpenseReport entity extended with 11 nullable properties
The `ExpenseReport` entity class in `Models.kt` SHALL gain 11 new properties corresponding to the new database columns. Each SHALL use `@Column(name = "...")` annotation and be nullable (`Type?`) except `technplatzLine` which SHALL be `Boolean` with a default of `false`.

#### Scenario: ExpenseReport entity declares all new delegation fields
- **WHEN** the `ExpenseReport` class definition is inspected
- **THEN** it SHALL declare the following properties after the existing `updatedAt` field:

```kotlin
@Column(name = "kundenauftrag")
var kundenauftrag: String? = null,

@Column(name = "auftragsart")
var auftragsart: String? = null,

@Column(name = "positionstyp")
var positionstyp: String? = null,

@Column(name = "technplatz_raw")
var technplatzRaw: String? = null,

@Column(name = "technplatz_line", nullable = false)
var technplatzLine: Boolean = false,

@Column(name = "kunde_code")
var kundeCode: String? = null,

@Column(name = "kunde_name")
var kundeName: String? = null,

var adresse: String? = null,

var vorgang: String? = null,

var arbeitsplatz: String? = null,

var techniker: String? = null,
```

#### Scenario: existing ExpenseReport constructor calls still compile without changes
- **WHEN** existing code creates `ExpenseReport(...)` (in `EmailImportService.kt` lines 321–330 and 389–398, `ReportController.kt` line 91, `DataInitializer.kt` lines 96 and 135)
- **THEN** all existing call sites compile without modification because the new properties have default values (`null` or `false`)

### Requirement: ReportCreate and ReportUpdate DTOs extended with new optional fields
The `ReportCreate` and `ReportUpdate` DTOs in `ReportController.kt` SHALL gain the 11 new fields as nullable `String?` properties (with `@JsonProperty` snake_case mappings) so that manual report creation/editing can optionally supply these fields.

#### Scenario: ReportCreate accepts new fields via JSON
- **WHEN** a POST to `/api/reports` includes JSON with `"kundenauftrag": "0007038319"`, `"kunde_code": "0022265695"`, `"technplatz_line": true`
- **THEN** the report is created with those values stored

#### Scenario: ReportUpdate accepts new fields via PATCH
- **WHEN** a PATCH `/api/reports/{id}` includes JSON with `"kundenauftrag": "0007038319"`
- **THEN** only that field is updated on the report (other fields unchanged)

#### Scenario: missing new fields in request body default to null
- **WHEN** a POST or PATCH to `/api/reports` does not include any of the 11 new fields
- **THEN** the report is created/updated with the existing behaviour (new fields remain `null`)

### Requirement: mapReportToOut includes new fields in ReportOut
The `mapReportToOut()` function in `ReportController.kt` SHALL map the 11 new entity fields to corresponding `@JsonProperty` properties on the `ReportOut` DTO, so the frontend receives structured field data when fetching report details.

#### Scenario: ReportOut JSON includes delegation fields
- **WHEN** a GET `/api/reports/{id}` is called for a report that has delegation fields populated
- **THEN** the response JSON SHALL include `"kundenauftrag"`, `"auftragsart"`, `"positionstyp"`, `"technplatz_raw"`, `"technplatz_line"`, `"kunde_code"`, `"kunde_name"`, `"adresse"`, `"vorgang"`, `"arbeitsplatz"`, and `"techniker"` with their stored values

#### Scenario: ReportOut returns null fields when unset
- **WHEN** a GET `/api/reports/{id}` is called for a report created before the migration (fields are `NULL`)
- **THEN** the response JSON SHALL include all 11 new fields with `null` values (text fields) or `false` (`technplatz_line`)

### Requirement: EmailImportService populates new fields when creating reports
The two report-creation sites in `EmailImportService.kt` (lines 321–330 for real email import and lines 389–398 for simulation) SHALL populate the new entity fields from the parsed map keys. The field mapping SHALL be:

| Parsed map key | Entity field | Notes |
|----------------|-------------|-------|
| `order` or `kundenauftrag` | `kundenauftrag` | Prefer `kundenauftrag` if present |
| `order_type` or `auftragsart` | `auftragsart` | |
| `task_type` or `positionstyp` | `positionstyp` | |
| `technplatz` or `technplatz_raw` | `technplatzRaw` | |
| `technplatz_is_line` → `"true"` | `technplatzLine = true` | |
| `line_number` | (not stored — derived from technplatz_raw) | |
| `customer` → split | `kundeCode`, `kundeName` | Split on first space if both present |
| `kunde_code` | `kundeCode` | |
| `kunde_name` | `kundeName` | |
| `address` or `adresse` | `adresse` | |
| `process_number` or `vorgang` | `vorgang` | |
| `workplace` or `arbeitsplatz` | `arbeitsplatz` | |
| `technician` or `techniker` | `techniker` | |

#### Scenario: EmailImport populates fields from local parser output
- **WHEN** a delegation email is imported and `parseDelegationEmailLocal()` returns a map with keys `order`, `order_type`, `task_type`, `technplatz`, `technplatz_is_line`, `customer`, `address`, `process_number`, `workplace`, `technician`
- **THEN** the created `ExpenseReport` SHALL have all corresponding entity fields populated

#### Scenario: EmailImport populates fields from Gemini parser output
- **WHEN** a delegation email is imported and `parseDelegationEmailGemini()` returns a map with keys `kundenauftrag`, `auftragsart`, `positionstyp`, `technplatz_raw`, `technplatz_line`, `kunde_code`, `kunde_name`, `adresse`, `vorgang`, `arbeitsplatz`, `techniker`
- **THEN** the created `ExpenseReport` SHALL have all corresponding entity fields populated

### Requirement: Backward compatibility with existing data and workflows
All existing functionality SHALL continue to work without changes to the user-facing API contracts for fields that existed before this change.

#### Scenario: existing report creation routes work without new fields
- **WHEN** a POST `/api/reports` is sent with only `title`, `description`, `date_from`, `date_to`, and `currency`
- **THEN** the report is created successfully with `status == "draft"` and all 11 new entity fields are `null` / `false`
- **THEN** the response `ReportOut` SHALL include the new fields as `null` / `false`

#### Scenario: GET /api/reports returns reports created before migration
- **WHEN** a GET `/api/reports` is called
- **THEN** reports created before the V4 migration (where the columns are `NULL` in the database) SHALL be returned with `null` / `false` for the new fields
- **THEN** the frontend SHALL render these gracefully (show nothing or "—" for null fields)

#### Scenario: existing frontend report list page does not break
- **WHEN** the frontend fetches the report list (GET `/api/reports`)
- **THEN** the addition of new fields in the JSON response SHALL NOT cause any existing rendering logic to break (the frontend simply ignores unknown fields in the response until explicitly updated)

### Requirement: Frontend report detail page displays new delegation fields
The frontend report detail view SHALL be updated to display the 11 new fields when they have non-null values. Fields SHALL be displayed in a structured section titled "Delegation Details" or similar, grouped logically.

#### Scenario: report detail page shows delegation detail section when fields exist
- **WHEN** the user views a report that has at least one non-null delegation field (e.g., `kundenauftrag` is populated)
- **THEN** a "Delegation Details" section SHALL appear showing the field labels and values in a two-column label-value layout

#### Scenario: report detail page hides delegation section when all fields are null
- **WHEN** the user views a report where all 11 delegation fields are `null` / `false` (e.g., a manually created report from the old UI)
- **THEN** the "Delegation Details" section SHALL NOT be rendered

#### Scenario: technplatz_line displays as a badge or tag
- **WHEN** `technplatzLine` is `true`
- **THEN** the frontend SHALL render a badge (e.g., "Production Line") next to the `technplatzRaw` value

#### Scenario: customer fields display as combined string
- **WHEN** both `kundeCode` and `kundeName` are non-null
- **THEN** the frontend SHALL display them as a single combined row: `"0022265695 PJSC CARLSBERG UKRAINE"` (code + space + name)

## MODIFIED Requirements

### Requirement: ExpenseReport constructor used in EmailImportService (was 7-parameter call)
The `ExpenseReport(...)` constructor calls in `EmailImportService.kt` (both the real import path and the simulation path) SHALL be modified to pass the 11 new parsed fields from the parser output map.

#### Scenario: real email import supplies new fields to constructor
- **WHEN** a delegation email is imported (line ~321)
- **THEN** the `ExpenseReport` constructor SHALL include all mapped fields from `parsed` map, in addition to the existing `title`, `description`, `dateFrom`, `dateTo`, `status`, `user`, `createdAt`, `updatedAt`

#### Scenario: simulation email import supplies new fields to constructor
- **WHEN** a delegation email simulation is run (line ~389)
- **THEN** the `ExpenseReport` constructor SHALL include all mapped fields from `finalParsed` map, in addition to the existing fields

### Requirement: ReportOut DTO extended (was 21 fields)
The `ReportOut` data class in `ReportController.kt` SHALL gain 11 new nullable properties for the delegation fields, with appropriate `@JsonProperty` snake_case names.

#### Scenario: ReportOut has 32 fields instead of 21
- **WHEN** the `ReportOut` data class definition is inspected after the change
- **THEN** it SHALL contain all original fields plus: `kundenauftrag`, `auftragsart`, `positionstyp`, `technplatzRaw`/`technplatz_raw`, `technplatzLine`/`technplatz_line`, `kundeCode`/`kunde_code`, `kundeName`/`kunde_name`, `adresse`, `vorgang`, `arbeitsplatz`, `techniker`

### Requirement: ReportCreate DTO extended (was 5 fields)
The `ReportCreate` data class SHALL gain 11 new nullable `String?` properties and one nullable `Boolean?` property (`technplatzLine`) with `@JsonProperty` snake_case names.

#### Scenario: ReportCreate accepts all delegation fields
- **WHEN** the `ReportCreate` data class is inspected
- **THEN** it SHALL include the original 5 fields plus all 11 new delegation fields as optional parameters with default `null`

### Requirement: ReportUpdate DTO extended (was 5 fields)
The `ReportUpdate` data class SHALL gain 11 new nullable `String?` properties and one nullable `Boolean?` property with `@JsonProperty` snake_case names.

#### Scenario: ReportUpdate accepts all delegation fields
- **WHEN** the `ReportUpdate` data class is inspected
- **THEN** it SHALL include the original 5 fields plus all 11 new delegation fields as optional parameters with default `null`
