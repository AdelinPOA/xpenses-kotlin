## Context

Currently, the user must click the upload area to choose files and manually specify both the category and description after an OCR scan completes. This design improves the UX by adding drag-and-drop file support and using Gemini/EasyOCR to dynamically classify the expense category and draft a description.

## Goals / Non-Goals

**Goals:**
- Implement visual drag-and-drop receipt upload area on `ExpenseForm`.
- Dynamic categories list retrieval in backend `scan_receipt` to supply active categories to OCR providers.
- LLM classification in `GeminiOCRProvider` utilizing the categories list.
- Simple keyword-based category matching in `EasyOCRProvider` (fallback).
- Auto-generation of receipt `description` (e.g. summarizing items or vendor details).
- Autofill category and description in the frontend Form.

**Non-Goals:**
- Modifying categories admin page.
- Adding multi-currency category limits evaluation during OCR (this is handled when saving).

## Decisions

1. **Backend Category Querying**:
   - The `scan_receipt` service will check if `db` is available.
   - It will run `SELECT id, name FROM categories WHERE is_active = true`.
   - The category list will be passed down to providers.

2. **Gemini LLM Prompt & Schema Integration**:
   - Add `category_id` (INTEGER) and `description` (STRING) to Gemini structured output schema.
   - Inject serialized category list (e.g. `1: Meals, 2: Travel`) into the Gemini text prompt.
   - Instruct Gemini to assign the best-matching `category_id` from the list, or `null` if none match, and draft a clear summary description.

3. **EasyOCR Fallback Matching**:
   - Normalize the full raw text from EasyOCR.
   - Perform case-insensitive substring checks against active category names.
   - If found, assign the category ID. Otherwise, default to `null`.
   - Set description to a simple default format like `"Receipt from {merchant}"`.

4. **Frontend Drag-and-Drop UX**:
   - Refactor `ExpenseForm.tsx` file upload button wrapper to handle `onDragOver`, `onDragLeave`, and `onDrop` events.
   - Provide visual highlights (dashed border changes color, overlay text) when a file is dragged over.
   - Update `handleScan` to accept a `File` parameter directly so it can handle both file selector clicks and drag-and-drop drops.
