# ocr-sidecar-service Specification

## Purpose
TBD - created by archiving change implement-ocr-sidecar. Update Purpose after archive.
## Requirements
### Requirement: Standalone OCR HTTP Service
The sidecar service SHALL run as a standalone Python-based HTTP service exposing a REST API.

#### Scenario: Running the OCR service
- **WHEN** the sidecar service container is started
- **THEN** it boots up a FastAPI application listening on an internal port (e.g. 5000) inside the Docker bridge network.

### Requirement: Preloaded OCR Models
The sidecar service SHALL initialize the EasyOCR reader (with `en` and `ro` languages) once during application startup and keep it loaded in memory.

#### Scenario: Startup initialization
- **WHEN** the sidecar service is initialized
- **THEN** it instantiates `easyocr.Reader` and loads the weights into memory before accepting scan requests, avoiding any load-on-request overhead.

### Requirement: Scan Image API Endpoint
The sidecar service SHALL expose a `POST /api/scan` endpoint accepting a multipart file upload. It SHALL process the uploaded image and return JSON containing the extracted text lines and mean confidence.

#### Scenario: Scanning a receipt image
- **WHEN** a client POSTs an image file to `/api/scan`
- **THEN** the sidecar executes OCR using the preloaded EasyOCR reader and returns `{"lines": ["...", "..."], "confidence": 0.95}`.

