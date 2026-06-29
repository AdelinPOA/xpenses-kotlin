## 1. Database

- [x] 1.1 Add Flyway migration `V25__drop_easyocr_columns.sql` dropping `easyocr_amount`, `easyocr_date`, `easyocr_merchant`, `easyocr_category_id`, `easyocr_error` from `ocr_comparisons`.
- [x] 1.2 Remove the 5 `easyocr*` fields from the `OcrComparison` entity in `Models.kt`.

## 2. Backend - Repository

- [x] 2.1 Remove `updateEasyOcrResult()` from `Repositories.kt`.
- [x] 2.2 Remove the `easyocrAmount IS NOT NULL` branch from `findBestCachedComparison()`'s JPQL `CASE` expression in `Repositories.kt`.

## 3. Backend - OcrService

- [x] 3.1 Change `OCRConfig.provider` default from `"easyocr"` to `"gemini-3.1-flash-lite"`.
- [x] 3.2 Implement the ordered model-tier fallback loop in `scanReceipt()`/`scanGemini()`: try `gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-2.5-flash`, stopping at the first parseable non-empty result.
- [x] 3.3 On exhaustion of all tiers, persist the last error to `geminiError` and return failure (no further fallback).
- [x] 3.4 Delete `scanEasyOcr()`, `runEasyOcrSidecar()`, `updateEasyOcrComparison()`.
- [x] 3.5 Remove the EasyOCR keyword-based category-matching branch; category classification always goes through the Gemini prompt path.
- [x] 3.6 Remove the `easyocr*` cache-lookup fallback field-selection logic (cached comparison reads of `easyocrAmount`/`easyocrDate`/`easyocrMerchant`/`easyocrCategoryId`/`easyocrError`).
- [x] 3.7 Remove the async background "run the other provider for comparison" logic.

## 4. Backend - OcrController

- [x] 4.1 Remove `easyocrAmtOk`, `easyocrDateOk`, `easyocrMerchantOk`, `easyocrCatOk`, `easyocrCount`, and their denominators from the accuracy stats calculation.
- [x] 4.2 Remove `easyocr_amount_accuracy`, `easyocr_date_accuracy`, `easyocr_merchant_accuracy`, `easyocr_category_accuracy` from the stats response map.
- [x] 4.3 Remove the 5 `easyocr_*` fields (and their `@JsonProperty` annotations) from `OcrComparisonRow`.

## 5. Backend - AsyncOcrService

- [x] 5.1 Confirm `AsyncOcrService.kt` only calls `ocrService.scanReceipt()` once per job with no second/comparison provider invocation; remove any such invocation if present.

## 6. Frontend

- [x] 6.1 Remove "EasyOCR (Local CPU - Default)" from the provider dropdown in `app/admin/ocr/page.tsx`.
- [x] 6.2 Remove the EasyOCR accuracy comparison panel (`OCR ENGINE ACCURACY COMPARISON` EasyOCR card) from `page.tsx`.
- [x] 6.3 Remove the EasyOCR column and EasyOCR-result fallback-rendering logic from the "Scan History & Comparisons" table in `page.tsx`.
- [x] 6.4 Remove `easyocr_amount_accuracy`/`easyocr_date_accuracy`/`easyocr_merchant_accuracy`/`easyocr_category_accuracy` and the 5 `easyocr_*` `OCRComparisonRow` fields from `lib/api.ts`.

## 7. Infra

- [x] 7.1 Delete the `ocr-sidecar/` directory entirely (`app.py`, `Dockerfile`, `requirements.txt`).
- [x] 7.2 Remove the `ocr-sidecar` service block, the backend's `depends_on: ocr-sidecar` entry, and the `ocr-models` named volume from `docker-compose.yml`.

## 8. Tests

- [x] 8.1 Remove EasyOCR config mocks and test data from `OcrServiceTest.kt`.
- [x] 8.2 Add a test covering the Gemini model-tier fallback chain (e.g. `gemini-3.1-flash-lite` fails → `gemini-3.5-flash` succeeds).
- [x] 8.3 Add a test covering total exhaustion of all 4 tiers persisting `geminiError` and returning failure.

## 9. Documentation

- [x] 9.1 Update CLAUDE.md's OcrService description to remove EasyOCR/subprocess references and describe the Gemini-only multi-tier architecture.
- [x] 9.2 Update README.md, AGENTS.md, GEMINI.md, HANDOFF.md to remove EasyOCR/sidecar architecture references.

## 10. Verification

- [x] 10.1 Run `make build` (Kotlin compiles cleanly).
- [x] 10.2 Run `make test` (full JUnit/Testcontainers suite passes).
- [x] 10.3 Run `make test-health` against the running stack.
- [ ] 10.4 Manually verify `/admin/ocr` page loads with no EasyOCR references and a receipt scan succeeds end-to-end via Gemini. (API-level checks passed via curl: `/api/ocr/comparison` returns gemini-only fields; automated browser check hit a connectivity error reaching the live site from this environment — needs a human visual pass.)
