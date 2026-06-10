## Why

Currently, configuration forms (LDAP, SMTP, IMAP) are implemented with manual input handlers and local error banner state variables. This makes forms error-prone, hard to validate consistently, and pushes user layouts around when banners appear. We need declarative schema validation (using Zod) and global non-intrusive toast notifications to improve UX/DX.

## What Changes

- Add Zod validation schema schemas for the LDAP, SMTP, and IMAP settings.
- Implement React Hook Form integration in the settings pages.
- Add a Toast Notification provider overlay to pop up status alerts.
- Replace local error alert containers in the forms with global toast popups.

## Capabilities

### New Capabilities
- `admin-forms-validation-toasts`: Introduce declarative Zod schemas, React Hook Form integrations, and global Toast notifications for all configuration screens.

### Modified Capabilities

## Impact

- **Frontend**:
  - Install dependencies: `react-hook-form`, `zod`, `@hookform/resolvers`, and a clean lightweight toast library or portal context.
  - Refactor `app/admin/email/page.tsx`, `app/admin/imap/page.tsx`, and `app/admin/ldap/page.tsx` to use React Hook Form + Zod resolvers.
