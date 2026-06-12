# MinerU 2.5 — CPU-only API server
# Uses the "pipeline" backend (no GPU/CUDA required).
# Starts mineru-api on port 8000.
#
# Build: docker compose --profile mineru build mineru
# Run:   docker compose --profile mineru up mineru

FROM python:3.11-slim

# System dependencies for image/PDF processing
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxrender1 \
        libxext6 \
        libgomp1 \
        poppler-utils \
        fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir uv

# Install MinerU with all extras (pipeline + api server)
RUN uv pip install --system --no-cache "mineru[all]"

# Pre-download models at build time so first scan isn't slow.
# This runs the MinerU model downloader in pipeline (CPU) mode.
RUN python -c "from mineru.utils.download_models import download_models_hf; download_models_hf()" || true

EXPOSE 8000

# CPU-safe pipeline backend; increase workers for concurrency
CMD ["mineru-api", "--host", "0.0.0.0", "--port", "8000"]
