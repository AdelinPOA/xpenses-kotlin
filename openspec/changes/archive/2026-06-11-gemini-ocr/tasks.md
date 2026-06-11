## 1. Backend Settings & Encryption Configuration

- [x] 1.1 Add OCR configuration endpoints (`GET /api/settings/ocr`, `PATCH /api/settings/ocr`, and `POST /api/settings/ocr/test`) in `backend/xpenses/routers/app_settings.py` (or a dedicated settings router), implementing Fernet key encryption/masking and live API connection testing.

## 2. Refactor OCR Service & Implement Providers

- [x] 2.1 Refactor `backend/xpenses/services/ocr_service.py` to use a strategy pattern, defining `BaseOCRProvider`, `EasyOCRProvider`, and `GeminiOCRProvider`.
- [x] 2.2 Implement Gemini 2.5 Flash HTTP integration via `httpx` inside `GeminiOCRProvider` using Google's structured JSON output schema parameters.
- [x] 2.3 Implement the automatic fallback to EasyOCR with warning reporting when Gemini fails.

## 3. Frontend UI Settings & Integration

- [x] 3.1 Define API client types and mutation hooks for OCR settings in `frontend/lib/api.ts` and query keys in `frontend/lib/queryKeys.ts`.
- [x] 3.2 Create the OCR settings page `/admin/ocr` in the Next.js frontend at `frontend/app/admin/ocr/page.tsx` with enabling toggle, provider selection, masked inputs, and a live connection test button.
- [x] 3.3 Add the "OCR Scanner" navigation link in `frontend/components/layout/Sidebar.tsx` visible to moderators under the Admin section.

## 4. Testing & Verification

- [x] 4.1 Write integration tests in `backend/tests/test_ocr_settings.py` verifying the config endpoints, API key encryption, mock API connection test, and automatic fallback behavior.
- [x] 4.2 Run the backend test suite (`make test`) and verify 100% success.
- [x] 4.3 Validate frontend compilation using `npx tsc --noEmit` in `frontend` to ensure no TypeScript errors.
