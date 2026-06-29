## REMOVED Requirements

### Requirement: Standalone OCR HTTP Service
**Reason**: EasyOCR consistently underperformed Gemini (66.67%/0%/0%/33.33% vs ~100% accuracy across amount/date/merchant/category) while requiring a dedicated Python microservice. Gemini now handles all OCR with an internal multi-tier model fallback chain, removing the need for a local fallback provider.
**Migration**: Delete the `ocr-sidecar/` directory, its Dockerfile/requirements.txt/app.py, and its service/volume/`depends_on` entries in `docker-compose.yml`. No replacement service exists.

### Requirement: Preloaded OCR Models
**Reason**: The EasyOCR reader and its model cache are no longer needed once the sidecar service is removed.
**Migration**: Remove the `ocr-models` Docker named volume and the `EASYOCR_DOWNLOAD_PATH` environment variable; no replacement caching mechanism is needed for the Gemini-only architecture.

### Requirement: Scan Image API Endpoint
**Reason**: The `POST /api/scan` sidecar endpoint is no longer called by the backend; all scanning now happens via the Gemini API directly from `OcrService`.
**Migration**: Remove `runEasyOcrSidecar()` and any other code in `OcrService.kt` that issues HTTP requests to the sidecar. No replacement endpoint is needed.
