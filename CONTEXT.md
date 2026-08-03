# xpenses-kotlin: Domain Model & Glossary

This document serves as the authoritative domain model glossary for `xpenses-kotlin`.

## Core Financial Domains

### Expense & Report Lifecycle
- **Expense**: A single financial outlay containing amount, currency, merchant/category, receipt attachments, and status (`draft`, `submitted`, `approved`, `rejected`, `paid`).
- **Expense Report**: A collection of expenses submitted together by an employee for manager approval and finance payout.
- **Expense Report Lifecycle**: The domain flow governing how an Expense Report moves through `draft`, `submitted`, `approved`, `rejected`, and `paid`, including which Expense statuses mirror each transition.
- **Manager Review Workflow**: The set of manager-facing screens and actions used to inspect submitted Expense Reports, compare supporting context, and approve or reject them.
- **Review Queue**: The manager-facing list of submitted Expense Reports awaiting a decision, ordered and presented as actionable review work.
- **Rejection Reason**: Required manager-provided explanation recorded when an Expense Report is rejected.
- **Manager Work Hub**: The manager-facing dashboard experience focused on pending review work, recent activity, and navigation shortcuts rather than analytics KPIs.
- **Advance Payment**: An advance request or payment issued prior to expense submission.
- **Global Search**: Cross-application search that can return results from all major product areas, not only reports and expenses.

## Internationalization Domain

- **Locale**: UI language preference of a user (`en` | `ro`). Stored in `users.language`, mirrored to the `lang` cookie for the pre-auth window.
_Avoid_: language tag, culture, region.

- **Language Pack**: Complete message set for one locale, lives at `messages/{locale}.json` (e.g. `messages/en.json`). Uses nested namespaces mirroring the `app/` folder structure.
_Avoid_: translation file, resource bundle, locale file.

## Infrastructure & Storage Domain

### Storage Seams & Modules
- **Storage Provider**: Adapter satisfying file I/O operations at the storage seam (`upload`, `download`, `delete`, `testConnection`). Implementations include `LocalStorageProvider` and `S3StorageProvider`.
- **Storage Manager**: Deep module encapsulating file format security (magic-byte validation, size limits), path sanitization, credential encryption/decryption, and local caching. It exposes a generic `storeFile` interface.
- **RawUpload**: Pure domain data class containing file bytes, original filename, and content type. It decouples the storage seam from HTTP-specific types (like Spring's `MultipartFile`).
- **Storage Context**: An enum (`RECEIPT`, `SIGNATURE`) defining per-context file rules (allowed extensions, max size limit, magic-byte validation, path structure).
- **Storage Migration Engine**: Asynchronous engine executing file transfers between different storage providers using relative file paths.
- **OCR Service**: Service responsible for optical character recognition on receipt uploads. OCR rate-limiting and API budget queueing live inside `OcrService`.
- **OCR Scan Attempt**: A recorded user-initiated attempt to extract data from one receipt. It may reuse a cached provider result and can later be linked to the Expense created from that receipt.
- **OCR Result Cache**: An immutable, reusable provider result for a receipt identified by its content hash and versioned OCR execution identity (provider, model, and extraction-contract version). It exists to avoid repeated provider calls, is retained for 90 days after last use, is application-wide, and is not itself an audit record of a user scan.
