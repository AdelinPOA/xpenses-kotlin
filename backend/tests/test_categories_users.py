"""Tests for GET/POST/PATCH/DELETE /api/categories and GET/PUT /api/users endpoints."""

import pytest
from httpx import AsyncClient

from tests.conftest import login


@pytest.mark.asyncio
async def test_list_categories(client: AsyncClient):
    await login(client, "tech1")
    resp = await client.get("/api/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 10


@pytest.mark.asyncio
async def test_create_category_mod_only(client: AsyncClient, pool):
    await login(client, "tech1")
    resp = await client.post("/api/categories", json={"name": "ModOnlyTest", "limit_amount": None})
    assert resp.status_code == 403

    await login(client, "mod1")
    try:
        resp = await client.post(
            "/api/categories",
            json={"name": "ModOnlyTest", "limit_amount": None},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "ModOnlyTest"
        assert data["is_active"] is True
    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM categories WHERE name = 'ModOnlyTest'")


@pytest.mark.asyncio
async def test_create_duplicate_category(client: AsyncClient, pool):
    await login(client, "mod1")
    try:
        resp = await client.post("/api/categories", json={"name": "TestCat", "limit_amount": None})
        assert resp.status_code == 201
        resp = await client.post("/api/categories", json={"name": "TestCat", "limit_amount": None})
        assert resp.status_code == 409
    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM categories WHERE name = 'TestCat'")


@pytest.mark.asyncio
async def test_update_category(client: AsyncClient, pool):
    await login(client, "mod1")
    try:
        resp = await client.post(
            "/api/categories",
            json={"name": "UpdateMe", "limit_amount": 100.0},
        )
        assert resp.status_code == 201
        category_id = resp.json()["id"]

        resp = await client.patch(f"/api/categories/{category_id}", json={"name": "UpdatedName"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "UpdatedName"
        assert data["id"] == category_id
    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM categories WHERE name IN ('UpdateMe', 'UpdatedName')")


@pytest.mark.asyncio
async def test_deactivate_category(client: AsyncClient, pool):
    await login(client, "mod1")
    try:
        resp = await client.post(
            "/api/categories",
            json={"name": "DeactivateMe", "limit_amount": None},
        )
        assert resp.status_code == 201
        category_id = resp.json()["id"]

        resp = await client.delete(f"/api/categories/{category_id}")
        assert resp.status_code == 204

        resp = await client.get("/api/categories", params={"active_only": "false"})
        assert resp.status_code == 200
        all_cats = resp.json()
        match = next((c for c in all_cats if c["id"] == category_id), None)
        assert match is not None
        assert match["is_active"] is False

        resp = await client.get("/api/categories")
        assert resp.status_code == 200
        active_cats = resp.json()
        assert not any(c["id"] == category_id for c in active_cats)
    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM categories WHERE name = 'DeactivateMe'")


@pytest.mark.asyncio
async def test_list_users_mod_only(client: AsyncClient):
    await login(client, "tech1")
    resp = await client.get("/api/users")
    assert resp.status_code == 403

    await login(client, "mod1")
    resp = await client.get("/api/users")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_get_user(client: AsyncClient):
    await login(client, "mod1")
    resp = await client.get("/api/users")
    assert resp.status_code == 200
    users = resp.json()
    tech1 = next(u for u in users if u["username"] == "tech1")

    resp = await client.get(f"/api/users/{tech1['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == tech1["id"]
    assert data["username"] == "tech1"


@pytest.mark.asyncio
async def test_change_user_role(client: AsyncClient):
    await login(client, "mod1")
    resp = await client.get("/api/users")
    users = resp.json()
    tech1 = next(u for u in users if u["username"] == "tech1")

    try:
        resp = await client.put(f"/api/users/{tech1['id']}/role", json={"role": "manager"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "manager"
    finally:
        await client.put(f"/api/users/{tech1['id']}/role", json={"role": "technician"})


@pytest.mark.asyncio
async def test_cannot_change_own_role(client: AsyncClient):
    await login(client, "mod1")
    resp = await client.get("/api/users")
    users = resp.json()
    mod1 = next(u for u in users if u["username"] == "mod1")

    resp = await client.put(f"/api/users/{mod1['id']}/role", json={"role": "manager"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_invalid_role(client: AsyncClient):
    await login(client, "mod1")
    resp = await client.get("/api/users")
    users = resp.json()
    tech1 = next(u for u in users if u["username"] == "tech1")

    resp = await client.put(f"/api/users/{tech1['id']}/role", json={"role": "superadmin"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_deactivate_user(client: AsyncClient):
    await login(client, "mod1")
    resp = await client.get("/api/users")
    users = resp.json()
    tech1 = next(u for u in users if u["username"] == "tech1")

    try:
        resp = await client.put(f"/api/users/{tech1['id']}/active", json={"is_active": False})
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False
    finally:
        await client.put(f"/api/users/{tech1['id']}/active", json={"is_active": True})


@pytest.mark.asyncio
async def test_cannot_deactivate_self(client: AsyncClient):
    await login(client, "mod1")
    resp = await client.get("/api/users")
    users = resp.json()
    mod1 = next(u for u in users if u["username"] == "mod1")

    resp = await client.put(f"/api/users/{mod1['id']}/active", json={"is_active": False})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/users — local user creation (mod-only)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_mod_can_create_local_user(client: AsyncClient, pool):
    await login(client, "mod1")
    payload = {
        "username": "newuser_test",
        "display_name": "New User",
        "password": "password123",
        "role": "technician",
    }
    resp = await client.post("/api/users", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["username"] == "newuser_test"
    assert data["auth_source"] == "local"
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE username = 'newuser_test'")


@pytest.mark.asyncio
async def test_duplicate_username_returns_409(client: AsyncClient, pool):
    await login(client, "mod1")
    payload = {
        "username": "dup_user_test",
        "display_name": "Dup User",
        "password": "password123",
        "role": "technician",
    }
    resp = await client.post("/api/users", json=payload)
    assert resp.status_code == 201

    resp2 = await client.post("/api/users", json=payload)
    assert resp2.status_code == 409
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE username = 'dup_user_test'")


@pytest.mark.asyncio
async def test_non_mod_cannot_create_user(client: AsyncClient):
    await login(client, "tech1")
    payload = {
        "username": "shouldfail_test",
        "display_name": "Should Fail",
        "password": "password123",
        "role": "technician",
    }
    resp = await client.post("/api/users", json=payload)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_user_invalid_role(client: AsyncClient, pool):
    await login(client, "mod1")
    payload = {
        "username": "badrole_test",
        "display_name": "Bad Role User",
        "password": "password123",
        "role": "invalid",
    }
    resp = await client.post("/api/users", json=payload)
    assert resp.status_code == 400
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE username = 'badrole_test'")
