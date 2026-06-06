FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    poppler-utils \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir setuptools && pip install --no-cache-dir -e ".[test]"

COPY . .

CMD ["uvicorn", "xpenses.main:app", "--host", "0.0.0.0", "--port", "8000"]
