# Tasks: Bulk Expense Upload

## 1. Backend — New Bulk Upload Endpoint

- [x] 1.1 Add `BulkUploadResult` and `BulkUploadError` data classes to `ExpenseController.kt`
- [x] 1.2 Implement `POST /api/expenses/bulk-upload` in `BulkExpenseController.kt`:
  - Validate max 20 files; return 400 if exceeded
  - Per-file: validate extension and size; add to `errors` list if invalid
  - Per-valid-file: call `ocrService.scanReceipt()`, map result → `ExpenseCreate`, call `expenseService.createExpense()`, store receipt via `storageService` + save `Receipt` entity
  - Return `BulkUploadResult(created, errors)`
- [x] 1.3 Handle OCR failure gracefully: catch exception per file, create expense with zero/blank fields, still attach receipt, add note to `description` ("OCR failed — please fill manually")

## 2. Frontend — Types & API

- [x] 2.1 Add `BulkUploadError` and `BulkUploadResult` interfaces to `frontend/lib/api.ts`
- [x] 2.2 Add `bulkUploadExpenses(files: File[])` function to `frontend/lib/api.ts`

## 3. Frontend — `BulkUploadZone` Component

- [x] 3.1 Create `frontend/components/expenses/BulkUploadZone.tsx`:
  - Accepts props: `isDragging: boolean`, `onFilesDropped: (files: File[]) => void`
  - Full-viewport overlay portal when `isDragging=true`
  - Drop handler: client-side file type validation, call `onFilesDropped`
  - Fallback "Upload receipts" button with hidden `<input type="file" multiple accept="image/*,.pdf">`
  - Visual: dashed border, upload icon, "Drop N receipt images to auto-create expenses"

## 4. Frontend — `BulkReviewDrawer` Component

- [x] 4.1 Create `frontend/components/expenses/BulkReviewDrawer.tsx`:
  - Props: `files: File[]`, `isOpen: boolean`, `onClose: () => void`
  - On open with files: call `bulkUploadExpenses(files)` via `useMutation`
  - Uploading state: progress indicator "Processing receipts…"
  - Review state: scrollable list of created expenses
- [x] 4.2 Create `BulkExpenseRow` inside drawer:
  - Shows: receipt image thumbnail (from first receipt URL), merchant input, date input, amount+currency inputs, category select (reuse existing categories query), description input
  - On field blur: `PATCH /api/expenses/{id}` to persist edit
  - Delete button: `DELETE /api/expenses/{id}`, remove row from list
- [x] 4.3 Footer: "Done reviewing" button — calls `onClose`, invalidates `expenseKeys.all`
- [x] 4.4 Show `errors[]` from bulk result (files that failed validation) as dismissible warning banner at top of drawer

## 5. Frontend — Wire into `ExpensesClient.tsx`

- [x] 5.1 Add page-level drag event handlers (`onDragEnter`, `onDragLeave`, `onDragOver`, `onDrop`) to the outer wrapper div
- [x] 5.2 Add `isDragging` and `showBulkDrawer` state; pass to `BulkUploadZone` and `BulkReviewDrawer`
- [x] 5.3 Render `<BulkUploadZone>` and `<BulkReviewDrawer>` in `ExpensesClient.tsx`
- [x] 5.4 Add persistent "Upload receipts" shortcut button in the expenses page header (next to "New expense" button)

## 6. Deploy & Verify on Server

- [x] 6.1 On server: `git pull origin feat/bulk-expense-upload`
- [x] 6.2 Rebuild and restart: `docker compose build --no-cache backend && docker compose up -d backend`
- [x] 6.3 Smoke test: POST to `/api/expenses/bulk-upload` with logo.png → `created: 1, errors: 0`, draft expense with receipt attached
- [x] 6.4 Root cause fixed: Spring Boot 3 AOT bug with @PostMapping literal paths on controllers with bare @PostMapping; moved to dedicated BulkExpenseController

## 7. Git

- [x] 7.1 Committed on branch `feat/bulk-expense-upload`
- [ ] 7.2 Push and open PR → merge to `main`
- [ ] 7.3 Update `HANDOFF.md`
