# xpenses-kotlin: Domain Model & Glossary

This document serves as the authoritative domain model glossary for `xpenses-kotlin`.

## Core Financial Domains

### Expense & Report Lifecycle
- **Expense**: A single financial outlay containing amount, currency, merchant/category, receipt attachments, and status (`draft`, `submitted`, `approved`, `rejected`, `paid`).
- **Expense Report**: A collection of expenses submitted together by an employee for manager approval and finance payout.
- **Advance Payment**: An advance request or payment issued prior to expense submission.

## Infrastructure & Storage Domain

### Storage Seams & Modules
- **Storage Provider**: Adapter satisfying file I/O operations at the storage seam (`upload`, `download`, `delete`, `testConnection`). Implementations include `LocalStorageProvider` and `S3StorageProvider`.
- **Storage Manager**: Deep module encapsulating file format security (magic-byte validation), path sanitization, credential encryption/decryption, and local caching.
- **Storage Migration Engine**: Asynchronous engine executing file transfers between different storage providers using relative file paths.
