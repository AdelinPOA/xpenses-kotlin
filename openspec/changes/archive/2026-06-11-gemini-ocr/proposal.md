## Why

The current receipt scanning feature uses CPU-bound local `EasyOCR` coupled with regex-based heuristics to parse fields like merchant, amount, currency, tax, and date. While functional, this approach is brittle and struggles to parse receipts with diverse international formats, multiple languages, or complex layouts (e.g. invoices and tickets from around the world).

We will integrate the **Google Gemini 2.5 Flash API** using multimodal structured output. This provides highly accurate, zero-hardware parsing for worldwide receipts. We will implement this as a DB-authoritative admin setting with an automatic local fallback to EasyOCR if the API is unavailable or rate-limited.

## What Changes

- **Backend API**:
  - Add an `ocr_config` settings router and database table configuration to manage OCR provider selection and API credentials.
  - Expose `GET /api/settings/ocr`, `PATCH /api/settings/ocr`, and `POST /api/settings/ocr/test` endpoints.
  - Update `ocr_service.py` to use a Strategy/Provider pattern to route scans dynamically.
  - Implement the `GeminiOCRProvider` which queries the Gemini API with structured JSON output constraints.
  - Set up an automatic fallback to EasyOCR if the Gemini API call fails.
- **Frontend UI**:
  - Add a new Admin settings view at `/admin/ocr`.
  - Provide forms for toggling OCR, selecting the provider, entering the API key, and performing a live connection test.
  - Add the "OCR Scanner" link in the sidebar under the Admin section for moderators.

## Capabilities

### New Capabilities
- `gemini-ocr`: Enhance OCR accuracy by integrating Gemini 2.5 Flash API with local EasyOCR fallback.

### Modified Capabilities

## Impact

- **Backend**:
  - FastAPI routers (`ocr.py` updates, settings routers added).
  - OCR service (`ocr_service.py` refactored).
  - Integration tests for configuration and provider scanning logic.
- **Frontend**:
  - API client definitions (`lib/api.ts`).
  - Next.js pages and navigation sidebar updates.
