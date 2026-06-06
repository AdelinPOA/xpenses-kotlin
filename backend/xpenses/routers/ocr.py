import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import get_current_user
from ..config import settings
from ..models import OCRScanResponse
from ..services import ocr_service

SCAN_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
MAX_SIZE_MB = 10

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


@router.post("/scan", response_model=OCRScanResponse)
async def scan_receipt_endpoint(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if not settings.ocr_enabled:
        raise HTTPException(503, "OCR is disabled")

    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SCAN_EXTENSIONS:
        raise HTTPException(400, f"File type {ext} not supported for OCR")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File exceeds {MAX_SIZE_MB}MB limit")

    result = await ocr_service.scan_receipt(content, filename)
    return result
