FROM python:3.11-slim@sha256:ae52c5bef62a6bdd42cd1e8dffef86b9cd284bde9427da79839de7a4b983e7ca

WORKDIR /app

# Install system dependencies for OpenCV/EasyOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    g++ \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Add non-root user ocr and configure home directory
RUN useradd -u 1000 -m ocr && mkdir -p /home/ocr/.EasyOCR && chown -R ocr:ocr /home/ocr

COPY requirements.txt .
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir --default-timeout=1000 -r requirements.txt

COPY app.py .

# Ensure app ownership
RUN chown -R ocr:ocr /app

USER 1000
EXPOSE 5000

ENV PYTHONUNBUFFERED=1
ENV EASYOCR_DOWNLOAD_PATH=/home/ocr/.EasyOCR

CMD ["python", "app.py"]
