# Technical Design: Gemini Multimodal OCR Integration

- **Date**: 2026-06-11
- **Status**: Approved
- **Author**: Antigravity AI

---

## Context

The current receipt scanning feature uses CPU-bound local `EasyOCR` coupled with regex-based heuristics to parse fields like merchant, amount, currency, tax, and date. While functional, this approach is brittle and struggles to parse receipts with diverse international formats, multiple languages, or complex layouts (e.g. invoices and tickets from around the world).

We will integrate the **Google Gemini 2.5 Flash API** using multimodal structured output. This provides highly accurate, zero-hardware parsing for worldwide receipts. We will implement this as a DB-authoritative admin setting with an automatic local fallback to EasyOCR if the API is unavailable or rate-limited.

---

## Goals / Non-Goals

### Goals
- Add an `ocr_config` entry to the `app_settings` database table to manage OCR configurations dynamically.
- Refactor the backend OCR service to use a Factory & Provider pattern, facilitating the addition of future engines (such as local Ollama models).
- Integrate Gemini 2.5 Flash API using pure HTTP (`httpx`) to send receipt images and request structured JSON output matching the target schema.
- Implement an automatic local CPU EasyOCR fallback if the Gemini API call fails, appending an error warning to the response.
- Create a Next.js admin page at `/admin/ocr` allowing moderators to toggle OCR, select active providers, input keys, and test the Gemini API connection.

### Non-Goals
- Adding new pip package dependencies (e.g., `google-generativeai` or `google-genai`). We will use the existing `httpx` client.
- Line-item categorizations or receipt split workflows (out of scope for this task).

---

## Decisions

### 1. Data Model & Configuration Settings
We will store a JSON configuration block under the `ocr_config` key in the `app_settings` database table:
```json
{
  "provider": "gemini", // "easyocr" | "gemini"
  "ocr_enabled": true,
  "gemini_api_key": "enc_fernet_ciphertext..." // encrypted using Fernet
}
```
- API keys will be Fernet-encrypted on save via `crypto.py` and masked as `••••••••` in GET API responses.
- If the configuration is missing from the database, it defaults to:
  - `provider`: `"easyocr"`
  - `ocr_enabled`: `settings.ocr_enabled`

### 2. Backend Strategy Pattern (Factory & Providers)
Refactor `backend/xpenses/services/ocr_service.py`:
- `BaseOCRProvider`: Base interface containing:
  ```python
  async def scan(self, file_bytes: bytes, filename: str) -> dict
  ```
- `EasyOCRProvider`: Implements current local EasyOCR extraction and regex parser.
- `GeminiOCRProvider`: 
  - Converts PDF/image files to standard JPEG bytes.
  - Sends a POST request to: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}`
  - Includes a schema structure constraint in the payload using `generationConfig.responseSchema` to guarantee structured JSON output.
  - Fallback logic: If the API call fails, the factory automatically triggers `EasyOCRProvider` and appends a warning to the response: `"Gemini OCR failed: <error>. Fell back to local EasyOCR."`

### 3. API Settings Endpoints
Add route handlers in `backend/xpenses/routers/app_settings.py` (restricted to the `mod` role):
- `GET /api/settings/ocr`: Retrieves active configuration with masked API keys.
- `PATCH /api/settings/ocr`: Updates settings and encrypts any new key.
- `POST /api/settings/ocr/test`: Tests a given Gemini API key by making a simple metadata or model connectivity call.

### 4. Frontend Admin UI
Create `/admin/ocr` (`frontend/app/admin/ocr/page.tsx`):
- Switch/toggle for enabling/disabling OCR.
- Select dropdown for choosing active provider: `EasyOCR (Local CPU)` vs `Gemini 2.5 Flash (Cloud)`.
- Password-type API key input (rendered only when Gemini is selected).
- "Test Connection" button calling `/test` endpoint, rendering success/failure banners.
- Sidebar menu item "OCR Scanner" under Admin section in `Sidebar.tsx`.

---

## Risks / Trade-offs

- **[Risk]**: Gemini API key becomes invalid or hits rate limits (15 RPM free tier).
  - **[Mitigation]**: Seamless local EasyOCR fallback guarantees receipt scans always complete successfully, preserving app utility offline or under rate constraints.
