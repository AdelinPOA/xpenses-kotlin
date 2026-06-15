FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV/EasyOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 5000

ENV PYTHONUNBUFFERED=1

CMD ["python", "app.py"]
