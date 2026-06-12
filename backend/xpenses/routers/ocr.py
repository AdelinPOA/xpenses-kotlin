import os

import asyncpg
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import get_current_user, require_role
from ..database import get_db
from ..models import OCRComparisonHistoryResponse, OCRScanResponse
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


@router.get("/comparison", response_model=OCRComparisonHistoryResponse)
async def get_ocr_comparisons(
    _current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db)
):
    # Fetch all comparison rows; LEFT JOIN so unlinked scans (expense not saved yet) still appear.
    # Accuracy is only calculated for rows where the expense has been linked (final_* not NULL).
    rows = await db.fetch(
        """
        SELECT 
            c.id,
            c.receipt_filename,
            c.created_at,
            c.gemini_amount,
            c.gemini_date,
            c.gemini_merchant,
            c.gemini_category_id,
            c.easyocr_amount,
            c.easyocr_date,
            c.easyocr_merchant,
            c.easyocr_category_id,
            c.provider,
            e.amount_original AS final_amount,
            e.date AS final_date,
            e.merchant AS final_merchant,
            e.category_id AS final_category_id
        FROM ocr_comparisons c
        LEFT JOIN expenses e ON c.expense_id = e.id
        ORDER BY c.created_at DESC
        LIMIT 100
        """
    )

    history = [dict(r) for r in rows]
    total_scanned = len(history)

    easyocr_amt_ok = 0
    easyocr_date_ok = 0
    easyocr_merchant_ok = 0
    easyocr_cat_ok = 0

    gemini_amt_ok = 0
    gemini_date_ok = 0
    gemini_merchant_ok = 0
    gemini_cat_ok = 0

    # Only count rows that have been linked to a saved expense (ground truth available)
    easyocr_count = 0
    gemini_count = 0

    for r in history:
        has_final = r["final_amount"] is not None or r["final_date"] is not None or r["final_merchant"] is not None

        # EasyOCR accuracy — only where ground truth exists
        has_easy = (
            r["easyocr_amount"] is not None
            or r["easyocr_date"] is not None
            or r["easyocr_merchant"] is not None
            or r["easyocr_category_id"] is not None
        )
        if has_easy and has_final:
            easyocr_count += 1
            if r["easyocr_amount"] is not None and r["final_amount"] is not None:
                if abs(float(r["easyocr_amount"]) - float(r["final_amount"])) < 0.01:
                    easyocr_amt_ok += 1
            if r["easyocr_date"] is not None and r["easyocr_date"] == r["final_date"]:
                easyocr_date_ok += 1
            if r["easyocr_merchant"] and r["final_merchant"]:
                if r["easyocr_merchant"].strip().lower() == r["final_merchant"].strip().lower():
                    easyocr_merchant_ok += 1
            elif not r["easyocr_merchant"] and not r["final_merchant"]:
                easyocr_merchant_ok += 1
            if r["easyocr_category_id"] == r["final_category_id"]:
                easyocr_cat_ok += 1

        # Gemini accuracy — only where ground truth exists
        has_gemini = (
            r["gemini_amount"] is not None
            or r["gemini_date"] is not None
            or r["gemini_merchant"] is not None
            or r["gemini_category_id"] is not None
        )
        if has_gemini and has_final:
            gemini_count += 1
            if r["gemini_amount"] is not None and r["final_amount"] is not None:
                if abs(float(r["gemini_amount"]) - float(r["final_amount"])) < 0.01:
                    gemini_amt_ok += 1
            if r["gemini_date"] is not None and r["gemini_date"] == r["final_date"]:
                gemini_date_ok += 1
            if r["gemini_merchant"] and r["final_merchant"]:
                if r["gemini_merchant"].strip().lower() == r["final_merchant"].strip().lower():
                    gemini_merchant_ok += 1
            elif not r["gemini_merchant"] and not r["final_merchant"]:
                gemini_merchant_ok += 1
            if r["gemini_category_id"] == r["final_category_id"]:
                gemini_cat_ok += 1

    stats = {
        "total_scanned": total_scanned,
        "easyocr_amount_accuracy": round(easyocr_amt_ok / easyocr_count * 100, 2) if easyocr_count > 0 else 0.0,
        "easyocr_date_accuracy": round(easyocr_date_ok / easyocr_count * 100, 2) if easyocr_count > 0 else 0.0,
        "easyocr_merchant_accuracy": round(easyocr_merchant_ok / easyocr_count * 100, 2) if easyocr_count > 0 else 0.0,
        "easyocr_category_accuracy": round(easyocr_cat_ok / easyocr_count * 100, 2) if easyocr_count > 0 else 0.0,
        "gemini_amount_accuracy": round(gemini_amt_ok / gemini_count * 100, 2) if gemini_count > 0 else 0.0,
        "gemini_date_accuracy": round(gemini_date_ok / gemini_count * 100, 2) if gemini_count > 0 else 0.0,
        "gemini_merchant_accuracy": round(gemini_merchant_ok / gemini_count * 100, 2) if gemini_count > 0 else 0.0,
        "gemini_category_accuracy": round(gemini_cat_ok / gemini_count * 100, 2) if gemini_count > 0 else 0.0,
    }

    return {
        "stats": stats,
        "history": history
    }
