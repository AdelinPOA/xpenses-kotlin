"""Tests for GET/PATCH /api/settings/ldap"""

import pytest
from httpx import AsyncClient

from tests.conftest import login


@pytest.mark.asyncio
async def test_get_defaults_when_unset(client: AsyncClient, pool):
    await login(client, "mod1")
    resp = await client.get("/api/settings/ldap")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["bind_password"] == "***"
    assert data["bind_password_invalid"] is False
    # Clean up (no ldap_config row should exist, but guard anyway)
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'ldap_config'")


@pytest.mark.asyncio
async def test_patch_saves_and_masks_password(client: AsyncClient, pool):
    await login(client, "mod1")
    payload = {
        "enabled": False,
        "host": "ldap.example.com",
        "port": 389,
        "use_tls": False,
        "bind_dn": "cn=admin,dc=example,dc=com",
        "bind_password": "secret123",
        "base_dn": "dc=example,dc=com",
        "user_filter": "(objectClass=person)",
        "attr_username": "uid",
        "attr_email": "mail",
        "attr_display_name": "cn",
        "attr_role": "memberOf",
        "role_map": {},
        "default_role": "technician",
    }
    resp = await client.patch("/api/settings/ldap", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["bind_password"] == "***"

    # GET should also mask password, not return plaintext
    resp2 = await client.get("/api/settings/ldap")
    assert resp2.status_code == 200
    assert resp2.json()["bind_password"] == "***"

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'ldap_config'")


@pytest.mark.asyncio
async def test_non_mod_get_403(client: AsyncClient):
    await login(client, "tech1")
    resp = await client.get("/api/settings/ldap")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_non_mod_patch_403(client: AsyncClient):
    await login(client, "tech1")
    resp = await client.patch("/api/settings/ldap", json={"enabled": False})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_patch_enabled_requires_host(client: AsyncClient, pool):
    await login(client, "mod1")
    resp = await client.patch(
        "/api/settings/ldap",
        json={
            "enabled": True,
            "host": "",
            "base_dn": "dc=test,dc=com",
            "bind_dn": "cn=admin",
        },
    )
    assert resp.status_code == 422
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'ldap_config'")


@pytest.mark.asyncio
async def test_patch_empty_password_preserves_stored(client: AsyncClient, pool):
    await login(client, "mod1")

    # First PATCH — set password
    await client.patch(
        "/api/settings/ldap",
        json={
            "enabled": False,
            "host": "ldap.example.com",
            "bind_dn": "cn=admin,dc=example,dc=com",
            "bind_password": "first",
            "base_dn": "dc=example,dc=com",
        },
    )

    # Second PATCH — change host but send empty password
    resp = await client.patch(
        "/api/settings/ldap",
        json={
            "enabled": False,
            "host": "ldap2.example.com",
            "bind_dn": "cn=admin,dc=example,dc=com",
            "bind_password": "",
            "base_dn": "dc=example,dc=com",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["host"] == "ldap2.example.com"
    # bind_password_invalid should be False — stored encrypted password decrypts fine
    assert data["bind_password_invalid"] is False

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'ldap_config'")
