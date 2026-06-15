## Context

Currently, the Kotlin JVM backend spawns a Python subprocess to run EasyOCR. This requires the JVM container or host to run Python commands, uses a hardcoded venv user directory path, and loads EasyOCR/PyTorch models from scratch on every scan. Loading these models on demand introduces 5-15 seconds of latency per scan. 

## Goals / Non-Goals

**Goals:**
- Move local EasyOCR execution to a persistent Python HTTP daemon (a sidecar container).
- Load EasyOCR models into memory once at startup, keeping them warm for subsequent scan requests.
- Expose a simple `POST /api/scan` endpoint on the sidecar to run OCR.
- Modify the Kotlin backend's `OcrService` to send images to the sidecar over HTTP.
- Clean up hardcoded paths, python scripts, and dependencies from the backend Kotlin project directories.

**Non-Goals:**
- Modifying the text processing, parsing, or Naive Bayes classification algorithms (these will remain native Kotlin code in the JVM backend).
- Changing database schemas or OCR configuration tables.

## Decisions

### 1. Web Framework for Python Sidecar: FastAPI
- **Choice**: FastAPI running under Uvicorn.
- **Rationale**: Minimal memory footprint, high performance, automatic JSON serialization/deserialization, and standard toolset in the Python ecosystem.
- **Alternatives**: Flask (slightly more boilerplate, synchronous) or raw socket handlers.

### 2. File Transfer Method: Multipart Form-Data Upload
- **Choice**: Send the receipt image bytes as a multipart file upload (`multipart/form-data`) over HTTP.
- **Rationale**: Clean container decoupling. We avoid sharing temporary directories or volumes between the backend and sidecar, simplifying container isolation.

### 3. Persisted Model Directory
- **Choice**: Mount a shared/persistent volume to the sidecar container at `/root/.EasyOCR`.
- **Rationale**: EasyOCR caches downloaded model weights locally. Persisting this directory prevents the sidecar from re-downloading model files from the internet upon container restarts.

## Risks / Trade-offs

- **Memory Consumption**:
  - *Risk*: PyTorch and EasyOCR loaded in memory will consume ~200-400MB of RAM constantly.
  - *Mitigation*: Set a memory limit of `512Mi` on the sidecar container in `docker-compose.yml`. Limit worker processes to 1 since high concurrency isn't required for this internal tool.
- **Connection Failure**:
  - *Risk*: The Kotlin backend fails to reach the sidecar.
  - *Mitigation*: The Kotlin backend will handle connection timeouts gracefully and treat it as a scan failure with a warning, similar to Gemini connection fallbacks.
