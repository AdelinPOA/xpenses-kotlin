"""Tests for POST /api/auth/login, /refresh, /logout and GET /api/auth/me."""

import pytest
from httpx import AsyncClient

from tests.conftest import login


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login", json={"username": "tech1", "password": "tech1"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "tech1"
    assert data["role"] == "technician"
    assert "display_name" in data


@pytest.mark.asyncio
async def test_login_sets_cookies(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login", json={"username": "tech1", "password": "tech1"}
    )
    assert resp.status_code == 200
    cookie_names = {c.name for c in resp.cookies.jar}
    assert "access_token" in cookie_names
    assert "refresh_token" in cookie_names


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login", json={"username": "tech1", "password": "wrongpassword"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login", json={"username": "nobody", "password": "nobody"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_deactivated_user(client: AsyncClient, pool):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET is_active = false WHERE username = 'tech1'"
        )
    try:
        resp = await client.post(
            "/api/auth/login", json={"username": "tech1", "password": "tech1"}
        )
        assert resp.status_code == 403
    finally:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET is_active = true WHERE username = 'tech1'"
            )


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient):
    client = await login(client, "tech1")
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "tech1"
    assert data["role"] == "technician"
    assert "display_name" in data


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_rotation(client: AsyncClient):
    client = await login(client, "tech1")
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 200
    assert resp.json() == {"status": "refreshed"}
    cookie_names = {c.name for c in resp.cookies.jar}
    assert "access_token" in cookie_names
    assert "refresh_token" in cookie_names


@pytest.mark.asyncio
async def test_refresh_without_cookie(client: AsyncClient):
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout(client: AsyncClient):
    client = await login(client, "tech1")
    logout_resp = await client.post("/api/auth/logout")
    assert logout_resp.status_code == 200
    me_resp = await client.get("/api/auth/me")
    assert me_resp.status_code == 401


@pytest.mark.asyncio
async def test_role_gating_technician_cant_access_users(client: AsyncClient):
    client = await login(client, "tech1")
    resp = await client.get("/api/users")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_role_gating_mod_can_access_users(client: AsyncClient):
    client = await login(client, "mod1")
    resp = await client.get("/api/users")
    assert resp.status_code == 200
