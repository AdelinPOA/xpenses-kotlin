## 1. Backend — IMAP Configuration Service

- [ ] 1.1 Create imap_settings_service.py with imap config models and save/load DB helper
- [ ] 1.2 Implement Fernet decryption for IMAP password in imap_settings_service.py
- [ ] 1.3 Add test_imap_connection helper function using standard imaplib

## 2. Backend — Email Parser & Report Creator

- [ ] 2.1 Implement parse_delegation_email logic using Regex pattern extraction
- [ ] 2.2 Implement user sender matching and draft report generation in a service function
- [ ] 2.3 Write tests for the parser with various sample inputs

## 3. Backend — IMAP Polling Daemon

- [ ] 3.1 Implement background polling daemon function that runs imaplib in thread pool
- [ ] 3.2 Register daemon in lifespan start/stop logic of main.py

## 4. Backend — IMAP Settings API Router

- [ ] 4.1 Create backend/xpenses/routers/imap_settings.py with GET, PATCH, and POST /test routes
- [ ] 4.2 Register new router in main.py
- [ ] 4.3 Add backend integration tests for all settings endpoints

## 5. Frontend — IMAP UI Configuration

- [ ] 5.1 Add ImapConfig types to frontend/lib/api.ts
- [ ] 5.2 Create frontend/app/admin/imap/page.tsx with form and validation
- [ ] 5.3 Implement test connection action and result feedback
- [ ] 5.4 Add Sidebar navigation link for IMAP settings

## 6. Finalize

- [ ] 6.1 Update HANDOFF.md and push to GitHub
