## Why

Creating and updating expenses manually is tedious. Currently, uploading receipts requires clicking a file selector, and even after OCR, the user must manually select a category and type a description. Introducing drag-and-drop uploads and extending OCR to autofill the category (via LLM intelligence/heuristics) and description will streamline the workflow and reduce user effort.

## What Changes

- **Drag-and-Drop Receipt Area**: The receipt upload area in the expense edit/creation drawer will support dragging and dropping image/PDF files, with active drag-state visual feedback.
- **Backend OCR Category & Description Extraction**:
  - Update OCR scanning to extract or generate a category and a human-friendly description.
  - The Gemini provider will receive the list of available expense categories to select the best match.
  - The local EasyOCR fallback provider will use keyword matching on categories and receipt text to infer the category and use the merchant/items for a description.
- **Full Form Autofill**: When a receipt is successfully scanned, the frontend will automatically populate all form fields (merchant, amount, currency, date, tax_amount, tax_rate, category, and description).

## Capabilities

### New Capabilities

*(None)*

### Modified Capabilities

- `gemini-ocr`: Extend to cover drag-and-drop frontend upload, backend category selection from active categories, description generation, and complete form autofill.

## Impact

- **Backend APIs**:
  - `POST /api/ocr/scan` will accept an optional database connection or dynamically query the list of active categories to perform matching.
  - The returned scan object will include `category_id` (or name) and `description`.
- **Frontend Components**:
  - `ExpenseForm` / `EditExpenseDrawer` receipt upload element will be refactored to support Drag-and-Drop.
  - State management for the expense form will auto-populate and mark form fields as dirty/changed when OCR results are returned.
