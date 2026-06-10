## 1. Frontend Library Installation & Context Setup

- [x] 1.1 Install frontend dependencies: `react-hook-form`, `zod`, `@hookform/resolvers`.
- [x] 1.2 Create custom `ToastContext` and `ToastProvider` wrapper to manage toast lists.
- [x] 1.3 Register `ToastProvider` inside `/app/layout.tsx`.

## 2. Declarative Form Validations

- [x] 2.1 Refactor SMTP configuration page (`/admin/email/page.tsx`) to use React Hook Form + Zod schema validation.
- [x] 2.2 Refactor IMAP configuration page (`/admin/imap/page.tsx`) to use React Hook Form + Zod schema validation.
- [x] 2.3 Refactor LDAP/AD configuration page (`/admin/ldap/page.tsx`) to use React Hook Form + Zod schema validation.

## 3. Toast integration

- [x] 3.1 Replace status alert headers with toast notification calls (`toast.success()`, `toast.error()`) across SMTP, IMAP, and LDAP forms.
- [x] 3.2 Verify all visual interactions and page-shifting constraints are resolved.
