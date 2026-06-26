# Proposal: Bulk Expense Upload via Drag-and-Drop

## Why

Creating expenses one-by-one is slow when returning from a trip with many receipts. Users must open a form, fill fields, attach one image at a time. Bulk drag-and-drop with automatic OCR extraction collapses N manual entries into a single gesture: drop all receipt photos at once, review the extracted data, confirm.

## What Changes

### New Capability — Bulk Upload Zone
- Drag-and-drop zone appears on the `/expenses` page (prominent area at top, activates as overlay on any drag-enter)
- Accepts multiple files simultaneously: JPG, PNG, WEBP, PDF (max 10 MB each, max 20 files per batch)
- Each file is uploaded and OCR-scanned on the server
- One draft expense is created per file automatically with OCR-extracted fields (merchant, amount, currency, date, category, description)
- Receipt image is attached to the expense immediately

### New Capability — Bulk Review Panel
- After processing, a review drawer/panel shows all created draft expenses
- User can edit any field inline before confirming
- User dismisses the panel; expenses are already saved as `draft` (no report assigned)
- Drafts appear in the main expense list where user can attach them to a report later

### New Backend Endpoint
- `POST /api/expenses/bulk-upload` — accepts `files[]`, runs OCR sync per file, creates draft expenses with receipts attached, returns list of `ExpenseOut`

### Modified Capabilities
- `/expenses` page gains `BulkUploadZone` component and `BulkReviewDrawer`
- `ExpensesClient.tsx` handles drag events at page level and triggers bulk flow

## Impact

- **Backend**: New endpoint in `ExpenseController`. Reuses existing `OcrService.scanReceipt()` and `StorageService`. No new DB migrations needed (expenses already support `draft` status and unattached receipts).
- **Frontend**: New `BulkUploadZone` and `BulkReviewDrawer` components. `ExpensesClient.tsx` wires drag events. TanStack Query cache invalidated after bulk save.
- **No breaking changes** to existing single-expense flow.
