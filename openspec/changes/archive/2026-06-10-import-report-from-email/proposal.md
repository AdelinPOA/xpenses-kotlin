## Why

Field technicians receive standard on-site delegation job confirmation emails. Manually copying the start/end dates, location, client information, and order ID to create a draft expense report is time-consuming and error-prone. Allowing technicians to forward these emails to a dedicated company mailbox to automatically generate draft expense reports reduces friction and ensures accurate date-ranges.

## What Changes

- Add a background IMAP polling service to check a dedicated email inbox for forwarded delegation emails.
- Add email parser logic that matches the sender's email address to an active system user and processes the structured email body to extract:
  - Start date (`Starttermin`)
  - End date (`Endtermin`)
  - Location/Technical Site (`TechnPlatz`)
  - Customer (`Kunde`)
  - Task (`Positionstyp`)
  - Order ID (`Kundenauftrag`)
- Create draft expense reports automatically for the matched user using the parsed dates and description detail.
- Expose Moderator endpoints `/api/settings/imap` to configure IMAP credentials (host, port, username, password, enabled).
- Add Moderator UI at `/admin/imap` (similar to LDAP and SMTP UI) to configure and test IMAP settings.

## Capabilities

### New Capabilities

- `email-report-import`: Standard parsing of job delegation emails, user matching by sender address, automated draft report creation, and IMAP configuration API/UI.

### Modified Capabilities

None.

## Impact

- **Database**: Add `imap_config` key in `app_settings` table for storing credentials (Fernet-encrypted).
- **Backend**: Add background job runner/loop for IMAP polling (lifespan startup/shutdown integration).
- **Frontend**: Add `/admin/imap` page for Moderator role and Sidebar link.
