## 1. Python OCR Sidecar Setup

- [x] 1.1 Create directory `ocr-sidecar/` in the root workspace.
- [x] 1.2 Create `ocr-sidecar/requirements.txt` specifying `fastapi`, `uvicorn`, `easyocr`, `python-multipart`, and dependency packages.
- [x] 1.3 Create `ocr-sidecar/app.py` implementing the FastAPI application, preloading the EasyOCR reader at startup, and exposing a `POST /api/scan` endpoint.
- [x] 1.4 Create `ocr-sidecar/Dockerfile` utilizing a suitable Python image with PyTorch and EasyOCR libraries.

## 2. Docker Compose Integration

- [x] 2.1 Add the `ocr-sidecar` service definition to `docker-compose.yml`.
- [x] 2.2 Configure the OCR sidecar container with volume mounts for model caching (mapping `ocr-models:/root/.EasyOCR`).
- [x] 2.3 Ensure the Kotlin `backend` service depends on `ocr-sidecar` and runs in the same network.

## 3. Kotlin Backend Integration

- [x] 3.1 Update `OcrService.kt` to perform HTTP POST request to the new sidecar `http://ocr-sidecar:5000/api/scan` instead of running `runEasyOcrSubprocess`.
- [x] 3.2 Implement clean error handling and fallback warnings if the sidecar connection times out or fails.
- [x] 3.3 Remove the hardcoded Python interpreter path and subprocess invocation config from `OcrService.kt`.

## 4. Verification and Cleanup

- [x] 4.1 Delete the legacy `easyocr_scan.py` script located in `backend-kotlin-jpa/src/main/resources/`.
- [x] 4.2 Start up the updated docker compose stack with `docker compose up -d --build`.
- [x] 4.3 Test the integration by uploading a receipt and verifying that EasyOCR results are fetched and processed successfully within 1–2 seconds.
