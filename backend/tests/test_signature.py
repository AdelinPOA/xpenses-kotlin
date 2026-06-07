import base64
import struct
import zlib

import pytest

from tests.conftest import create_report, login, new_client


def _make_minimal_png() -> str:
    """1x1 transparent PNG."""
    raw = b"\x00\x00\x00\x00"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)

    def _chunk(ctype, data):
        c = ctype + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += _chunk(b"IHDR", ihdr)
    png += _chunk(b"IDAT", zlib.compress(raw))
    png += _chunk(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(png).decode()


VALID_PNG = _make_minimal_png()


@pytest.mark.asyncio
async def test_put_signature(client):
    await login(client, "tech1")
    resp = await client.put("/api/users/me/signature", json={"image": VALID_PNG})
    assert resp.status_code == 200
    assert "signature_path" in resp.json()


@pytest.mark.asyncio
async def test_get_signature(client):
    await login(client, "tech1")
    await client.put("/api/users/me/signature", json={"image": VALID_PNG})
    resp = await client.get("/api/users/me/signature")
    assert resp.status_code == 200
    assert "image/png" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_get_signature_not_found(client):
    await login(client, "tech1")
    resp = await client.get("/api/users/me/signature")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_signature(client):
    await login(client, "tech1")
    await client.put("/api/users/me/signature", json={"image": VALID_PNG})
    resp = await client.delete("/api/users/me/signature")
    assert resp.status_code == 204
    resp = await client.get("/api/users/me/signature")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_sign_report(client):
    await login(client, "tech1")
    await client.put("/api/users/me/signature", json={"image": VALID_PNG})
    report = await create_report(client, title="Sign Test")
    report_id = report["id"]
    resp = await client.post(f"/api/reports/{report_id}/sign")
    assert resp.status_code == 200
    data = resp.json()
    assert data["signer_id"] == report["user_id"]
    assert data["signed_at"] is not None


@pytest.mark.asyncio
async def test_sign_report_no_signature(client):
    await login(client, "tech1")
    report = await create_report(client, title="No Sig Test")
    report_id = report["id"]
    resp = await client.post(f"/api/reports/{report_id}/sign")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_sign_report_not_owner(client):
    await login(client, "tech1")
    report = await create_report(client, title="Owner Test")
    report_id = report["id"]

    async with new_client() as client2:
        await login(client2, "manager1")
        await client2.put("/api/users/me/signature", json={"image": VALID_PNG})
        resp = await client2.post(f"/api/reports/{report_id}/sign")
        assert resp.status_code == 403
