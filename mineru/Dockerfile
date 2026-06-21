# MinerU 2.5 — Intel GPU (XPU) API server
# Uses the "pipeline" backend with Intel XPU acceleration via IPEX.
# Starts mineru-api on port 8000.
#
# GPU requirements (from host):
#   - /dev/dri/* device nodes (Intel Arc / integrated GPU) — passed via docker-compose devices
#   - Intel GPU kernel driver (i915) loaded on host
# Inside the container:
#   - Host's Intel GPU compute libraries mounted at /opt/intel/gpu-libs (see docker-compose volumes)
#   - PyTorch + IPEX from the XPU channel (bundles Level Zero loader)
#   - MINERU_DEVICE_MODE=xpu to select the Intel GPU

FROM python:3.11-slim@sha256:ae52c5bef62a6bdd42cd1e8dffef86b9cd284bde9427da79839de7a4b983e7ca

LABEL description="MinerU OCR server with Intel XPU GPU acceleration"
LABEL gpu="intel-arc-xpu"

# System dependencies for image/PDF processing (no Intel GPU packages — they conflict
# with Debian libs; we mount the host's Intel GPU libraries instead)
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

# Install MinerU with all extras (resolves all dependencies automatically)
RUN uv pip install --system --no-cache "mineru[all]"

# Re-install PyTorch + IPEX from Intel XPU channel over the standard CPU/CUDA packages
RUN uv pip install --system --no-cache \
        torch==2.8.0 \
        torchvision \
        intel-extension-for-pytorch==2.8.0 \
        --extra-index-url https://download.pytorch.org/whl/xpu \
        --index-strategy unsafe-best-match \
        --force-reinstall

# Copy and run the XPU device detection patch script
COPY patch_xpu.py /tmp/patch_xpu.py
RUN python3 /tmp/patch_xpu.py

# Download models as user mineru
USER mineru
WORKDIR /home/mineru

RUN python -c "from mineru.utils.download_models import download_models_hf; download_models_hf()" || true

EXPOSE 8000

CMD ["mineru-api", "--host", "0.0.0.0", "--port", "8000"]
