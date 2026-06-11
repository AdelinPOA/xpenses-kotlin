import os
import asyncpg

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..models import OCRScanResponse
from ..services import ocr_service

SCAN_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
MAX_SIZE_BYTES = 10 * 1024 * 1024

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


@router.post("/scan", response_model=OCRScanResponse)
async def scan_receipt_endpoint(
    file: UploadFile = File(...),
    _current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    from ..services.ocr_service import get_ocr_config
    config = await get_ocr_config(db)
    if not config.ocr_enabled:
        raise HTTPException(503, "OCR is disabled")

    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SCAN_EXTENSIONS:
        raise HTTPException(400, f"File type {ext} not supported for OCR")

    if file.size and file.size > MAX_SIZE_BYTES:
        raise HTTPException(400, "File exceeds 10MB limit")

    chunks = []
    total = 0
    while chunk := await file.read(1024 * 256):
        total += len(chunk)
        if total > MAX_SIZE_BYTES:
            raise HTTPException(400, "File exceeds 10MB limit")
        chunks.append(chunk)
    content = b"".join(chunks)

    result = await ocr_service.scan_receipt(content, filename, db=db)
    return result

