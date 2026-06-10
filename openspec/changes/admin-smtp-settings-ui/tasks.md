## 1. Backend — Crypto Utility

- [x] 1.1 Extract Fernet key derivation from ldap_service.py into backend/xpenses/services/crypto.py
- [x] 1.2 Update ldap_service.py to import from crypto.py (no behavior change)

## 2. Backend — SMTP Config API

- [x] 2.1 Add DB-read helper get_smtp_config(db) to app_settings.py or new email_settings.py router
- [x] 2.2 Implement GET /api/settings/email (mod-only, returns all fields + password_set bool)
- [x] 2.3 Implement PATCH /api/settings/email (mod-only, encrypts password if provided)
- [x] 2.4 Implement POST /api/settings/email/test (mod-only, sends test email, returns {success, message})
- [x] 2.5 Register new router in backend/xpenses/main.py

## 3. Backend — email_service DB override

- [x] 3.1 Update send_email() to read live SMTP config from DB (with fallback to .env settings)

## 4. Backend — Tests

- [x] 4.1 Write tests for GET/PATCH /api/settings/email
- [x] 4.2 Write test for POST /api/settings/email/test (mock aiosmtplib)
- [x] 4.3 Run full test suite, confirm all pass

## 5. Frontend — SMTP Settings Page

- [x] 5.1 Add SmtpConfig types to frontend/lib/api.ts
- [x] 5.2 Create frontend/app/admin/email/page.tsx with form (Enabled, Host, Port, User, Pass, From)
- [x] 5.3 Add dirty-state warning banner (isDirty pattern from ldap page)
- [x] 5.4 Add "Send Test Email" section with to-address input and inline result
- [x] 5.5 Add password_set indicator in password field

## 6. Frontend — Sidebar

- [x] 6.1 Add Mail icon import to Sidebar.tsx
- [x] 6.2 Add { href: "/admin/email", label: "Email / SMTP", icon: Mail } to mod admin section

## 7. Finalize

- [x] 7.1 Update HANDOFF.md with this session's work
- [x] 7.2 git add, commit, push to GitHub
