## Context

Currently, configuration input verification is implemented with manual React states which is verbose and prone to validation discrepancies. The local notification banners shift content layouts which disrupts UX.

## Goals / Non-Goals

**Goals:**
- Centralize validation logic for LDAP, SMTP, and IMAP settings.
- Implement React Hook Form to handle forms state and submission triggers.
- Integrate Zod schema validation rules for all fields.
- Deploy a global toast notification service.

**Non-Goals:**
- Rewriting report submission or OCR validation logic (only targeting Moderator settings configuration screens).

## Decisions

### 1. Verification Schemas
- **Choice**: Write Zod verification schemas for:
  - `smtpSchema`: Validates server host, port (1-65535), username/email, sender address, and optional password.
  - `imapSchema`: Validates server host, port, username, folder location, and optional password.
  - `ldapSchema`: Validates server host, port, bind dn, base dn, search queries, role entries array, and optional password.

### 2. Toast Notification Provider
- **Choice**: Implement a simple, custom Toast context wrapper (`ToastProvider`) around `/app/layout.tsx`, or use a lightweight React component portal.
- **Rationale**: Avoids adding heavy runtime bundles and matches the existing custom ThemeProvider/AuthProvider context architecture.
