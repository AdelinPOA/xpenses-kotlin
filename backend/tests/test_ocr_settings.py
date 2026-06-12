from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import login


@pytest.mark.asyncio
async def test_ocr_settings_get_defaults(client: AsyncClient, pool):
    await login(client, "mod1")
    resp = await client.get("/api/settings/ocr")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ocr_enabled"] is True
    assert data["provider"] == "easyocr"
    assert data["gemini_api_key"] is None


@pytest.mark.asyncio
async def test_ocr_settings_patch_and_get(client: AsyncClient, pool):
    await login(client, "mod1")
    payload = {
        "ocr_enabled": True,
        "provider": "gemini",
        "gemini_api_key": "mysecretgeminikey",
    }
    resp = await client.patch("/api/settings/ocr", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["ocr_enabled"] is True
    assert data["provider"] == "gemini"
    assert data["gemini_api_key"] == "••••••••"

    # GET config to verify key masking persists
    resp2 = await client.get("/api/settings/ocr")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["ocr_enabled"] is True
    assert data2["provider"] == "gemini"
    assert data2["gemini_api_key"] == "••••••••"

    # Verify decryption internally
    from xpenses.services.ocr_service import get_ocr_config
    async with pool.acquire() as conn:
        config = await get_ocr_config(conn)
        assert config.gemini_api_key == "mysecretgeminikey"
        await conn.execute("DELETE FROM app_settings WHERE key = 'ocr_config'")


@pytest.mark.asyncio
async def test_ocr_settings_non_mod_forbidden(client: AsyncClient):
    await login(client, "tech1")
    resp_get = await client.get("/api/settings/ocr")
    assert resp_get.status_code == 403

    resp_patch = await client.patch(
        "/api/settings/ocr",
        json={"ocr_enabled": False},
    )
    assert resp_patch.status_code == 403

    resp_test = await client.post(
        "/api/settings/ocr/test",
        json={"gemini_api_key": "somekey"},
    )
    assert resp_test.status_code == 403


@pytest.mark.asyncio
async def test_ocr_settings_test_endpoint_success(client: AsyncClient):
    await login(client, "mod1")

    class MockResponse:
        status_code = 200
        text = "OK"
        def json(self):
            return {"name": "models/gemini-2.5-flash"}

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = MockResponse()
        resp = await client.post(
            "/api/settings/ocr/test",
            json={"gemini_api_key": "testkey"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "connection successful" in data["message"].lower()


@pytest.mark.asyncio
async def test_ocr_settings_test_endpoint_failure(client: AsyncClient):
    await login(client, "mod1")

    class MockResponse:
        status_code = 400
        text = "Bad Request"
        def json(self):
            return {"error": {"message": "API key not valid"}}

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = MockResponse()
        resp = await client.post(
            "/api/settings/ocr/test",
            json={"gemini_api_key": "badkey"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "api key not valid" in data["message"].lower()


@pytest.mark.asyncio
async def test_scan_receipt_falls_back_to_easyocr(client: AsyncClient, pool):
    await login(client, "mod1")

    # Set up config to use gemini
    await client.patch(
        "/api/settings/ocr",
        json={
            "ocr_enabled": True,
            "provider": "gemini",
            "gemini_api_key": "mykey",
        },
    )

    # We will call the scan receipt endpoint.
    # We mock Gemini to raise an exception.
    # We mock EasyOCR scan to return a simple mock result so we don't spin up EasyOCR in tests.
    mock_easyocr_result = {
        "amount": 42.0,
        "currency": "EUR",
        "tax_amount": 0.0,
        "tax_rate": None,
        "date": "2026-06-11",
        "merchant": "Fallback Store",
        "category_id": None,
        "description": "Fallback receipt",
        "raw_text": "Fallback receipt text",
        "confidence": 0.99,
        "warnings": [],
    }

    import io
    dummy_file = io.BytesIO(b"fake image bytes")
    files = {"file": ("receipt.png", dummy_file, "image/png")}

    await login(client, "tech1")

    with patch("xpenses.services.ocr_service.GeminiOCRProvider.scan", new_callable=AsyncMock, side_effect=Exception("Gemini Rate Limit Exceeded")), \
         patch("xpenses.services.ocr_service.EasyOCRProvider.scan", new_callable=AsyncMock, return_value=mock_easyocr_result) as mock_easy:
        
        resp = await client.post("/api/ocr/scan", files=files)
        assert resp.status_code == 200
        data = resp.json()
        
        assert data["merchant"] == "Fallback Store"
        assert data["amount"] == 42.0
        assert any("Gemini OCR failed" in w for w in data["warnings"])
        mock_easy.assert_called_once()

    # Clean up settings
    await login(client, "mod1")
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'ocr_config'")
