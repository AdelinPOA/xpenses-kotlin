"""Tests for POST /api/settings/ldap/sync"""

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import login
from xpenses.services.ldap_service import LdapConfig, sync_users


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_ldap_entry(uid, cn, mail, member_of=None):
    entry = MagicMock()
    entry.uid.value = uid
    entry.cn.value = cn
    entry.mail.value = mail
    entry.memberOf.value = member_of or []
    entry.entry_dn = f"uid={uid},dc=test,dc=com"
    return entry


def _base_config(**kwargs) -> LdapConfig:
    defaults = dict(
        enabled=True,
        host="ldap.test",
        port=389,
        use_tls=False,
        bind_dn="cn=admin,dc=test,dc=com",
        bind_password="pw",
        base_dn="dc=test,dc=com",
        user_filter="(objectClass=person)",
        attr_username="uid",
        attr_email="mail",
        attr_display_name="cn",
        attr_role="memberOf",
        role_map={},
        default_role="technician",
    )
    defaults.update(kwargs)
    return LdapConfig(**defaults)


async def _save_ldap_config_enabled(pool, enabled: bool = True):
    data = json.dumps({
        "enabled": enabled,
        "host": "ldap.test",
        "port": 389,
        "use_tls": False,
        "bind_dn": "cn=admin",
        "bind_password": "",
        "base_dn": "dc=test,dc=com",
        "user_filter": "(objectClass=person)",
        "attr_username": "uid",
        "attr_email": "mail",
        "attr_display_name": "cn",
        "attr_role": "memberOf",
        "role_map": {},
        "default_role": "technician",
    })
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO app_settings (key, value, updated_at)
               VALUES ('ldap_config', $1, $2)
               ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=$2""",
            data,
            now,
        )


# ---------------------------------------------------------------------------
# HTTP endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sync_disabled_returns_400(client: AsyncClient, pool):
    """No ldap_config saved → enabled defaults to False → 400."""
    await login(client, "mod1")
    resp = await client.post("/api/settings/ldap/sync")
    assert resp.status_code == 400
    assert "not enabled" in resp.text.lower()


@pytest.mark.asyncio
async def test_sync_with_enabled_false_returns_400(client: AsyncClient, pool):
    await _save_ldap_config_enabled(pool, enabled=False)
    await login(client, "mod1")
    resp = await client.post("/api/settings/ldap/sync")
    assert resp.status_code == 400
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM app_settings WHERE key = 'ldap_config'")


@pytest.mark.asyncio
async def test_non_mod_sync_403(client: AsyncClient):
    await login(client, "tech1")
    resp = await client.post("/api/settings/ldap/sync")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Service-layer unit tests (mock ldap3)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sync_creates_ldap_users(pool):
    config = _base_config()
    entries = [
        make_ldap_entry("alice", "Alice Smith", "alice@test.com"),
        make_ldap_entry("bob", "Bob Jones", "bob@test.com"),
    ]

    mock_conn = MagicMock()
    mock_conn.entries = entries
    mock_conn.search = MagicMock()
    mock_conn.unbind = MagicMock()

    mock_server = MagicMock()

    with patch("xpenses.services.ldap_service.ldap3") as mock_ldap3:
        mock_ldap3.Server.return_value = mock_server
        mock_ldap3.Connection.return_value = mock_conn
        mock_ldap3.SUBTREE = "SUBTREE"
        mock_ldap3.ALL = "ALL"
        result = await sync_users(config, pool)

    assert result["created"] == 2
    assert result["deactivated"] == 0

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT username, auth_source FROM users WHERE username IN ('alice', 'bob')"
        )
        usernames = {r["username"] for r in rows}
        assert "alice" in usernames
        assert "bob" in usernames
        for r in rows:
            assert r["auth_source"] == "ldap"

        # Cleanup
        await conn.execute("DELETE FROM users WHERE username IN ('alice', 'bob')")


@pytest.mark.asyncio
async def test_sync_deactivates_absent_users(pool):
    config = _base_config()
    now = datetime.now(timezone.utc)

    # Insert an LDAP user that won't appear in directory
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (username, display_name, email, password_hash, auth_source, role, is_active, created_at, updated_at)"
            " VALUES ('ghost_ldap', 'Ghost User', 'ghost@test.com', NULL, 'ldap', 'technician', true, $1, $1)",
            now,
        )

    mock_conn = MagicMock()
    mock_conn.entries = []  # Directory returns nothing
    mock_conn.search = MagicMock()
    mock_conn.unbind = MagicMock()

    with patch("xpenses.services.ldap_service.ldap3") as mock_ldap3:
        mock_ldap3.Server.return_value = MagicMock()
        mock_ldap3.Connection.return_value = mock_conn
        mock_ldap3.SUBTREE = "SUBTREE"
        mock_ldap3.ALL = "ALL"
        result = await sync_users(config, pool)

    assert result["deactivated"] == 1

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT is_active FROM users WHERE username = 'ghost_ldap'")
        assert row is not None
        assert row["is_active"] is False
        # Cleanup
        await conn.execute("DELETE FROM users WHERE username = 'ghost_ldap'")


@pytest.mark.asyncio
async def test_sync_skips_local_users(pool):
    config = _base_config()
    now = datetime.now(timezone.utc)

    # Insert a local user with same username as a directory entry
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (username, display_name, email, password_hash, auth_source, role, is_active, created_at, updated_at)"
            " VALUES ('local_overlap', 'Local Overlap', 'local@test.com', 'hash', 'local', 'technician', true, $1, $1)",
            now,
        )

    entries = [make_ldap_entry("local_overlap", "LDAP Overlap", "ldap@test.com")]

    mock_conn = MagicMock()
    mock_conn.entries = entries
    mock_conn.search = MagicMock()
    mock_conn.unbind = MagicMock()

    with patch("xpenses.services.ldap_service.ldap3") as mock_ldap3:
        mock_ldap3.Server.return_value = MagicMock()
        mock_ldap3.Connection.return_value = mock_conn
        mock_ldap3.SUBTREE = "SUBTREE"
        mock_ldap3.ALL = "ALL"
        result = await sync_users(config, pool)

    assert result["skipped"] == 1

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT auth_source, display_name FROM users WHERE username = 'local_overlap'"
        )
        # local user unchanged
        assert row["auth_source"] == "local"
        assert row["display_name"] == "Local Overlap"
        # Cleanup
        await conn.execute("DELETE FROM users WHERE username = 'local_overlap'")
