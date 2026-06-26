# Design: Bulk Expense Upload

## Backend

### New Endpoint — `POST /api/expenses/bulk-upload`

**Location:** `ExpenseController.kt`

```kotlin
@PostMapping("/bulk-upload")
@Transactional
fun bulkUploadExpenses(
    @RequestParam("files") files: List<MultipartFile>,
    request: HttpServletRequest
): ResponseEntity<List<ExpenseOut>>
```

**Validation (per file, fail-fast per file, not whole batch):**
- Max 20 files per request (400 if exceeded)
- Each file: size ≤ 10 MB, extension in `{jpg, jpeg, png, webp, pdf}`
- Invalid files return a per-file error in the response; valid files still processed

**Processing loop per file:**
1. Call `ocrService.scanReceipt(file.bytes, filename)` — synchronous, reuses existing OCR pipeline (Gemini → EasyOCR fallback)
2. Map OCR result → `ExpenseCreate`:
   - `amount` = `ocrResult.amount ?: BigDecimal.ZERO`
   - `currency` = `ocrResult.currency ?: "EUR"`
   - `date` = `ocrResult.date ?: LocalDate.now().toString()`
   - `merchant` = `ocrResult.merchant`
   - `description` = `ocrResult.description`
   - `categoryId` = `ocrResult.categoryId`
   - `rawOcrText` = `ocrResult.rawText`
   - `reportId` = `null` (unattached draft)
3. Call `expenseService.createExpense(dto, currentUser)` → status defaults to `"draft"`
4. Save receipt file via `storageService.store(file.bytes, filename, expense.id!!)` 
5. Create `Receipt` entity, link to expense, save via `receiptRepository`

**Response:** `200 OK` with `BulkUploadResult`:
```kotlin
data class BulkUploadResult(
    @JsonProperty("created") val created: List<ExpenseOut>,
    @JsonProperty("errors") val errors: List<BulkUploadError>
)

data class BulkUploadError(
    @JsonProperty("filename") val filename: String,
    @JsonProperty("reason") val reason: String
)
```

**Error handling:** If OCR fails for a file, expense is still created with zeroed fields and `rawOcrText = null`. The file receipt is still attached. User reviews and fills in manually.

### No New Migrations
Expenses already have `status = "draft"` and receipts can be attached at creation. No schema changes.

---

## Frontend

### Component Tree

```
ExpensesClient.tsx          ← adds drag event handlers at page level
  └── BulkUploadZone        ← drag overlay (portal, full-viewport)
  └── BulkReviewDrawer      ← slide-in drawer showing created expenses
        └── BulkExpenseRow  ← inline-editable row per expense
```

### `BulkUploadZone` Component

`frontend/components/expenses/BulkUploadZone.tsx`

- Renders a full-viewport drop overlay when `isDragging=true`
- Shows file count badge as files are held over
- On drop: validates file types client-side, calls `onFilesDropped(files)`
- Also renders a persistent "Upload receipts" button as fallback (triggers file input)

### `BulkReviewDrawer` Component

`frontend/components/expenses/BulkReviewDrawer.tsx`

States: `idle → uploading (progress N/M) → reviewing → done`

- **Uploading state:** progress bar, "Processing receipt 3 of 7…"
- **Reviewing state:** list of created draft expenses
  - Each row shows: thumbnail, merchant, date, amount+currency, category dropdown, description field
  - All fields editable inline via `PATCH /api/expenses/{id}`
  - "Delete" button per row (calls `DELETE /api/expenses/{id}`)
- **Footer:** "Done reviewing" button — closes drawer, invalidates `expenseKeys.list()` cache

### `ExpensesClient.tsx` changes

```tsx
// Add to existing component:
const [isDragging, setIsDragging] = useState(false);
const [bulkFiles, setBulkFiles] = useState<File[]>([]);
const [showBulkDrawer, setShowBulkDrawer] = useState(false);

// Page-level drag handlers
onDragEnter → setIsDragging(true)
onDragLeave (check relatedTarget leaves viewport) → setIsDragging(false)
onDragOver → preventDefault
onDrop → setIsDragging(false), setBulkFiles(files), setShowBulkDrawer(true)
```

### API call

```ts
// lib/api.ts — new function
async function bulkUploadExpenses(files: File[]): Promise<BulkUploadResult> {
  const form = new FormData();
  files.forEach(f => form.append("files", f));
  return api.post("/expenses/bulk-upload", form).then(r => r.data);
}
```

### TanStack Query

`BulkReviewDrawer` uses `useMutation` for the upload. On success, calls:
```ts
queryClient.invalidateQueries({ queryKey: expenseKeys.all })
```

### New TypeScript types (`lib/api.ts`)

```ts
export interface BulkUploadError {
  filename: string;
  reason: string;
}

export interface BulkUploadResult {
  created: ExpenseOut[];
  errors: BulkUploadError[];
}
```

---

## UX Flow

```
User drags 5 receipt images onto /expenses page
  → Full-screen overlay appears: "Drop N files to create expenses"
  → User drops files
  → Drawer slides in: "Processing 1 of 5…" progress
  → After all done: drawer shows 5 editable rows
  → User fixes merchant name on row 3, deletes row 5 (duplicate)
  → Clicks "Done" → drawer closes → expense list refreshes → 4 new drafts visible
```

---

## Constraints & Edge Cases

| Case | Handling |
|---|---|
| OCR disabled in settings | Return 503 per-file error, expense still created with empty fields |
| File > 10 MB | Rejected client-side + backend validation, included in `errors[]` |
| More than 20 files | 400 from backend, client shows friendly message |
| OCR extracts no amount | Expense created with `amount=0`, user must fill in drawer |
| Duplicate file dropped | Each file treated independently, user deletes duplicate in drawer |
| Network failure mid-batch | Already-created expenses remain as drafts, user retries remaining |
