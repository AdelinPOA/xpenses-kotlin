## Why

Email notifications are fully wired into the report lifecycle (submit/approve/reject/pay), but SMTP configuration lives only in `.env` files on the server — meaning a moderator must have SSH access and restart the container to change it. The admin should be able to enable, configure, and test email delivery entirely from the UI.

## What Changes

- **New backend endpoints** under `/api/settings/email` (mod-only): GET config, PATCH config, POST test.
- **SMTP password** stored encrypted in `app_settings` (Fernet, same pattern as LDAP).
- **New frontend page** `/admin/email` for `mod` role: form for all SMTP fields, toggle to enable/disable, "Send Test Email" button with inline result feedback.
- **Sidebar** gains an "Email / SMTP" entry in the Admin section (mod only).
- Runtime settings override the static `.env` values so changes take effect immediately without restart.

## Capabilities

### New Capabilities
- `smtp-config-api`: Backend CRUD + test endpoints for SMTP settings, stored in `app_settings` DB table, mod-only access, password encrypted with Fernet.
- `smtp-settings-ui`: Frontend `/admin/email` page — form for SMTP host/port/user/pass/from/enabled, save, and send-test-email with live result.

### Modified Capabilities
- (none — no existing spec requirements change)

## Impact

- **Backend**: `app_settings.py` router extended; `config.py` gains a runtime-override helper; `email_service.py` reads live settings; Fernet key reused from LDAP service.
- **Frontend**: New page `frontend/app/admin/email/page.tsx`; `Sidebar.tsx` updated; `lib/api.ts` extended with SMTP types.
- **Dependencies**: `cryptography` already present (used by LDAP). No new deps.
- **Security**: Password never returned in plaintext from the API (masked `"********"` on GET).
