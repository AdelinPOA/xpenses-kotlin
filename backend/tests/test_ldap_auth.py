"""Tests for LDAP auth path in POST /api/auth/login"""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from tests.conftest import login


async def _insert_ldap_user(pool, username: str, display_name: str = "LDAP User"):
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (username, display_name, email, password_hash, auth_source, role, is_active, created_at, updated_at)"
            " VALUES ($1, $2, NULL, NULL, 'ldap', 'technician', true, $3, $3)",
            username,
            display_name,
            now,
        )


async def _delete_user(pool, username: str):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE username = $1", username)


@pytest.mark.asyncio
async def test_local_user_login_unaffected(client: AsyncClient):
    """Local users should log in normally regardless of LDAP config."""
    resp = await client.post(
        "/api/auth/login", json={"username": "tech1", "password": "tech1"}
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_ldap_user_disabled_ldap_returns_401(client: AsyncClient, pool):
    """LDAP user attempting login when LDAP is disabled → 401."""
    username = "ldap_test_user"
    await _insert_ldap_user(pool, username)
    try:
        resp = await client.post(
            "/api/auth/login", json={"username": username, "password": "somepassword"}
        )
        assert resp.status_code == 401
        assert "ldap authentication is disabled" in resp.text.lower()
    finally:
        await _delete_user(pool, username)


@pytest.mark.asyncio
async def test_ldap_user_empty_password_rejected(client: AsyncClient, pool):
    """LDAP user with empty password must be rejected before any LDAP bind attempt."""
    username = "ldap_empty_pw_user"
    await _insert_ldap_user(pool, username)
    try:
        resp = await client.post(
            "/api/auth/login", json={"username": username, "password": ""}
        )
        assert resp.status_code == 401
    finally:
        await _delete_user(pool, username)
