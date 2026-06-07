## Context

The app has a PDF export with a blank signature line (HR flowable + submitter name). Users must print-sign-scan to produce signed reports. The `users` table stores profile info but no signature. Reports track approval metadata (`approved_by`, `approved_at`) but not signing.

The frontend uses canvas-capable React 19. The backend stores files in `/app/data/` (Docker volume). Signature images are small PNGs (~5-20KB) that fit this existing storage pattern.

## Goals / Non-Goals

**Goals:**
- Let any user draw and save a reusable digital signature from the app
- Apply the saved signature to reports with one click
- Render the actual signature image in the PDF export
- Track who signed and when on each report

**Non-Goals:**
- Cryptographic digital signatures (PKI, certificates) — this is a visual signature only
- Multi-party signing workflows (only the submitter signs for now)
- Signature on individual expenses (only on reports)
- Wet-ink signature verification or fraud detection

## Decisions

### 1. Canvas-based drawing (no external dependency)

**Decision:** Use the HTML5 Canvas API directly in a React component.

**Alternatives considered:**
- `signature_pad` npm package — adds a dependency for something achievable in ~80 lines of canvas code
- SVG path recording — more complex serialization, no visual benefit

**Rationale:** The canvas approach is lightweight, produces PNG via `canvas.toDataURL()`, and avoids adding npm dependencies. The signature pad component is self-contained.

### 2. Store signature as PNG file on disk

**Decision:** Save the signature PNG to `/app/data/signatures/{user_id}.png`. Store the file path in `users.signature_path`.

**Alternatives considered:**
- Store as base64 in the database — bloats the users table, complicates queries
- Store in a separate `signatures` table — unnecessary indirection for a 1:1 relationship

**Rationale:** Follows the existing receipt storage pattern (`/app/data/receipts/`). One file per user, overwritten on re-record. The `signature_path` column on `users` is the simplest pointer.

### 3. Sign action on report

**Decision:** `POST /api/reports/{id}/sign` — sets `signer_id` and `signed_at` on the report. Only the report owner can sign. Report must be in `draft` or `submitted` status (signing locks it for submission).

**Alternatives considered:**
- Sign embedded in submit — too coupled; user may want to sign before submitting, or sign separately
- Separate signatures table per report — over-engineered for single-signer use case

**Rationale:** A dedicated sign endpoint is clean, auditable, and extensible if multi-party signing is needed later.

### 4. PDF rendering

**Decision:** In the signature area, if the report has `signer_id` and the signer has a `signature_path`, render the signature image (scaled to ~40mm width) above the signer's name. Otherwise, fall back to the current blank line.

### 5. Signature API design

**Decision:** Three endpoints on `/api/users/me/signature`:
- `GET` — returns the signature image (PNG) or 404
- `PUT` — upload/replace signature (accepts PNG data from canvas)
- `DELETE` — remove signature

Using `/me/` because users only manage their own signature.

## Risks / Trade-offs

- **[Visual-only signature]** → Not legally binding in most jurisdictions. Acceptable for internal expense workflows. If legal signatures needed later, can layer PKI on top.
- **[Single file overwrite]** → No signature history. If audit trail is needed, can add versioning later. Current requirement is just "re-record overwrites."
- **[Canvas cross-browser]** → Canvas `toDataURL('image/png')` is universally supported in modern browsers. No risk.
- **[File size]** → Signature PNGs are typically 5-20KB. No storage concern.
