from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import login


@pytest.mark.asyncio
async def test_email_settings_get_defaults(client: AsyncClient, pool):
    await login(client, "mod1")
    resp = await client.get("/api/settings/email")
    assert resp.status_code == 200
    data = resp.json()
    assert data["emails_enabled"] is False
    assert data["smtp_host"] == "localhost"
    assert data["smtp_port"] == 1025
    assert data["smtp_user"] == ""
    assert data["smtp_from"] == "noreply@nt-automation.eu"
    assert data["password_set"] is False


@pytest.mark.asyncio
async def test_email_settings_patch_and_get(client: AsyncClient, pool):
    await login(client, "mod1")
    payload = {
        "emails_enabled": True,
        "smtp_host": "smtp.example.com",
        "smtp_port": 465,
        "smtp_user": "user@example.com",
        "smtp_pass": "supersecretpassword",
        "smtp_from": "noreply@example.com",
    }
    resp = await client.patch("/api/settings/email", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["emails_enabled"] is True
    assert data["smtp_host"] == "smtp.example.com"
    assert data["smtp_port"] == 465
    assert data["smtp_user"] == "user@example.com"
    assert data["smtp_from"] == "noreply@example.com"
    assert data["password_set"] is True

    # GET config
    resp2 = await client.get("/api/settings/email")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["emails_enabled"] is True
    assert data2["password_set"] is True

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'email_config'")


@pytest.mark.asyncio
async def test_email_settings_non_mod_forbidden(client: AsyncClient):
    await login(client, "tech1")
    resp_get = await client.get("/api/settings/email")
    assert resp_get.status_code == 403

    resp_patch = await client.patch(
        "/api/settings/email",
        json={"emails_enabled": True, "smtp_host": "smtp.example.com"},
    )
    assert resp_patch.status_code == 403

    resp_test = await client.post(
        "/api/settings/email/test",
        json={"to": "test@example.com"},
    )
    assert resp_test.status_code == 403


@pytest.mark.asyncio
async def test_email_settings_patch_empty_password_preserves(client: AsyncClient, pool):
    await login(client, "mod1")
    # Save initial with password
    await client.patch(
        "/api/settings/email",
        json={
            "emails_enabled": True,
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_user": "user@example.com",
            "smtp_pass": "secret1",
            "smtp_from": "noreply@example.com",
        },
    )

    # Patch with empty password
    resp = await client.patch(
        "/api/settings/email",
        json={
            "emails_enabled": True,
            "smtp_host": "smtp2.example.com",
            "smtp_port": 587,
            "smtp_user": "user2@example.com",
            "smtp_pass": "",
            "smtp_from": "noreply2@example.com",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["smtp_host"] == "smtp2.example.com"
    assert data["password_set"] is True

    # Check that it decrypts to 'secret1'
    from xpenses.services.email_settings_service import get_smtp_config
    async with pool.acquire() as conn:
        config = await get_smtp_config(conn)
        assert config.smtp_pass == "secret1"
        await conn.execute("DELETE FROM app_settings WHERE key = 'email_config'")


@pytest.mark.asyncio
async def test_email_settings_test_endpoint_success(client: AsyncClient, pool):
    await login(client, "mod1")

    # Set up config in DB
    await client.patch(
        "/api/settings/email",
        json={
            "emails_enabled": True,
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_user": "user@example.com",
            "smtp_pass": "secret",
            "smtp_from": "noreply@example.com",
        },
    )

    with patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send:
        resp = await client.post(
            "/api/settings/email/test",
            json={"to": "recipient@example.com"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "Test email sent to" in data["message"]
        mock_send.assert_called_once()

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'email_config'")


@pytest.mark.asyncio
async def test_email_settings_test_endpoint_failure(client: AsyncClient, pool):
    await login(client, "mod1")

    # Set up config in DB
    await client.patch(
        "/api/settings/email",
        json={
            "emails_enabled": True,
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_user": "user@example.com",
            "smtp_pass": "secret",
            "smtp_from": "noreply@example.com",
        },
    )

    with patch(
        "aiosmtplib.send", new_callable=AsyncMock, side_effect=Exception("Connection refused")
    ):
        resp = await client.post(
            "/api/settings/email/test",
            json={"to": "recipient@example.com"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "Connection refused" in data["message"]

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'email_config'")
