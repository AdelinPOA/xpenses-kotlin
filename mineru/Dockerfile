# MinerU 2.5 — CPU-only API server
# Uses the "pipeline" backend (no GPU/CUDA required).
# Starts mineru-api on port 8000.

FROM python:3.11-slim@sha256:ae52c5bef62a6bdd42cd1e8dffef86b9cd284bde9427da79839de7a4b983e7ca

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

# Add non-root user mineru
RUN useradd -u 1000 -m mineru

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir uv

# Install MinerU with all extras (pipeline + api server)
RUN uv pip install --system --no-cache "mineru[all]"

# Download models as user mineru
USER mineru
WORKDIR /home/mineru

RUN python -c "from mineru.utils.download_models import download_models_hf; download_models_hf()" || true

EXPOSE 8000

# CPU-safe pipeline backend; increase workers for concurrency
CMD ["mineru-api", "--host", "0.0.0.0", "--port", "8000"]
