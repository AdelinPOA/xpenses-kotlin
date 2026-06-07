"""Tests for OCR receipt scanning: unit tests for parsing functions + integration tests."""

import io
import sys
import types
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

# numpy and easyocr may not be installed in the test environment.
# Stub them out before importing ocr_service so the module-level
# `import numpy as np` doesn't raise ModuleNotFoundError.
if "numpy" not in sys.modules:
    _np_stub = types.ModuleType("numpy")
    _np_stub.array = lambda x: x  # type: ignore[attr-defined]
    _np_stub.mean = lambda x: sum(x) / len(x) if x else 0.0  # type: ignore[attr-defined]
    sys.modules["numpy"] = _np_stub

if "easyocr" not in sys.modules:
    sys.modules["easyocr"] = types.ModuleType("easyocr")

from xpenses.services.ocr_service import (  # noqa: E402
    extract_amount,
    extract_date,
    extract_merchant,
)

from .conftest import login  # noqa: E402

# ── Unit tests: extract_amount ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_extract_amount_total_keyword():
    lines = ["McDonalds", "Item 1  5.00", "TOTAL 45.00"]
    amount, currency = extract_amount(lines)
    assert amount == 45.0
    assert currency is None


@pytest.mark.asyncio
async def test_extract_amount_currency_symbol():
    lines = ["€12.50"]
    amount, currency = extract_amount(lines)
    assert amount == 12.5
    assert currency == "EUR"


@pytest.mark.asyncio
async def test_extract_amount_currency_code():
    lines = ["SUMA: 123.45 RON"]
    amount, currency = extract_amount(lines)
    assert amount == 123.45
    assert currency == "RON"


@pytest.mark.asyncio
async def test_extract_amount_comma_decimal():
    lines = ["TOTAL: 45,50"]
    amount, currency = extract_amount(lines)
    assert amount == 45.5
    assert currency is None


@pytest.mark.asyncio
async def test_extract_amount_european_thousands():
    lines = ["TOTAL 1.234,56 EUR"]
    amount, currency = extract_amount(lines)
    assert amount == 1234.56
    assert currency == "EUR"


@pytest.mark.asyncio
async def test_extract_amount_none():
    lines = ["No amounts here", "just text"]
    amount, currency = extract_amount(lines)
    assert amount is None
    assert currency is None


@pytest.mark.asyncio
async def test_extract_amount_largest_fallback():
    lines = ["5.00", "10.00", "3.50"]
    amount, currency = extract_amount(lines)
    assert amount == 10.0
    assert currency is None


@pytest.mark.asyncio
async def test_extract_amount_dollar():
    lines = ["$25.99"]
    amount, currency = extract_amount(lines)
    assert amount == 25.99
    assert currency == "USD"


# ── Unit tests: extract_date ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_extract_date_european():
    lines = ["15/01/2026"]
    result = extract_date(lines)
    assert result == "2026-01-15"


@pytest.mark.asyncio
async def test_extract_date_dot_format():
    lines = ["15.01.2026"]
    result = extract_date(lines)
    assert result == "2026-01-15"


@pytest.mark.asyncio
async def test_extract_date_iso():
    lines = ["2026-01-15"]
    result = extract_date(lines)
    assert result == "2026-01-15"


@pytest.mark.asyncio
async def test_extract_date_none():
    lines = ["No date here"]
    result = extract_date(lines)
    assert result is None


@pytest.mark.asyncio
async def test_extract_date_invalid_month():
    lines = ["99/99/2026"]
    result = extract_date(lines)
    assert result is None


# ── Unit tests: extract_merchant ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_extract_merchant_first_line():
    lines = ["MCDONALD'S", "15/01/2026", "TOTAL 45.00"]
    result = extract_merchant(lines)
    assert result == "Mcdonald'S"


@pytest.mark.asyncio
async def test_extract_merchant_skip_receipt_header():
    lines = ["BON FISCAL", "SC MEGA SRL", "15/01/2026"]
    result = extract_merchant(lines)
    assert result == "Sc Mega Srl"


@pytest.mark.asyncio
async def test_extract_merchant_none():
    lines = ["123", "45.00", "15/01/2026"]
    result = extract_merchant(lines)
    assert result is None


# ── Integration tests ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_scan_unauthorized(client):
    img = Image.new("RGB", (100, 50), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    resp = await client.post(
        "/api/ocr/scan",
        files={"file": ("receipt.png", buf.read(), "image/png")},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_scan_invalid_type(client):
    await login(client, "tech1")

    resp = await client.post(
        "/api/ocr/scan",
        files={"file": ("receipt.txt", b"some text content", "text/plain")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_scan_disabled(client):
    await login(client, "tech1")

    from xpenses.config import settings

    object.__setattr__(settings, "ocr_enabled", False)
    try:
        img = Image.new("RGB", (100, 50), "white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        resp = await client.post(
            "/api/ocr/scan",
            files={"file": ("receipt.png", buf.read(), "image/png")},
        )
        assert resp.status_code == 503
    finally:
        object.__setattr__(settings, "ocr_enabled", True)


@pytest.mark.asyncio
async def test_scan_success(client):
    await login(client, "tech1")

    mock_reader = MagicMock()
    mock_reader.readtext.return_value = [
        ([], "RESTAURANTUL BUNA", 0.95),
        ([], "15/01/2026 12:30", 0.90),
        ([], "Pizza  12.50", 0.85),
        ([], "Apa   3.00", 0.80),
        ([], "TOTAL 15.50 EUR", 0.92),
    ]

    img = Image.new("RGB", (100, 50), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    with patch("xpenses.services.ocr_service._get_reader", return_value=mock_reader):
        resp = await client.post(
            "/api/ocr/scan",
            files={"file": ("receipt.png", buf.read(), "image/png")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["amount"] == 15.5
    assert data["currency"] == "EUR"
    assert data["date"] == "2026-01-15"
    assert data["merchant"] is not None
    assert data["confidence"] > 0
