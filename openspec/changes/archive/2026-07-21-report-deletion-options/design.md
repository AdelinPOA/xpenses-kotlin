# Design Document: Report Deletion Options

## 1. Backend API Change
`DELETE /api/reports/{reportId}?delete_expenses=true|false`

### Behavior
- If `delete_expenses == true`:
  - Soft-delete attached `expenses` (`deleted = true`, `deleted_at = now`).
  - Soft-delete attached `advances` and `mileage_records`.
  - Soft-delete `expense_report`.
- If `delete_expenses == false` (default):
  - Detach all expenses (`expense.report = null`, `expense.status = "draft"`).
  - Soft-delete `expense_report`.

## 2. Frontend UI Change
In `frontend/app/reports/page.tsx` and `frontend/app/reports/[id]/page.tsx`:
- Update the delete report handler to render a confirmation modal.
- Modal options:
  - **"Păstrează cheltuielile ca draft neasociat"** (`delete_expenses=false`)
  - **"Șterge și cheltuielile din raport"** (`delete_expenses=true`)
  - **"Anulează"**
