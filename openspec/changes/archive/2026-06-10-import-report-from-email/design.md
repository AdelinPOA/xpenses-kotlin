## Context

Field technicians currently manually copy location, client, dates, and order descriptions from standard on-site delegation emails to create report drafts. This design outlines a background IMAP polling loop that processes incoming forwarded emails, parses the structured German email template using regex, matches the sender against active database users, and automatically inserts the report drafts.

## Goals / Non-Goals

**Goals:**
- Connect to a company mailbox over IMAP, search for unread emails, parse matching delegation patterns, and mark them as processed.
- Match sender `From` addresses to active `users` in the database to link created reports.
- Parse the start date, end date, customer, location, task type, and order number using robust regex.
- Encrypt stored IMAP credentials using Fernet encryption in the `app_settings` database.
- Create Moderator UI and settings endpoints to configure and test IMAP.

**Non-Goals:**
- Custom, unstructured manual emails.
- Support for attachments parsing.
- Automatic creation of expenses under the report.

## Decisions

### 1. Synchronous imaplib run in background thread
Python's standard library `imaplib` is synchronous. To avoid blocking the FastAPI main event loop during network requests, we will wrap the IMAP polling and parsing logic in `asyncio.to_thread`.

### 2. Lifespan Integration for background runner
We will spawn the IMAP background loop task in the FastAPI `lifespan` context manager. It will execute every 60 seconds, check if IMAP is enabled in the database, run the polling logic, and gracefully shut down when the application stops.

### 3. Regex-based parsing for standard German dispatch format
The email parser will use Python's `re` module to locate key German terms:
- `Starttermin` → Start date (converted from DD.MM.YYYY to YYYY-MM-DD)
- `Endtermin` → End date (converted from DD.MM.YYYY to YYYY-MM-DD)
- `Kundenauftrag` → Customer order ID
- `Kunde` → Customer name
- `TechnPlatz` → Technical location
- `Positionstyp` → Mechanical full installation / start-up task type

### 4. Encryption of IMAP Password
We will reuse the shared `crypto.py` Fernet key derivation helper with info `b"xpenses-imap-pw"` to encrypt the IMAP password in database storage, matching the patterns used for LDAP and SMTP.

## Risks / Trade-offs

- **IMAP Connection Errors block loop**: Connection errors will be captured, logged, and the background task will sleep and retry on the next interval without crashing the main FastAPI service.
- **Unauthorized Sender Email Spoofing**: Since the sender `From` header can technically be spoofed on internal SMTP relays, this is a minor risk. However, reports are created in `draft` state and must still be manually submitted and approved, mitigating unauthorized expense submittals.
- **Incorrect Date Formats**: Standard regex expects `DD.MM.YYYY`. If the format changes, parsing will fail silently, logging a parsing warning, and skipping report creation.

## Local Testing Strategy

- **Mocked Parser Tests**: Unit tests in `backend/tests/` will feed mock raw email texts to the parsing functions to verify extracted dates, client info, location, and description formats are 100% correct without external resources.
- **Mocked IMAP Connection Tests**: Test cases using mock `imaplib` connections will simulate folder checks and message retrieval to verify daemon loop logic.
- **E2E Local Verification**: The developer can configure a live test IMAP mailbox in the Moderator Settings UI on their local run. Forwarding a delegation email to that test address will trigger the local docker app to fetch, parse, and instantiate the draft report locally, proving end-to-end integration.
