import os
import tempfile
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import easyocr
from pdf2image import convert_from_path
from PIL import Image

app = FastAPI(title="xpenses OCR Sidecar")

# Preload EasyOCR reader at startup
print("Preloading EasyOCR model for ['en', 'ro']...")
reader = easyocr.Reader(['en', 'ro'], gpu=False)
print("EasyOCR model loaded successfully!")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/scan")
async def scan_receipt(file: UploadFile = File(...)):
    try:
        # Write bytes to a temporary file
        suffix = os.path.splitext(file.filename)[1].lower() if file.filename else ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            lines = []
            confidences = []

            if suffix == ".pdf":
                # Convert PDF to images
                images = convert_from_path(tmp_path)
                for image in images:
                    # Convert PIL image to numpy array for EasyOCR
                    img_np = np.array(image)
                    results = reader.readtext(img_np)
                    for (_bbox, text, conf) in results:
                        lines.append(text)
                        confidences.append(conf)
            else:
                # Run EasyOCR on image
                results = reader.readtext(tmp_path)
                for (_bbox, text, conf) in results:
                    lines.append(text)
                    confidences.append(conf)

            mean_conf = sum(confidences) / len(confidences) if confidences else 0.0

            return {
                "lines": lines,
                "confidence": mean_conf
            }
        finally:
            # Clean up temporary file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
