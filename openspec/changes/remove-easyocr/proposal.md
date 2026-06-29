## Why

EasyOCR consistently underperforms Gemini on this receipt set (66.67% amount, 0% date/merchant, 33.33% category accuracy vs. Gemini's ~100% across the board per the admin OCR comparison dashboard) while adding a dedicated Python microservice (`ocr-sidecar`), a GPU/CPU model cache volume, and ~500 lines of dual-provider comparison plumbing to maintain. Removing it simplifies the architecture to a single cloud provider and frees up the operational overhead of running and updating the sidecar. To compensate for losing the local fallback safety net, Gemini OCR gains a multi-tier model fallback chain so a single model outage/rate-limit no longer means a total scan failure.

## What Changes

- **BREAKING**: Remove the `ocr-sidecar` microservice entirely (FastAPI + EasyOCR container, Dockerfile, requirements.txt, `ocr-models` volume, `depends_on` wiring in `docker-compose.yml`).
- **BREAKING**: Drop the `easyocr_amount`, `easyocr_date`, `easyocr_merchant`, `easyocr_category_id`, `easyocr_error` columns from `ocr_comparisons` via a new Flyway migration — historical EasyOCR comparison data is permanently deleted.
- Replace the existing Gemini-fails-then-EasyOCR-fallback logic with an ordered Gemini model-tier fallback: `gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-2.5-flash`, stopping at the first successful result.
- Change `OCRConfig.provider` default from `"easyocr"` to `"gemini-3.1-flash-lite"`.
- On exhaustion of all model tiers, persist the last error to `geminiError` and surface an OCR-failed state to the user (manual entry), with no further local fallback.
- Remove the EasyOCR option, accuracy comparison panel, and EasyOCR-vs-Gemini scan history columns from the `/admin/ocr` settings page.
- Remove EasyOCR-specific accuracy counters/fields from `OcrController`'s comparison stats endpoint and `OcrComparisonRow`.
- Update CLAUDE.md, README.md, AGENTS.md, GEMINI.md, HANDOFF.md to describe the Gemini-only multi-tier OCR architecture.

## Capabilities

### New Capabilities
(none — the model-tier fallback is a behavior change within the existing `gemini-ocr` capability, not a new capability)

### Modified Capabilities
- `gemini-ocr`: "Factory-based OCR Parsing with Automatic Fallback" changes from Gemini→EasyOCR fallback to a Gemini model-tier fallback chain (no local/EasyOCR provider remains); category classification's EasyOCR keyword-matching branch is removed since EasyOCR no longer exists; `OCRConfig.provider` default changes.
- `async-receipt-ocr`: "Poll failed job" scenario's failure cause changes from "sidecar/provider error" to "provider error (all Gemini model tiers exhausted)" — the sidecar no longer exists as a failure source.

### Removed Capabilities
- `ocr-sidecar-service`: the entire standalone EasyOCR HTTP sidecar capability is deleted — no replacement, functionality is dropped (Gemini-only going forward).

## Impact

- **Code**: `OcrService.kt`, `OcrController.kt`, `AsyncOcrService.kt`, `Repositories.kt`, `Models.kt` (backend); `app/admin/ocr/page.tsx`, `lib/api.ts` (frontend); `ocr-sidecar/` directory deleted entirely; `docker-compose.yml`.
- **Database**: new Flyway migration `V25__drop_easyocr_columns.sql`; irreversible loss of historical EasyOCR comparison data on existing rows.
- **Infra**: one fewer container/service to build, deploy, and keep healthy; smaller `docker-compose.yml` surface; `ocr-models` volume removed.
- **Tests**: `OcrServiceTest.kt` updated to drop EasyOCR fixtures and add model-fallback-chain coverage.
- **Docs**: CLAUDE.md, README.md, AGENTS.md, GEMINI.md, HANDOFF.md updated to reflect the new architecture.
