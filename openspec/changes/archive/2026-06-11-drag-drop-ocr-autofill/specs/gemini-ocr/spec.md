## ADDED Requirements

### Requirement: OCR Category Classification and Description Generation
The backend OCR system SHALL extract category information and a descriptive summary from the scanned receipt:
- If the Gemini provider is selected, the system SHALL query active expense categories from the database and supply them to the Gemini model prompt, instructing it to select the most appropriate category or return a default/fallback.
- If the EasyOCR fallback is active, the system SHALL search the recognized text for category names/keywords to select a category.
- The OCR response payload SHALL include `category_id` (representing the matched database category ID) and `description` (a concise summary of the receipt items or merchant).

#### Scenario: Scan receipt classifies category and description via Gemini
- **WHEN** the user scans a receipt using the Gemini provider
- **THEN** the system matches the receipt items to the best-matching category ID from the database, generates a description, and returns them in the scan response.

#### Scenario: Scan receipt falls back to keyword-based category matching
- **WHEN** the user scans a receipt using the EasyOCR provider
- **THEN** the system searches the raw text for category keywords, assigns the matched category ID, generates a description, and returns them in the response.

### Requirement: Frontend Drag-and-Drop Receipt Area
The frontend expense edit and creation drawer SHALL feature a drag-and-drop zone for receipt images and PDF documents.
- The zone SHALL highlight visually when a user drags a file over it.
- Releasing the file in the zone SHALL trigger the upload and scan sequence automatically.

#### Scenario: User drags and drops receipt to upload
- **WHEN** the user drags a receipt PNG file over the upload area in the expense drawer and drops it
- **THEN** the area displays an active upload state, sends the file to the OCR scan endpoint, and runs the scan.

### Requirement: Frontend Receipt Autofill Integration
Upon receiving successful OCR scan results, the frontend SHALL automatically populate the expense form fields:
- The fields `amount`, `currency`, `date`, `merchant`, `tax_amount`, `tax_rate`, `category_id`, and `description` SHALL be autofilled with the extracted values.
- Form validation states and dirty indicators SHALL be updated so the user can save the expense.

#### Scenario: OCR completes and populates form fields
- **WHEN** the receipt OCR scan finishes successfully
- **THEN** the frontend populates the category select, description input, and all other fields in the expense drawer with the scanned values.
