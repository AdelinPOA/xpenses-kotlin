# Advance Payments Redesign — Design Spec

> Date: 2026-06-05
> Status: Draft

## Overview

Redesign the advance payments feature from a simple inline record to a full request-and-pay workflow with dedicated UI pages. Technicians can record self-paid advances or request advances from the company. Managers approve requests by setting the final amount and marking them paid.

## Requirements Summary

- **Two advance types**: self-paid (technician records directly as paid) and requested (technician suggests amount, manager decides final amount and pays)
- **Advance states**: `paid`, `requested`, `rejected`
- **Dedicated report-scoped page** at `/reports/[id]/advances` — replaces the current inline advances UI
- **Global manager page** at `/advances` — all pending requests across users/reports
- **Managers can add paid advances** to any user's report directly
- **Advances always belong to a report** (not standalone)
- **Only `paid` advances** count toward `total_advances` and `total_reimbursable`

## 1. Database Schema

### Changes to `advance_payments` table

Add columns via `ALTER TABLE ADD COLUMN` with existence checks (same migration pattern as the rest of the codebase):

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `status` | `TEXT` | `'paid'` | `paid`, `requested`, `rejected` |
| `requested_amount` | `DOUBLE PRECISION` | `NULL` | Amount the technician asked for (null for self-paid) |
| `requested_currency` | `TEXT` | `NULL` | Currency of the request (null for self-paid) |
| `paid_by` | `INTEGER REFERENCES users(id)` | `NULL` | Manager who marked it paid (null for self-paid) |
| `paid_at` | `TIMESTAMPTZ` | `NULL` | When it was marked paid |
| `rejected_by` | `INTEGER REFERENCES users(id)` | `NULL` | Who rejected |
| `rejected_at` | `TIMESTAMPTZ` | `NULL` | When rejected |

Default `status='paid'` ensures backward compatibility — all existing rows become paid advances.

New index:
```sql
CREATE INDEX IF NOT EXISTS idx_advance_payments_status ON advance_payments(status);
```

### Key invariants

- Self-paid: `status='paid'`, `requested_amount=NULL`, `paid_by=NULL`, `amount_original` and `amount_eur` filled on creation
- Requested: `status='requested'`, `requested_amount` and `requested_currency` filled, `amount_original=0`, `amount_eur=0` until paid
- Paid (from request): manager sets `amount_original`, `currency_original`, `amount_eur`, `fx_rate`, `paid_by`, `paid_at`, `status='paid'`
- Rejected: `status='rejected'`, `rejected_by` and `rejected_at` filled

## 2. Backend API

### 2.1 Modified endpoints (`/api/reports/{report_id}/advances`)

**GET `/advances`**
- Add optional `?status=` query param to filter by status
- Response includes user display name for `paid_by` and `rejected_by` (join on users table)

**POST `/advances`**
- Add `type` field to request body: `"paid"` or `"request"`
- `type="paid"`: same as today — requires date, amount, currency. Status set to `paid`. Technician can add to own report (draft only). Manager can add to any report (any status).
- `type="request"`: requires amount, currency, description (optional). Status set to `requested`. `requested_amount` and `requested_currency` filled, `amount_original=0`, `amount_eur=0`. Technician can request on own report (any status — might need cash after submission).

**PATCH `/advances/{id}`**
- Only for `paid` self-paid advances on draft reports (unchanged behavior)
- `requested` advances cannot be patched — technician cancels and re-requests instead

**DELETE `/advances/{id}`**
- Owner can delete own `requested` advances (cancel the request)
- Owner or manager can delete `paid` advances on draft reports (unchanged behavior)
- `rejected` advances can be deleted by owner (cleanup)

### 2.2 New action endpoints

**POST `/api/reports/{report_id}/advances/{id}/pay`**
- Auth: `manager`, `chef_finance`
- Body: `{ amount: float, currency: str, date: str }`
- Sets `amount_original`, `currency_original`, `amount_eur` (via FX conversion), `fx_rate`, `paid_by`, `paid_at`, `status='paid'`
- Only works on `status='requested'` advances

**POST `/api/reports/{report_id}/advances/{id}/reject`**
- Auth: `manager`, `chef_finance`
- Body: `{ reason?: str }` (optional)
- Sets `rejected_by`, `rejected_at`, `status='rejected'`
- Only works on `status='requested'` advances

### 2.3 Global endpoint (new router or added to existing)

**GET `/api/advances/pending`**
- Auth: `manager`, `chef_finance`, `mod`
- Returns all `status='requested'` advances across all users/reports
- Response includes: advance fields + `user_display_name`, `report_id`, `report_title`
- Sorted by `created_at` ascending (oldest requests first)

### 2.4 Permission matrix

| Action | Technician (own report) | Manager/Chef Finance | Mod |
|--------|------------------------|---------------------|-----|
| Add self-paid advance | ✅ (draft only) | ✅ (any report, any status) | ✅ |
| Request advance | ✅ (any status) | N/A | N/A |
| Pay request | ❌ | ✅ | ❌ |
| Reject request | ❌ | ✅ | ❌ |
| Delete own request | ✅ | — | — |
| Delete paid advance | ✅ (draft only) | ✅ (draft only) | ✅ (draft only) |
| View global pending | ❌ | ✅ | ✅ |

### 2.5 Calculation changes

`_fetch_report()` in `reports.py` must filter to `status='paid'` when computing:
- `total_advances = sum(a["amount_eur"] for a in advances if a["status"] == "paid")`
- `total_reimbursable = total_expenses - total_advances`

The `advances` array in the report response still includes all advances (all statuses) for display purposes.

## 3. Frontend

### 3.1 Dedicated Advances Page (`/reports/[id]/advances`)

**Route**: `frontend/app/reports/[id]/advances/page.tsx`

**Header bar**:
- "← Back to report" link
- Report title + status badge

**Summary cards** (row of 2-3):
- "Total Paid" (green) — sum of paid advances in EUR
- "Pending Requests" (orange) — count + sum of requested amounts
- "Rejected" (red/gray) — count, only shown if any exist

**Action section** (role-dependent):

Technician (own report):
- Two buttons: "Add self-paid advance" | "Request advance"
- Self-paid form: date, amount, currency select, description → POST with `type="paid"`
- Request form: amount, currency select, description → POST with `type="request"`
- Self-paid form only visible when report is in `draft` status
- Request form visible regardless of report status

Manager/chef_finance (any report):
- One button: "Add paid advance"
- Form: date, amount, currency select, description → POST with `type="paid"`

**Advances table**:
- Columns: Status (badge), Date, Description, Requested, Paid (EUR), Paid By, Actions
- Status badges: `requested` (orange), `paid` (green), `rejected` (red)
- `requested` rows: requested amount shown, paid column shows "—", actions: "Pay"/"Reject" (managers) or "Cancel" (owner)
- `paid` rows: paid amount shown, `paid_by` name, delete button (draft reports only)
- `rejected` rows: greyed out styling, requested amount shown, no actions (or delete for cleanup)
- Sort order: requested first, then paid by date desc, then rejected

### 3.2 Global Advances Page (`/advances`)

**Route**: `frontend/app/advances/page.tsx`

Visible to `manager`, `chef_finance`, `mod` in sidebar.

**Header**: "Advance Requests"

**Filter pills**: Pending (default) | Paid | Rejected | All

**Table columns**: Technician, Report (linked to `/reports/[id]/advances`), Requested Amount, Currency, Description, Date Requested, Actions

**Actions for `requested` rows**:
- "Pay" button — expands row or opens inline form: final amount input, currency select, date input, confirm button
- "Reject" button — optional reason text input, confirm

**Sidebar entry**:
- "Advances" with wallet/banknote icon
- After "Approvals" in the sidebar nav
- Badge showing count of pending requests

### 3.3 Report Detail Page Changes (`/reports/[id]/page.tsx`)

- **Remove** the inline orange advance form section (lines 256-304)
- **Remove** the inline advances table section (lines 410-458)
- **Add** a "View Advances" link/button near the advances metric card
- Make the "Advances" metric card clickable → navigates to `/reports/[id]/advances`
- Keep "Advances" and "Reimbursable" metric cards with current styling

### 3.4 Types and Query Keys

**`lib/api.ts`** — Update `AdvancePayment` interface:
- Add: `status`, `requested_amount`, `requested_currency`, `paid_by`, `paid_at`, `rejected_by`, `rejected_at`

**`lib/queryKeys.ts`** — Add:
- `advanceKeys.pending` for the global pending endpoint

### 3.5 Sidebar (`components/layout/Sidebar.tsx`)

Add "Advances" entry for manager/chef_finance/mod roles, after "Approvals".

## 4. PDF Export

- No structural changes to the PDF layout
- Filter to only include `status='paid'` advances in the table and summary calculations
- Already uses `amount_eur` sums which will be correct

## 5. Tests

### Modified tests
- Update existing advance tests to account for `status` field
- `test_create_advance_eur` — verify `status='paid'` on self-paid creation
- `test_report_total_reimbursable_calculation` — verify only paid advances count

### New tests (~8)
- `test_request_advance` — technician requests, verify `status='requested'`, `requested_amount` set
- `test_manager_pays_request` — manager pays with final amount, verify `status='paid'`, `paid_by` set
- `test_manager_rejects_request` — verify `status='rejected'`, `rejected_by` set
- `test_manager_adds_paid_advance_to_other_report` — manager POSTs to another user's report
- `test_technician_cannot_pay_request` — 403
- `test_only_paid_advances_in_totals` — requested advances don't affect `total_advances`
- `test_global_pending_endpoint` — returns only `requested` advances, only for managers
- `test_technician_cancels_own_request` — DELETE on `requested` advance succeeds
- `test_request_advance_on_submitted_report` — allowed (technician might need cash mid-trip)

## 6. Files to Create
- `frontend/app/reports/[id]/advances/page.tsx` — dedicated advances page
- `frontend/app/advances/page.tsx` — global advances management page

## 7. Files to Modify
- `backend/xpenses/database.py` — new columns on `advance_payments` + index
- `backend/xpenses/models.py` — update advance models with new fields, add pay/reject request models
- `backend/xpenses/routers/advances.py` — new endpoints (pay, reject), modify create/delete logic
- `backend/xpenses/main.py` — register global advances router (if separate)
- `backend/xpenses/routers/reports.py` — filter `total_advances` to paid only
- `backend/xpenses/services/pdf_export.py` — filter advances to paid only
- `backend/tests/conftest.py` — update `create_advance` helper with type param
- `backend/tests/test_advances.py` — update existing + add new tests
- `frontend/lib/api.ts` — update `AdvancePayment` interface
- `frontend/lib/queryKeys.ts` — add pending keys
- `frontend/app/reports/[id]/page.tsx` — remove inline advances, add link to dedicated page
- `frontend/components/layout/Sidebar.tsx` — add "Advances" entry for managers
