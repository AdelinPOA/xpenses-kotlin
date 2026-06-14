## ADDED Requirements

### Requirement: REST API Endpoints Parity
The Kotlin backend MUST implement all REST endpoints previously served by the FastAPI backend to ensure full compatibility with the Next.js frontend.

#### Scenario: Frontend fetches categories
- **WHEN** the frontend requests GET `/api/categories` with a valid session cookie
- **THEN** the Kotlin backend returns a JSON array of all active categories with their spending limits

### Requirement: JWT Authentication and Cookie Management
The Kotlin backend MUST manage user authentication using HTTP-only cookies containing JWT access tokens (15-minute expiry) and refresh tokens (7-day expiry).

#### Scenario: User logs in successfully
- **WHEN** a client submits valid credentials to POST `/api/auth/login`
- **THEN** the system sets `access_token` and `refresh_token` HTTP-only cookies and returns the user object

### Requirement: LDAP Active Directory Integration
The Kotlin backend MUST support Active Directory/LDAP authentication, configuration mapping, connection testing, and user synchronization.

#### Scenario: Moderator triggers LDAP user sync
- **WHEN** an authenticated Moderator requests POST `/api/settings/ldap/sync`
- **THEN** the system contacts the LDAP directory, updates local users, deactivates directory-absent users, and revokes their refresh tokens

### Requirement: Report State Machine Workflow
The Kotlin backend MUST enforce the expense report state machine transitions: `draft → submitted → approved → paid`, with recall (back to draft) and rejection (detaching expenses back to draft).

#### Scenario: Submitting a report
- **WHEN** an employee submits a draft report via POST `/api/reports/{id}/submit`
- **THEN** the report status and all its associated expenses transition to `submitted`

### Requirement: OCR Receipt Scanning and Categorization
The Kotlin backend MUST process receipt uploads and extract key parameters (merchant, amount, date) using a hybrid OCR system (local EasyOCR and Google Gemini 2.5 Flash API) and predict the category using a Naive Bayes classifier.

#### Scenario: Uploading a receipt for scanning
- **WHEN** a user uploads a receipt file to POST `/api/expenses/scan`
- **THEN** the backend processes the receipt and returns a structured JSON containing the parsed merchant, amount, tax, currency, and predicted category ID

### Requirement: Mileage tracking and Rates Management
The Kotlin backend MUST record mileage log entries and calculate reimbursement amounts using CFO-editable rates stored in the database.

#### Scenario: Calculating mileage reimbursement
- **WHEN** a user submits a mileage record with distance and driving times
- **THEN** the system calculates the reimbursement using the active mileage rates and saves the record

### Requirement: PDF Export with Appended Receipts
The Kotlin backend MUST generate Zoho-style report PDFs with company branding, FX rates, currency summaries, digital signature stamps, and append all receipt files (images or PDFs).

#### Scenario: Exporting a report to PDF
- **WHEN** a user requests GET `/api/reports/{id}/pdf`
- **THEN** the system generates a formatted PDF containing the report details and appended receipts

### Requirement: GraalVM AOT Compilation
The Kotlin backend MUST compile into a standalone native executable using GraalVM Native Image, running in a minimal Alpine Linux container.

#### Scenario: Container startup in production
- **WHEN** the docker container starts the native binary
- **THEN** the Spring Boot application boots and becomes healthy in less than 1.0 second
