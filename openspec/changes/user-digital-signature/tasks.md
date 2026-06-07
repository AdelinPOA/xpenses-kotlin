## 1. Database Schema

- [x] 1.1 Add `signature_path TEXT` column to `users` table in `backend/xpenses/database.py` CREATE_TABLES (and ALTER TABLE migration in `init_db()`)
- [x] 1.2 Add `signer_id INTEGER REFERENCES users(id)` and `signed_at TIMESTAMPTZ` columns to `expense_reports` table (CREATE_TABLES + ALTER TABLE migration)
- [x] 1.3 Create `/app/data/signatures/` directory in `init_db()` (alongside receipts_dir)
- [x] 1.4 Rebuild backend: `make rebuild`
- [x] 1.5 Verify columns exist: `docker exec xpenses-db psql -U xpenses -c "\d users"` and `"\d expense_reports"`

## 2. Backend Models

- [x] 2.1 Add `signature_path: str | None = None` to `UserOut` in `backend/xpenses/models.py`
- [x] 2.2 Add `signer_id: int | None = None` and `signed_at: datetime | None = None` to `ReportOut`

## 3. Signature API Router

- [x] 3.1 Create `backend/xpenses/routers/signature.py` with three endpoints:
  - `GET /api/users/me/signature` — return signature PNG (200) or 404
  - `PUT /api/users/me/signature` — accept PNG upload (base64 JSON body or multipart), save to `/app/data/signatures/{user_id}.png`, update `users.signature_path`
  - `DELETE /api/users/me/signature` — remove file, set `users.signature_path = NULL`, return 204
- [x] 3.2 Register router in `backend/xpenses/main.py`

## 4. Report Sign Endpoint

- [x] 4.1 Add `POST /api/reports/{id}/sign` to `backend/xpenses/routers/reports.py`:
  - Verify report owner (user_id == current_user.id)
  - Verify user has a signature_path (query users table)
  - Set `signer_id = current_user.id`, `signed_at = NOW()`
  - Return updated report
  - Return 400 if no signature saved, 403 if not owner

## 5. PDF Export

- [x] 5.1 Update `backend/xpenses/services/pdf_export.py` signature area:
  - Accept `signer: dict | None` parameter (user record of signer)
  - If signer has `signature_path` and file exists, render signature image (~40mm width) above signer name
  - Show signer display_name and signed_at date below signature
  - Fall back to current blank line if unsigned
- [x] 5.2 Update `export_report_pdf` in `reports.py` to fetch signer user record and pass to PDF generator

## 6. Backend Tests

- [x] 6.1 Create `backend/tests/test_signature.py`:
  - `test_put_signature` — upload PNG, verify 200, verify file created
  - `test_get_signature` — after upload, GET returns PNG
  - `test_get_signature_not_found` — GET without upload returns 404
  - `test_delete_signature` — after upload, DELETE returns 204, file removed
  - `test_sign_report` — create report, upload signature, sign report, verify signer_id/signed_at
  - `test_sign_report_no_signature` — try signing without saved signature, expect 400
  - `test_sign_report_not_owner` — try signing another user's report, expect 403
- [x] 6.2 Run tests: `make test` — all should pass

## 7. Frontend — Signature Pad Component

- [x] 7.1 Create `frontend/components/signature/SignaturePad.tsx`:
  - HTML5 Canvas with mouse/touch drawing (mousedown/mousemove/mouseup + touch events)
  - Smooth line rendering (lineCap: round, lineJoin: round, lineWidth: 2)
  - "Clear" button to reset canvas
  - "Save" button that calls `canvas.toDataURL('image/png')` and triggers onSave callback
  - Props: `onSave(dataUrl: string)`, `width?: number`, `height?: number`

## 8. Frontend — Profile Signature Page

- [x] 8.1 Create `frontend/app/profile/signature/page.tsx`:
  - Display current signature image if saved (GET `/api/users/me/signature`)
  - Show SignaturePad component for drawing
  - Save button sends base64 PNG to PUT `/api/users/me/signature`
  - Delete button calls DELETE
  - Success/error feedback messages
- [x] 8.2 Add "Signature" nav item to sidebar (`components/layout/Sidebar.tsx`) — visible to all roles, links to `/profile/signature`

## 9. Frontend — Report Sign Button

- [x] 9.1 Update `frontend/app/reports/[id]/page.tsx`:
  - Add "Sign Report" button (visible to report owner who has a signature)
  - Button calls POST `/api/reports/{id}/sign`
  - After signing, display signature image + signer name + signed_at timestamp
  - If user has no signature, show disabled button with tooltip linking to profile/signature
- [x] 9.2 Add `signature_path` to frontend `User` interface and `signer_id`/`signed_at` to `Report` interface in `frontend/lib/api.ts`

## 10. Commit + Verify

- [x] 10.1 Run `make lint-fix` then `make test` — all tests pass
- [x] 10.2 Test in browser: record signature → sign a report → export PDF → verify signature renders
- [x] 10.3 Commit and push
