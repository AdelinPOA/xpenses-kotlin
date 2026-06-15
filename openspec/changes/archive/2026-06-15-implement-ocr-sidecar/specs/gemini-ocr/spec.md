## MODIFIED Requirements

### Requirement: Factory-based OCR Parsing with Automatic Fallback
The system SHALL dynamically instantiate the selected OCR provider at runtime. If the provider is set to `"gemini"` and the API request fails (e.g., due to rate limits or connectivity issues), the system MUST automatically run the local `"easyocr"` provider as a fallback and append a warning to the response. The local `"easyocr"` provider SHALL execute scans by performing an HTTP request to the `ocr-sidecar` service.

#### Scenario: Scan receipt with Gemini successfully
- **WHEN** the user uploads a receipt when Gemini is the selected provider
- **THEN** the system sends the JPEG-converted image to the Gemini 2.5 Flash API, parses the structured JSON response, and returns the fields.

#### Scenario: Scan receipt with Gemini fails and falls back to EasyOCR
- **WHEN** the user uploads a receipt when Gemini is selected, but the API request raises an exception
- **THEN** the system executes the EasyOCR scan by sending a POST request containing the image file to the `ocr-sidecar` service, parses fields, and returns the results with a warning: `["Gemini OCR failed: <error>. Fell back to local EasyOCR."]`.
