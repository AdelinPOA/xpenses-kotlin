## MODIFIED Requirements

### Requirement: Factory-based OCR Parsing with Multi-Tier Gemini Fallback
The system SHALL parse receipts exclusively via the Gemini API, using an ordered chain of model tiers: `gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-2.5-flash`. If a call to a given model tier fails (e.g. due to rate limits, connectivity issues) or returns an empty/unparseable result, the system MUST automatically retry the scan against the next tier in the chain, stopping at the first tier that returns a parseable, non-empty result. `OCRConfig.provider` SHALL default to `"gemini-3.1-flash-lite"`. No local or non-Gemini OCR provider exists; if all tiers are exhausted without a usable result, the system SHALL persist the last error and return it to the caller without further fallback.

#### Scenario: Scan receipt succeeds on the first model tier
- **WHEN** the user uploads a receipt
- **THEN** the system sends the JPEG-converted image to `gemini-3.1-flash-lite`, parses the structured JSON response, and returns the fields without attempting any other tier.

#### Scenario: First model tier fails, second tier succeeds
- **WHEN** the user uploads a receipt and the call to `gemini-3.1-flash-lite` fails or returns an empty result
- **THEN** the system retries the scan against `gemini-3.5-flash`, and if that call succeeds, returns its parsed fields without attempting further tiers.

#### Scenario: All model tiers are exhausted
- **WHEN** the user uploads a receipt and calls to `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3-flash-preview`, and `gemini-2.5-flash` all fail or return empty results
- **THEN** the system persists the last tier's error to `geminiError`, returns a failure response, and the receipt is not autofilled — the user must enter the expense fields manually.

### Requirement: OCR Category Classification and Description Generation
The backend OCR system SHALL extract category information and a descriptive summary from the scanned receipt by querying active expense categories from the database and supplying them to the Gemini model prompt, instructing it to select the most appropriate category or return a default/fallback. The OCR response payload SHALL include `category_id` (representing the matched database category ID) and `description` (a concise summary of the receipt items or merchant). There is no non-Gemini classification path.

#### Scenario: Scan receipt classifies category and description via Gemini
- **WHEN** the user scans a receipt
- **THEN** the system matches the receipt items to the best-matching category ID from the database, generates a description, and returns them in the scan response, regardless of which model tier in the fallback chain ultimately succeeded.

## REMOVED Requirements

### Requirement: EasyOCR local fallback execution path
**Reason**: EasyOCR and its `ocr-sidecar` service are removed entirely (see `ocr-sidecar-service` capability removal); Gemini failures are now handled via an internal multi-tier model fallback instead of falling back to a local provider.
**Migration**: No action required by API consumers — `category_id`/`description` fields remain present in the response shape. Any deployment relying on the `easyocr` provider value or the `ocr-sidecar` service must switch to the Gemini-only configuration; `OCRConfig.provider` should be set to one of the supported Gemini model identifiers (defaults to `gemini-3.1-flash-lite`).
