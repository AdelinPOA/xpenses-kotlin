## 1. Backend OCR Enhancement & Models

- [x] 1.1 Add `category_id` and `description` fields to `OCRScanResponse` in `backend/xpenses/models.py`.
- [x] 1.2 Update `scan_receipt` in `backend/xpenses/services/ocr_service.py` to fetch active categories and pass them to OCR providers.
- [x] 1.3 Update `GeminiOCRProvider` in `backend/xpenses/services/ocr_service.py` to request `category_id` and `description` fields using structured JSON prompts and schema configuration.
- [x] 1.4 Update `EasyOCRProvider` in `backend/xpenses/services/ocr_service.py` to perform case-insensitive keyword-based category matching and draft a basic description.

## 2. Frontend Drag-and-Drop UX & Form Autofill

- [x] 2.1 Update `OCRScanResult` interface in `frontend/lib/api.ts` to include optional `category_id` and `description` fields.
- [x] 2.2 Refactor `ExpenseForm.tsx` to handle drag-and-drop events (`onDragOver`, `onDragLeave`, `onDrop`) on the receipt upload box, updating its styles dynamically.
- [x] 2.3 Update `handleScan` in `ExpenseForm.tsx` to autofill `category_id` and `description` form fields upon receiving successful scan results.

## 3. Testing & Verification

- [x] 3.1 Update OCR tests in `backend/tests/test_ocr.py` and `backend/tests/test_ocr_settings.py` to mock and assert category and description extraction.
- [x] 3.2 Verify no regression by running the backend pytest suite (`make test-quick`).
