# Admin Routes (`frontend/app/admin`)

## Overview
Intermediate route group under `/admin` organizing administrative configuration, directory/email/OCR integrations, receipt cleanup, and user management pages. This directory contains no direct route or source files; all functionality is exposed through its eight child route packages.

## Subdirectories & Boundaries
- `email`: [./email/README.md](./email/README.md) - SMTP notification configuration and test email delivery for moderators (`/admin/email`).
- `imap`: [./imap/README.md](./imap/README.md) - IMAP email ingestion configuration, connection testing, recovery retry, and delegation simulation for moderators (`/admin/imap`).
- `ldap`: [./ldap/README.md](./ldap/README.md) - LDAP/Active Directory authentication settings, role mappings, connection testing, and directory sync for moderators (`/admin/ldap`).
- `ocr`: [./ocr/README.md](./ocr/README.md) - OCR model settings and OCR-vs-final field comparison history for moderators (`/admin/ocr`).
- `receipts`: [./receipts/README.md](./receipts/README.md) - Orphaned receipt file scanner and cleanup confirmation workflow for moderators (`/admin/receipts`).
- `settings`: [./settings/README.md](./settings/README.md) - Server-prefetched mileage rates, daily allowances, FX margins/providers (for `chef_finance`), and mobile quick-add UI settings (for `mod`) (`/admin/settings`).
- `storage`: [./storage/README.md](./storage/README.md) - Receipt storage backend configuration (`local`, `smb`, `webdav`, `sftp`, `s3`), connectivity testing, and live migration tracking for moderators (`/admin/storage`).
- `users`: [./users/README.md](./users/README.md) - Server-prefetched user directory for privileged roles (`mod`, `manager`, `chef_finance`) and user creation, role assignment, and active-status management for moderators (`/admin/users`).
