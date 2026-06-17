## ADDED Requirements

### Requirement: Local parser output expands from 4 keys to 12+ structured keys
`parseDelegationEmailLocal()` in `EmailImportService.kt` SHALL return a `Map<String, String>` with at least 12 keys instead of the current 4 (title, date_from, date_to, description). Each structured field SHALL be extracted as a first-class map entry using dedicated regex-based extraction with keyword matching (German/English/Romanian).

#### Scenario: parser returns all structured fields for a well-formed email
- **WHEN** `parseDelegationEmailLocal()` is called with a delegation email containing Kundenauftrag, Auftragsart, Positionstyp, Starttermin, Endtermin, Vorgang, Arbeitsplatz, Techniker, TechnPlatz, Kunde, and Adresse
- **THEN** the returned map SHALL contain the following keys populated with the extracted values: `title`, `date_from`, `date_to`, `description`, `order`, `order_type`, `task_type`, `process_number`, `workplace`, `technician`, `technplatz`, `customer`, `address`

#### Scenario: parser handles sparse input with only mandatory fields
- **WHEN** `parseDelegationEmailLocal()` is called with an email containing only Kundenauftrag, Starttermin, and Endtermin
- **THEN** the returned map SHALL have `order`, `date_from`, and `date_to` populated with real values, and all other optional fields SHALL contain empty string `""`

#### Scenario: parser returns null when dates are missing
- **WHEN** `parseDelegationEmailLocal()` is called with text that contains no start and end dates
- **THEN** the function SHALL return `null` (unchanged from current behaviour)

### Requirement: Kundenauftrag / Auftrag extraction (order)
The `order` key SHALL contain the customer order number extracted from lines matching keywords "Kundenauftrag", "Auftrag", "order", "comanda", "project", or "projekt".

#### Scenario: order number extracted from Kundenauftrag line
- **WHEN** a line contains "Kundenauftrag            0007038319"
- **THEN** `order` SHALL equal `"0007038319"`

#### Scenario: order number extracted from Auftrag line
- **WHEN** a line contains "Auftrag             12345"
- **THEN** `order` SHALL equal `"12345"`

#### Scenario: order number extracted from English keyword
- **WHEN** a line contains "Order                ABC-9876"
- **THEN** `order` SHALL equal `"ABC-9876"`

### Requirement: Auftragsart extraction (order_type)
The `order_type` key SHALL contain the order type code extracted from lines matching keywords "Auftragsart", "order type", "order type", "tip comanda", or "tip comandă".

#### Scenario: order type extracted from Auftragsart line
- **WHEN** a line contains "Auftragsart              KR20"
- **THEN** `order_type` SHALL equal `"KR20"`

#### Scenario: order type is empty when keyword absent
- **WHEN** no line contains an Auftragsart keyword
- **THEN** `order_type` SHALL equal `""`

### Requirement: Positionstyp extraction (task_type)
The `task_type` key SHALL contain the full task/position type description extracted from lines matching keywords "Positionstyp", "task", "position", "activitate", or "work".

#### Scenario: task type extracted from Positionstyp line
- **WHEN** a line contains "Positionstyp             Mechanical full installation, start-up"
- **THEN** `task_type` SHALL equal `"Mechanical full installation, start-up"`

#### Scenario: task type extracted with multi-word German value
- **WHEN** a line contains "Positionstyp             Reinigungst. elektr. KSE"
- **THEN** `task_type` SHALL equal `"Reinigungst. elektr. KSE"`

### Requirement: Vorgang extraction (process_number)
The `process_number` key SHALL contain the process number extracted from lines matching keywords "Vorgang", "process", "proces", or "procedeu".

#### Scenario: process number extracted from Vorgang line
- **WHEN** a line contains "Vorgang                  0545           DEJR-N-INB_ER1_Newtech"
- **THEN** `process_number` SHALL equal `"0545 DEJR-N-INB_ER1_Newtech"` (the full content after the keyword, trimmed and normalized)

### Requirement: Arbeitsplatz extraction (workplace)
The `workplace` key SHALL contain workplace information extracted from lines matching keywords "Arbeitsplatz", "workplace", "work place", "loc de munca", or "post de lucru".

#### Scenario: workplace extracted from Arbeitsplatz line
- **WHEN** a line contains "Arbeitsplatz             ER_MT          1049           Disposition Reinigungst. elektr.  KSE"
- **THEN** `workplace` SHALL equal `"ER_MT 1049 Disposition Reinigungst. elektr. KSE"` (whitespace-collapsed)

### Requirement: Techniker extraction (technician)
The `technician` key SHALL contain the technician's name extracted from lines matching keywords "Techniker", "technician", "tehnician", or "nume".

#### Scenario: technician name extracted from Techniker line
- **WHEN** a line contains "Techniker                Popescu Adelin Petrisor"
- **THEN** `technician` SHALL equal `"Popescu Adelin Petrisor"`

### Requirement: TechnPlatz extraction and line-number detection (technplatz)
The `technplatz` key SHALL contain the full value from lines matching keywords "TechnPlatz", "technplatz", "location", "ort", "locatie", "place", "site", or "santier". Additionally, when the value starts with "C" followed by one or more digits (e.g., "C374981"), the value SHALL be flagged as a production line ID.

#### Scenario: TechnPlatz extracted with full string
- **WHEN** a line contains "TechnPlatz               C374981        Lwiw 40kcph Ukraine Can line 1"
- **THEN** `technplatz` SHALL equal `"C374981 Lwiw 40kcph Ukraine Can line 1"`

#### Scenario: production line detection via C-prefix pattern
- **WHEN** `technplatz` starts with a capital "C" followed by digits at the beginning of the value (e.g., "C374981")
- **THEN** an additional key `technplatz_is_line` SHALL be set to `"true"` and a key `line_number` SHALL contain the extracted numerical portion (e.g., `"374981"`)

#### Scenario: TechnPlatz without C-prefix is not flagged as line
- **WHEN** `technplatz` is "Building 7, Floor 2" (no "C" + digits prefix)
- **THEN** `technplatz_is_line` SHALL be `"false"` and `line_number` SHALL be `""`

### Requirement: Kunde extraction (customer)
The `customer` key SHALL contain customer code and name extracted from lines matching keywords "Kunde", "customer", "client", or "beneficiar".

#### Scenario: customer code and name extracted from Kunde line
- **WHEN** a line contains "Kunde                    0022265695     PJSC CARLSBERG UKRAINE"
- **THEN** `customer` SHALL equal `"0022265695 PJSC CARLSBERG UKRAINE"`

### Requirement: Adresse extraction (address)
The `address` key SHALL contain the full multi-line address extracted starting from lines matching keywords "Adresse", "address", "adresa", or "adresă". The extraction SHALL capture subsequent lines until the next keyword-matched field or end of text.

#### Scenario: single-line address extracted from Adresse line
- **WHEN** a line contains "Adresse                  Kleparivska Str., 18" with no following address lines
- **THEN** `address` SHALL equal `"Kleparivska Str., 18"`

#### Scenario: multi-line address extracted across consecutive lines
- **WHEN** lines are:
  ```
  Adresse                  Kleparivska Str., 18
                           79007          Lviv
                           Ukraine
  ```
- **THEN** `address` SHALL equal `"Kleparivska Str., 18, 79007 Lviv, Ukraine"` (concatenated with comma separation, whitespace-collapsed)

#### Scenario: address extraction stops at next keyword
- **WHEN** Adresse is followed by a blank line then a known keyword (e.g., "Kundenauftrag")
- **THEN** address extraction SHALL stop before the keyword line

### Requirement: Title and description recompose from new structured fields
The `title` and `description` keys SHALL be recomposed from the new structured fields rather than extracted directly. `title` SHALL be `"Delegation: <customer> (<technplatz>)"` (max 200 chars). `description` SHALL be a human-friendly summary concatenating order, task_type, workplace, process_number, and address.

#### Scenario: title composed from customer and technplatz
- **WHEN** customer is `"0022265695 PJSC CARLSBERG UKRAINE"` and technplatz is `"C374981 Lwiw 40kcph Ukraine Can line 1"`
- **THEN** `title` SHALL equal `"Delegation: 0022265695 PJSC CARLSBERG UKRAINE (C374981 Lwiw 40kcph Ukraine Can line 1)"`

#### Scenario: description composed from structured fields
- **WHEN** order = `"0007038319"`, task_type = `"Mechanical full installation, start-up"`, workplace = `"ER_MT 1049"`, process_number = `"0545 DEJR-N-INB_ER1_Newtech"`, address = `"Kleparivska Str., 18, 79007 Lviv, Ukraine"`
- **THEN** description SHALL contain all these values in a readable format

### Requirement: Gemini parser schema extended to 12+ fields
`parseDelegationEmailGemini()` SHALL use an updated `responseSchema` that requests all structured fields from the LLM, mirroring the local parser's output map keys.

#### Scenario: Gemini response schema includes new fields
- **WHEN** the Gemini API is called
- **THEN** the `responseSchema.properties` SHALL include: `title`, `date_from`, `date_to`, `description`, `order`, `order_type`, `task_type`, `process_number`, `workplace`, `technician`, `technplatz`, `technplatz_is_line`, `line_number`, `customer`, `address`

#### Scenario: Gemini prompt instructs line-number detection
- **WHEN** the Gemini prompt is constructed
- **THEN** it SHALL instruct the LLM to set `technplatz_is_line` to `"true"` when TechnPlatz starts with "C" followed by digits, and extract the numeric portion into `line_number`

#### Scenario: Gemini parser returns null for unparseable input
- **WHEN** the Gemini API response is empty or malformed
- **THEN** `parseDelegationEmailGemini()` SHALL return `null` (unchanged from current behaviour)

### Requirement: TechnPlatz Cxxxxxx production line detection (cross-cutting capability)
The system SHALL recognise any TechnPlatz value whose first token matches the pattern `C` followed by one or more ASCII digits as a production line identifier. This capability SHALL be implemented identically in both the local regex parser and the Gemini LLM prompt.

#### Scenario: C374981 detected as line 374981
- **WHEN** TechnPlatz value is `"C374981 Lwiw 40kcph Ukraine Can line 1"`
- **THEN** `technplatz_is_line` is `"true"` and `line_number` is `"374981"`

#### Scenario: C0 detected as line 0
- **WHEN** TechnPlatz value is `"C0"`
- **THEN** `technplatz_is_line` is `"true"` and `line_number` is `"0"`

#### Scenario: lowercase c prefix is NOT detected as line
- **WHEN** TechnPlatz value is `"c374981"`
- **THEN** `technplatz_is_line` is `"false"` and `line_number` is `""`

#### Scenario: non-digit after C is NOT detected as line
- **WHEN** TechnPlatz value is `"Component-374981"`
- **THEN** `technplatz_is_line` is `"false"` and `line_number` is `""`

### Requirement: Frontend simulation display shows new structured fields
The admin IMAP simulation page (`/admin/imap`) SHALL display the new structured fields in a table or card layout alongside the existing title/date fields when comparing local and Gemini parse results.

#### Scenario: simulation result panel renders new fields
- **WHEN** the user views the IMAP simulation result for a delegation email
- **THEN** the display SHALL show all extracted fields (order, order_type, task_type, process_number, workplace, technician, technplatz, technplatz_is_line, line_number, customer, address) in addition to title, date_from, date_to, and description

#### Scenario: line-number badge shown when technplatz_is_line is true
- **WHEN** `technplatz_is_line` is `"true"`
- **THEN** the frontend SHALL render a visual badge or indicator (e.g., "Production Line #374981") next to the TechnPlatz field

### Requirement: DTOs extended for structured delegation fields
The `EmailSimulationIn` and `EmailSimulationOut` DTOs SHALL include all new structured delegation fields as nullable strings.

#### Scenario: EmailSimulationOut has all new fields
- **WHEN** `EmailSimulationOut` class definition is inspected
- **THEN** it SHALL declare the following nullable `String` properties: `order`, `orderType`, `taskType`, `processNumber`, `workplace`, `technician`, `technplatz`, `technplatzIsLine`, `lineNumber`, `customer`, `address`

## MODIFIED Requirements

### Requirement: parseDelegationEmailLocal return type expanded (was 4-key Map)
The return type of `parseDelegationEmailLocal()` SHALL change from returning a `Map<String, String>` with exactly 4 keys (title, date_from, date_to, description) to returning a `Map<String, String>` with up to 17 keys.

#### Scenario: all old keys still present in new return map
- **WHEN** `parseDelegationEmailLocal()` is called with a well-formed delegation email
- **THEN** the returned map SHALL still contain the keys `title`, `date_from`, `date_to`, and `description` with the same semantics

#### Scenario: new keys are absent (empty string) for missing fields
- **WHEN** the email lacks Auftragsart, Vorgang, Arbeitsplatz, Techniker, or Adresse information
- **THEN** the corresponding map entries SHALL be present with value `""` rather than being absent or null

### Requirement: description field no longer concatenates raw extractions (was summary-only)
The `description` key SHALL change from containing raw concatenated fields ("Kundenauftrag: X\nLocation: Y\nTask: Z") to containing a clean, human-readable summary that references the now-separate structured fields.

#### Scenario: description is a readable sentence, not raw key-value pairs
- **WHEN** the parser returns a result
- **THEN** `description` SHALL NOT contain literal "Kundenauftrag:", "Location:", or "Task:" prefixes — those values SHALL live in their dedicated keys (`order`, `technplatz`, `task_type`)
