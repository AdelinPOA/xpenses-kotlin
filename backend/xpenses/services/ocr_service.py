import asyncio
import io
import re

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = 25_000_000
MAX_EDGE = 2000

_reader = None


def _empty_result(warnings: list[str]) -> dict:
    return {
        "amount": None, "currency": None, "tax_amount": None, "tax_rate": None,
        "date": None, "merchant": None, "raw_text": "", "confidence": 0.0, "warnings": warnings,
    }


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr

        from ..config import settings

        langs = [lang.strip() for lang in settings.ocr_languages.split(",")]
        _reader = easyocr.Reader(langs, gpu=False)
    return _reader


async def scan_receipt(file_bytes: bytes, filename: str) -> dict:
    warnings: list[str] = []

    # Convert to numpy array
    if filename.lower().endswith(".pdf"):
        try:
            from pdf2image import convert_from_bytes

            pages = convert_from_bytes(file_bytes, first_page=1, last_page=1, dpi=150, size=(MAX_EDGE, None))
            if not pages:
                return _empty_result(["Could not extract page from PDF"])
            pil_image = pages[0]
        except MemoryError:
            return _empty_result(["PDF too large to render"])
        except Exception as exc:
            return _empty_result([f"PDF conversion failed: {exc}"])
    else:
        try:
            pil_image = Image.open(io.BytesIO(file_bytes))
            pil_image.verify()
            pil_image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            w, h = pil_image.size
            if max(w, h) > MAX_EDGE:
                ratio = MAX_EDGE / max(w, h)
                pil_image = pil_image.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        except Image.DecompressionBombError:
            return _empty_result(["Image too large (possible decompression bomb)"])
        except Exception as exc:
            return _empty_result([f"Image open failed: {exc}"])

    image_np = np.array(pil_image)

    # Run EasyOCR in thread pool to avoid blocking the event loop
    try:
        reader = _get_reader()
        results = await asyncio.to_thread(reader.readtext, image_np)
    except Exception as exc:
        return _empty_result([f"OCR failed: {exc}"])

    # Extract text lines and compute mean confidence
    lines: list[str] = []
    confidences: list[float] = []
    for _bbox, text, conf in results:
        lines.append(text)
        confidences.append(conf)

    raw_text = "\n".join(lines)
    mean_confidence = float(np.mean(confidences)) if confidences else 0.0

    amount, currency = extract_amount(lines)
    tax_amount, tax_rate = extract_tax(lines)
    date = extract_date(lines)
    merchant = extract_merchant(lines)

    if amount is None:
        warnings.append("Could not extract amount")
    if date is None:
        warnings.append("Could not extract date")
    if merchant is None:
        warnings.append("Could not extract merchant")

    return {
        "amount": amount,
        "currency": currency,
        "tax_amount": tax_amount,
        "tax_rate": tax_rate,
        "date": date,
        "merchant": merchant,
        "raw_text": raw_text,
        "confidence": round(mean_confidence, 4),
        "warnings": warnings,
    }


def extract_amount(lines: list[str]) -> tuple[float | None, str | None]:
    """Extract the total amount and currency from OCR text lines."""

    TOTAL_KEYWORDS = {"total", "suma", "amount", "to pay", "de plata", "plata", "grand total"}

    CURRENCY_SYMBOL_MAP = {"€": "EUR", "$": "USD"}
    CURRENCY_CODE_MAP = {"EUR": "EUR", "RON": "RON", "USD": "USD", "GBP": "GBP", "LEI": "RON"}

    # Patterns: (regex, group_amount, group_currency_or_None)
    PATTERNS = [
        # Currency symbol before amount: €12.50  $1,234.56  €1.234,56
        (re.compile(r"([€$])\s*([\d.,]+\d{2})"), 2, 1),
        # Currency code after amount: 12.50 EUR  1.234,56 RON
        (re.compile(r"([\d.,]+\d{2})\s*(EUR|RON|USD|GBP|lei)", re.IGNORECASE), 1, 2),
        # Plain decimal number: 12.50  1.234,56
        (re.compile(r"((?:\d{1,3}\.)*\d{1,6}[,]\d{2}|\d{1,6}\.\d{2})"), 1, None),
    ]

    def _parse_amount(raw: str) -> float:
        # European comma decimal: replace last comma with dot if it looks like separator
        # e.g. "1.234,56" → 1234.56  or "12,50" → 12.50
        if "," in raw and "." in raw:
            # assume dot is thousands separator, comma is decimal
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", ".")
        return float(raw)

    def _resolve_currency(sym: str) -> str | None:
        upper = sym.strip().upper()
        if sym.strip() in CURRENCY_SYMBOL_MAP:
            return CURRENCY_SYMBOL_MAP[sym.strip()]
        return CURRENCY_CODE_MAP.get(upper)

    def _find_in_line(line: str) -> tuple[float | None, str | None]:
        for pattern, amt_grp, cur_grp in PATTERNS:
            m = pattern.search(line)
            if m:
                try:
                    amount = _parse_amount(m.group(amt_grp))
                except ValueError:
                    continue
                currency = None
                if cur_grp is not None:
                    currency = _resolve_currency(m.group(cur_grp))
                return amount, currency
        return None, None

    def _guess_global_currency() -> str | None:
        full_text = " ".join(lines).upper()
        if "€" in full_text or "EUR" in full_text:
            return "EUR"
        if "$" in full_text or "USD" in full_text:
            return "USD"
        if "RON" in full_text or "LEI" in full_text:
            return "RON"
        return None

    # First pass: look on lines that contain total keywords
    keyword_results: list[tuple[float, str | None]] = []
    for i, line in enumerate(lines):
        lower = line.lower()
        if any(kw in lower for kw in TOTAL_KEYWORDS):
            # Check current line
            amt, cur = _find_in_line(line)
            if amt is not None:
                keyword_results.append((amt, cur))
                continue

            # Look ahead up to 2 lines
            for j in range(1, 3):
                if i + j < len(lines):
                    lookahead_amt, lookahead_cur = _find_in_line(lines[i + j])
                    if lookahead_amt is not None:
                        keyword_results.append((lookahead_amt, lookahead_cur))
                        break

    final_amt, final_cur = None, None

    if keyword_results:
        # Return the last keyword match (usually the grand total at the bottom)
        final_amt, final_cur = keyword_results[-1]
    else:
        # Second pass: find largest amount across all lines
        all_results: list[tuple[float, str | None]] = []
        for line in lines:
            amt, cur = _find_in_line(line)
            if amt is not None:
                all_results.append((amt, cur))

        if all_results:
            final_amt, final_cur = max(all_results, key=lambda x: x[0])

    if final_amt is not None and final_cur is None:
        final_cur = _guess_global_currency()

    return final_amt, final_cur


def extract_tax(lines: list[str]) -> tuple[float | None, float | None]:
    """Extract tax amount and rate from OCR text lines."""
    TAX_KEYWORDS = {"tax", "vat", "tva", "taxa"}
    for line in lines:
        lower = line.lower()
        if any(kw in lower for kw in TAX_KEYWORDS):
            pct_match = re.search(r"(\d+(?:[.,]\d+)?)\s*%", line)
            rate = float(pct_match.group(1).replace(",", ".")) if pct_match else None

            amt_match = re.search(r"(\d+(?:[.,]\d{2}))", line)
            amt = float(amt_match.group(1).replace(",", ".")) if amt_match else None

            if amt is not None or rate is not None:
                return amt, rate
    return None, None


def extract_date(lines: list[str]) -> str | None:
    """Extract a date from OCR text lines, returning ISO format YYYY-MM-DD."""

    # DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
    DD_MM_YYYY = re.compile(r"(\d{2})[./\-](\d{2})[./\-](\d{4})")
    # YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    YYYY_MM_DD = re.compile(r"(\d{4})[./\-](\d{2})[./\-](\d{2})")

    for line in lines:
        # Try ISO format first
        m = YYYY_MM_DD.search(line)
        if m:
            year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= month <= 12 and 1 <= day <= 31:
                return f"{year:04d}-{month:02d}-{day:02d}"

        # Try European DD/MM/YYYY format
        m = DD_MM_YYYY.search(line)
        if m:
            day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= month <= 12 and 1 <= day <= 31:
                return f"{year:04d}-{month:02d}-{day:02d}"

    return None


def extract_merchant(lines: list[str]) -> str | None:
    """Extract merchant name from OCR text lines."""

    SKIP_KEYWORDS = {
        "bon fiscal",
        "receipt",
        "factura",
        "invoice",
        "chitanta",
        "tax invoice",
        "fiscal receipt",
    }
    DATE_PATTERN = re.compile(r"\d{2}[./\-]\d{2}[./\-]\d{2,4}")
    NUMBERS_ONLY = re.compile(r"^[\d\s\W]+$")

    for line in lines:
        stripped = line.strip()

        # Too short
        if len(stripped) < 3:
            continue

        # Skip date-like lines
        if DATE_PATTERN.search(stripped):
            continue

        # Skip lines that are only numbers/symbols
        if NUMBERS_ONLY.match(stripped):
            continue

        # Skip common receipt headers
        if stripped.lower() in SKIP_KEYWORDS:
            continue

        return stripped.title()

    return None
