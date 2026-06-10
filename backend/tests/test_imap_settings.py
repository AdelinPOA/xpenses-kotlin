from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import login


@pytest.mark.asyncio
async def test_imap_settings_get_defaults(client: AsyncClient, pool):
    await login(client, "mod1")
    resp = await client.get("/api/settings/imap")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["imap_host"] == ""
    assert data["imap_port"] == 993
    assert data["imap_user"] == ""
    assert data["imap_folder"] == "INBOX"
    assert data["password_set"] is False


@pytest.mark.asyncio
async def test_imap_settings_patch_and_get(client: AsyncClient, pool):
    await login(client, "mod1")
    payload = {
        "enabled": True,
        "imap_host": "imap.example.com",
        "imap_port": 143,
        "imap_user": "user@example.com",
        "imap_pass": "securepass",
        "imap_folder": "Inbox/Work",
    }
    resp = await client.patch("/api/settings/imap", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert data["imap_host"] == "imap.example.com"
    assert data["imap_port"] == 143
    assert data["imap_user"] == "user@example.com"
    assert data["imap_folder"] == "Inbox/Work"
    assert data["password_set"] is True

    # GET config
    resp2 = await client.get("/api/settings/imap")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["enabled"] is True
    assert data2["password_set"] is True

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'imap_config'")


@pytest.mark.asyncio
async def test_imap_settings_non_mod_forbidden(client: AsyncClient):
    await login(client, "tech1")
    resp_get = await client.get("/api/settings/imap")
    assert resp_get.status_code == 403

    resp_patch = await client.patch(
        "/api/settings/imap",
        json={"enabled": True, "imap_host": "imap.example.com"},
    )
    assert resp_patch.status_code == 403

    resp_test = await client.post(
        "/api/settings/imap/test",
        json={"imap_host": "imap.example.com"},
    )
    assert resp_test.status_code == 403


@pytest.mark.asyncio
async def test_imap_settings_patch_empty_password_preserves(client: AsyncClient, pool):
    await login(client, "mod1")
    # Save initial with password
    await client.patch(
        "/api/settings/imap",
        json={
            "enabled": True,
            "imap_host": "imap.example.com",
            "imap_port": 993,
            "imap_user": "user@example.com",
            "imap_pass": "firstpass",
            "imap_folder": "INBOX",
        },
    )

    # Patch with empty password
    resp = await client.patch(
        "/api/settings/imap",
        json={
            "enabled": True,
            "imap_host": "imap2.example.com",
            "imap_port": 993,
            "imap_user": "user2@example.com",
            "imap_pass": "",
            "imap_folder": "INBOX",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["imap_host"] == "imap2.example.com"
    assert data["password_set"] is True

    # Check that it decrypts to 'firstpass'
    from xpenses.services.imap_settings_service import get_imap_config
    async with pool.acquire() as conn:
        config = await get_imap_config(conn)
        assert config.imap_pass == "firstpass"
        await conn.execute("DELETE FROM app_settings WHERE key = 'imap_config'")


@pytest.mark.asyncio
async def test_imap_settings_test_endpoint_success(client: AsyncClient, pool):
    await login(client, "mod1")

    # Mock imaplib.IMAP4_SSL and mock the connection context manager
    mock_imap = MagicMock()
    mock_imap.select.return_value = ("OK", [b"1"])

    with patch("imaplib.IMAP4_SSL", return_value=mock_imap):
        resp = await client.post(
            "/api/settings/imap/test",
            json={
                "enabled": True,
                "imap_host": "imap.example.com",
                "imap_port": 993,
                "imap_user": "user@example.com",
                "imap_pass": "secret",
                "imap_folder": "INBOX",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "Successfully connected" in data["message"]


@pytest.mark.asyncio
async def test_imap_settings_test_endpoint_failure(client: AsyncClient, pool):
    await login(client, "mod1")

    # Mock failure
    with patch("imaplib.IMAP4_SSL", side_effect=Exception("Connection timed out")):
        resp = await client.post(
            "/api/settings/imap/test",
            json={
                "enabled": True,
                "imap_host": "imap.example.com",
                "imap_port": 993,
                "imap_user": "user@example.com",
                "imap_pass": "secret",
                "imap_folder": "INBOX",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "Connection timed out" in data["message"]
