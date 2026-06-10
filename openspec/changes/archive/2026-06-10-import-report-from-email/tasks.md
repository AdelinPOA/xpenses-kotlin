## 1. Backend — IMAP Configuration Service

- [x] 1.1 Create imap_settings_service.py with imap config models and save/load DB helper
- [x] 1.2 Implement Fernet decryption for IMAP password in imap_settings_service.py
- [x] 1.3 Add test_imap_connection helper function using standard imaplib

## 2. Backend — Email Parser & Report Creator

- [x] 2.1 Implement parse_delegation_email logic using Regex pattern extraction
- [x] 2.2 Implement user sender matching and draft report generation in a service function
- [x] 2.3 Write tests for the parser with various sample inputs

## 3. Backend — IMAP Polling Daemon

- [x] 3.1 Implement background polling daemon function that runs imaplib in thread pool
- [x] 3.2 Register daemon in lifespan start/stop logic of main.py

## 4. Backend — IMAP Settings API Router

- [x] 4.1 Create backend/xpenses/routers/imap_settings.py with GET, PATCH, and POST /test routes
- [x] 4.2 Register new router in main.py
- [x] 4.3 Add backend integration tests for all settings endpoints

## 5. Frontend — IMAP UI Configuration

- [x] 5.1 Add ImapConfig types to frontend/lib/api.ts
- [x] 5.2 Create frontend/app/admin/imap/page.tsx with form and validation
- [x] 5.3 Implement test connection action and result feedback
- [x] 5.4 Add Sidebar navigation link for IMAP settings

## 6. Finalize

- [x] 6.1 Update HANDOFF.md and push to GitHub
