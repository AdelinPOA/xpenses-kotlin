# Tasks: Bulk Expense Upload

## 1. Backend — New Bulk Upload Endpoint

- [ ] 1.1 Add `BulkUploadResult` and `BulkUploadError` data classes to `ExpenseController.kt`
- [ ] 1.2 Implement `POST /api/expenses/bulk-upload` in `ExpenseController.kt`:
  - Validate max 20 files; return 400 if exceeded
  - Per-file: validate extension and size; add to `errors` list if invalid
  - Per-valid-file: call `ocrService.scanReceipt()`, map result → `ExpenseCreate`, call `expenseService.createExpense()`, store receipt via `storageService` + save `Receipt` entity
  - Return `BulkUploadResult(created, errors)`
- [ ] 1.3 Handle OCR failure gracefully: catch exception per file, create expense with zero/blank fields, still attach receipt, add note to `description` ("OCR failed — please fill manually")

## 2. Frontend — Types & API

- [ ] 2.1 Add `BulkUploadError` and `BulkUploadResult` interfaces to `frontend/lib/api.ts`
- [ ] 2.2 Add `bulkUploadExpenses(files: File[])` function to `frontend/lib/api.ts`

## 3. Frontend — `BulkUploadZone` Component

- [ ] 3.1 Create `frontend/components/expenses/BulkUploadZone.tsx`:
  - Accepts props: `isDragging: boolean`, `onFilesDropped: (files: File[]) => void`
  - Full-viewport overlay portal when `isDragging=true`
  - Drop handler: client-side file type validation, call `onFilesDropped`
  - Fallback "Upload receipts" button with hidden `<input type="file" multiple accept="image/*,.pdf">`
  - Visual: dashed border, upload icon, "Drop N receipt images to auto-create expenses"

## 4. Frontend — `BulkReviewDrawer` Component

- [ ] 4.1 Create `frontend/components/expenses/BulkReviewDrawer.tsx`:
  - Props: `files: File[]`, `isOpen: boolean`, `onClose: () => void`
  - On open with files: call `bulkUploadExpenses(files)` via `useMutation`
  - Uploading state: progress indicator "Processing receipts…"
  - Review state: scrollable list of created expenses
- [ ] 4.2 Create `BulkExpenseRow` inside drawer:
  - Shows: receipt image thumbnail (from first receipt URL), merchant input, date input, amount+currency inputs, category select (reuse existing categories query), description input
  - On field blur: `PATCH /api/expenses/{id}` to persist edit
  - Delete button: `DELETE /api/expenses/{id}`, remove row from list
- [ ] 4.3 Footer: "Done reviewing" button — calls `onClose`, invalidates `expenseKeys.all`
- [ ] 4.4 Show `errors[]` from bulk result (files that failed validation) as dismissible warning banner at top of drawer

## 5. Frontend — Wire into `ExpensesClient.tsx`

- [ ] 5.1 Add page-level drag event handlers (`onDragEnter`, `onDragLeave`, `onDragOver`, `onDrop`) to the outer wrapper div
- [ ] 5.2 Add `isDragging` and `showBulkDrawer` state; pass to `BulkUploadZone` and `BulkReviewDrawer`
- [ ] 5.3 Render `<BulkUploadZone>` and `<BulkReviewDrawer>` in `ExpensesClient.tsx`
- [ ] 5.4 Add persistent "Upload receipts" shortcut button in the expenses page header (next to "New expense" button)

## 6. Deploy & Verify on Server

- [ ] 6.1 On server: `git pull origin main`
- [ ] 6.2 Rebuild and restart: `docker compose up -d --build backend frontend`
- [ ] 6.3 Smoke test: drag 2–3 receipt images onto `http://192.168.100.48:3001/expenses`, verify draft expenses created with OCR data
- [ ] 6.4 Verify error case: drag a `.txt` file, confirm it appears in the errors banner

## 7. Git

- [ ] 7.1 Commit on branch `feat/bulk-expense-upload`
- [ ] 7.2 Push and open PR → merge to `main`
- [ ] 7.3 Update `HANDOFF.md`
