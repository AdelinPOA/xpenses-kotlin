## Why

The current OCR scanning system invokes EasyOCR by spawning a Python subprocess that points to a hardcoded host virtual environment path. This setup causes significant latency (5–15 seconds per scan) since PyTorch and EasyOCR models must be loaded from disk on every invocation. Additionally, it binds the Kotlin container's runtime to a specific developer directory structure, hindering production deployment.

## What Changes

- Create a dedicated Python-based OCR sidecar service (`ocr-sidecar`) using FastAPI, pre-loading EasyOCR into memory at startup.
- Update `docker-compose.yml` to include the `ocr-sidecar` container running on a dedicated port.
- Modify the Kotlin backend's `OcrService.kt` to perform HTTP calls to the new sidecar over the Docker bridge network instead of using `ProcessBuilder` subprocess spawning.
- Eliminate the hardcoded python venv execution paths in the Kotlin codebase.
- Maintain full compatibility with the existing OCR accuracy comparison dashboards and Naive Bayes category classifier.

## Capabilities

### New Capabilities
- `ocr-sidecar-service`: Exposes an internal HTTP service to run CPU-bound EasyOCR scans with memory-persisted models.

### Modified Capabilities
- `gemini-ocr`: Updates backend OCR pipeline to offload to the HTTP sidecar rather than using local subprocesses.

## Impact

- `docker-compose.yml`: New container service definition.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`: Rewrite subprocess spawning logic to use REST HTTP calls.
- `backend-kotlin-jpa/src/main/resources/easyocr_scan.py` and venv: Remove direct file system/process dependencies from the JVM container.
- CPU/Memory profile: Memory will increase slightly to keep EasyOCR models warm in the sidecar, but scan latency will be dramatically reduced.
