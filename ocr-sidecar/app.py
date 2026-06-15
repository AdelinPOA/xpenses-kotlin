import os
import tempfile
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import easyocr

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
        suffix = os.path.splitext(file.filename)[1] if file.filename else ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Run EasyOCR
            results = reader.readtext(tmp_path)
            lines = [text for (_bbox, text, _conf) in results]
            confidences = [conf for (_bbox, _text, conf) in results]
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
