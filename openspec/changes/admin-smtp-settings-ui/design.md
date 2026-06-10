## Context

SMTP is currently configured via `.env` file on the server, requiring SSH access and a container restart to change. The email service exists and is wired to all lifecycle events, but `emails_enabled` defaults to `false`. The `app_settings` DB table already provides a runtime key/value store (used for mileage rates). Fernet encryption is already present in the codebase via `ldap_service.py`.

## Goals / Non-Goals

**Goals:**
- Let `mod` (Administrator) users read, update, and test SMTP configuration from the UI with no restart needed.
- Store SMTP password encrypted at rest in `app_settings` (never return plaintext).
- Provide a "Send Test Email" action with immediate feedback.
- Override the static `.env` values at runtime so email_service picks up DB config.

**Non-Goals:**
- Per-user email preferences or notification toggles.
- HTML email templates (plain-text only for now).
- Multiple SMTP profiles.

## Decisions

**1. Runtime settings override via DB lookup in `email_service.send_email`**
Rather than mutating `settings` object (thread-unsafe), `send_email` will call a helper that reads live SMTP config from DB if DB values are present, falling back to `.env` defaults. This keeps `config.py` clean and avoids global state mutation.

**2. Fernet key reuse from LDAP service**
`ldap_service.py` already derives a Fernet key from `settings.jwt_secret` via HKDF. We extract this into a shared `crypto.py` utility so both LDAP and SMTP can use the same key derivation without duplication.

**3. Password masking: `"********"` sentinel on GET**
The GET endpoint returns `password_set: bool` rather than the actual ciphertext. The frontend sends the existing password only when the user explicitly changes it (same `use_stored_password` pattern used by LDAP).

**4. New router `/api/settings/email` (mod-only)**
- `GET /api/settings/email` → current config (password masked)
- `PATCH /api/settings/email` → update any fields
- `POST /api/settings/email/test` → send test email to a given address, return `{success, message}`

**5. Frontend pattern matches `/admin/ldap`**
Same card layout, dirty-state warning banner, toast feedback. `isDirty` flag prevents accidental navigation. Test result panel shows inline success/error.

## Risks / Trade-offs

- **DB settings out of sync with `.env`**: If both are set, DB wins. This is documented behavior. → Mitigation: UI shows "DB config active" indicator.
- **Fernet key tied to `jwt_secret`**: Rotating JWT secret invalidates stored SMTP password. → Mitigation: on decryption error, treat as "not set" and show banner prompting re-entry.
- **Test email could be abused**: mod-only route, rate limiting not critical for internal tool. → Accept.

## Migration Plan

1. Deploy backend changes (new endpoints, `email_service` DB-read logic, crypto util).
2. Deploy frontend (new page, sidebar entry).
3. Admins configure SMTP from UI; `.env` SMTP vars become optional overrides.
4. Rollback: revert frontend deploy; backend endpoints are additive and safe to leave.
