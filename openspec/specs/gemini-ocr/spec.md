# gemini-ocr Specification

## Purpose
TBD - created by archiving change gemini-ocr. Update Purpose after archive.
## Requirements
### Requirement: DB-Authoritative OCR Configuration Settings
The system SHALL expose API endpoints for managing the OCR configuration, restricted to users with the `mod` role:
- `GET /api/settings/ocr`: Returns the current config, masking `gemini_api_key` as `••••••••` if it is set.
- `PATCH /api/settings/ocr`: Updates config, encrypting the API key using Fernet encryption.
- `POST /api/settings/ocr/test`: Tests a provided API key (or the stored key if masked) by checking connectivity against Google's API.

#### Scenario: Moderator retrieves OCR settings
- **WHEN** the moderator requests `GET /api/settings/ocr`
- **THEN** the system returns a 200 OK response with the provider, enabled status, and the API key masked as `••••••••` if it exists in the database.

#### Scenario: Moderator saves OCR settings
- **WHEN** the moderator submits a patch request to `/api/settings/ocr` with a new `gemini_api_key`
- **THEN** the system encrypts the API key with Fernet and saves it to the `app_settings` table.

#### Scenario: Moderator tests Gemini API key connectivity
- **WHEN** the moderator requests `POST /api/settings/ocr/test` with a valid Gemini API key
- **THEN** the backend makes a successful mock connectivity call to Google's API and returns `{"success": true, "message": "Connection successful!"}`.

### Requirement: Factory-based OCR Parsing with Automatic Fallback
The system SHALL dynamically instantiate the selected OCR provider at runtime. If the provider is set to `"gemini"` and the API request fails (e.g., due to rate limits or connectivity issues), the system MUST automatically run the local `"easyocr"` provider as a fallback and append a warning to the response.

#### Scenario: Scan receipt with Gemini successfully
- **WHEN** the user uploads a receipt when Gemini is the selected provider
- **THEN** the system sends the JPEG-converted image to the Gemini 2.5 Flash API, parses the structured JSON response, and returns the fields.

#### Scenario: Scan receipt with Gemini fails and falls back to EasyOCR
- **WHEN** the user uploads a receipt when Gemini is selected, but the API request raises an exception
- **THEN** the system executes the local EasyOCR scan, parses fields, and returns the results with a warning: `["Gemini OCR failed: <error>. Fell back to local EasyOCR."]`.

### Requirement: Admin Settings UI for OCR Configuration
The Next.js frontend SHALL provide a dashboard view at `/admin/ocr` for configuring settings and testing the Gemini API.

#### Scenario: User navigates to OCR settings page
- **WHEN** a moderator clicks the "OCR Scanner" sidebar link
- **THEN** the browser opens `/admin/ocr` showing the toggle, select box, masked password key input, and test connection button.

