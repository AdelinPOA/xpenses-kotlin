## Why

Expense reports currently have a blank signature line in the PDF export. Users must print, hand-sign, and re-scan to produce a signed document. Adding digital signature capture lets users draw and save their signature once, then apply it to reports with a single click — eliminating the print-sign-scan cycle and enabling fully digital approval workflows.

## What Changes

- Users can **record a digital signature** (canvas drawing) from their profile/account settings
- The signature image (PNG) is stored per user and persists across sessions
- Users can **re-record** their signature at any time (overwrite)
- When a report needs signing (submit, approve, or pay actions), a **"Sign" button** is available
- Clicking "Sign" embeds the user's saved signature into the report record
- The **PDF export** renders the actual signature image in the signature area instead of a blank line
- Reports track **who signed and when** (signer_id, signed_at timestamp)

## Capabilities

### New Capabilities
- `signature-capture`: Canvas-based signature drawing, saving to user account, and retrieval (frontend component + backend storage API)
- `report-signing`: Applying a saved signature to a report, tracking sign metadata, and rendering the signature in PDF export

### Modified Capabilities

_None — existing specs are not changing at the requirement level._

## Impact

- **Database**: New `signature_path` column on `users` table; new `signer_id` + `signed_at` columns on `expense_reports`
- **Backend API**: New endpoints for signature CRUD (`/api/users/me/signature`), report sign action (`/api/reports/{id}/sign`)
- **PDF export**: Signature area updated to render signature image when available
- **Frontend**: New signature pad component (canvas-based, no external dependency), profile settings section, "Sign" button on report detail
- **Storage**: Signature PNG files stored alongside receipts in the data volume
