import pytest
from httpx import AsyncClient

from tests.conftest import login


@pytest.mark.asyncio
async def test_list_users_permissions(client: AsyncClient, pool):
    # tech1 is forbidden
    await login(client, "tech1")
    resp = await client.get("/api/users")
    assert resp.status_code == 403

    # manager1 is allowed
    await login(client, "manager1")
    resp = await client.get("/api/users")
    assert resp.status_code == 200
    users = resp.json()
    assert len(users) >= 4

    # cfo1 is allowed
    await login(client, "cfo1")
    resp = await client.get("/api/users")
    assert resp.status_code == 200

    # mod1 is allowed
    await login(client, "mod1")
    resp = await client.get("/api/users")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_user_permissions(client: AsyncClient, pool):
    async with pool.acquire() as conn:
        tech1_id = await conn.fetchval("SELECT id FROM users WHERE username = 'tech1'")
        manager1_id = await conn.fetchval("SELECT id FROM users WHERE username = 'manager1'")

    # tech1 can retrieve self
    await login(client, "tech1")
    resp = await client.get(f"/api/users/{tech1_id}")
    assert resp.status_code == 200
    assert resp.json()["username"] == "tech1"

    # tech1 cannot retrieve manager1
    resp = await client.get(f"/api/users/{manager1_id}")
    assert resp.status_code == 403

    # manager1 can retrieve tech1
    await login(client, "manager1")
    resp = await client.get(f"/api/users/{tech1_id}")
    assert resp.status_code == 200
    assert resp.json()["username"] == "tech1"


@pytest.mark.asyncio
async def test_list_reports_filter_by_user_id(client: AsyncClient, pool):
    async with pool.acquire() as conn:
        tech1_id = await conn.fetchval("SELECT id FROM users WHERE username = 'tech1'")
        manager1_id = await conn.fetchval("SELECT id FROM users WHERE username = 'manager1'")

        # Create a report for tech1
        t_id = await conn.fetchval(
            "INSERT INTO expense_reports (title, description, user_id, status) VALUES ('Tech1 Report', 'desc', $1, 'submitted') RETURNING id",
            tech1_id
        )
        # Create a report for manager1
        m_id = await conn.fetchval(
            "INSERT INTO expense_reports (title, description, user_id, status) VALUES ('Manager1 Report', 'desc', $1, 'draft') RETURNING id",
            manager1_id
        )

    # Manager queries tech1 reports
    await login(client, "manager1")
    resp = await client.get(f"/api/reports?all=true&user_id={tech1_id}")
    assert resp.status_code == 200
    reports = resp.json()
    assert len(reports) == 1
    assert reports[0]["title"] == "Tech1 Report"

    # Tech queries manager reports (forbidden)
    await login(client, "tech1")
    resp = await client.get(f"/api/reports?all=true&user_id={manager1_id}")
    assert resp.status_code == 403

    # Clean up test reports
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM expense_reports WHERE id IN ($1, $2)", t_id, m_id)
