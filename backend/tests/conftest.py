import os

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

TEST_DB = "xpenses_test"
DB_HOST = os.getenv("TEST_DB_HOST", "db")
DB_PORT = os.getenv("TEST_DB_PORT", "5432")
ADMIN_DSN = f"postgresql://xpenses:xpenses@{DB_HOST}:{DB_PORT}/xpenses"
TEST_DSN = f"postgresql://xpenses:xpenses@{DB_HOST}:{DB_PORT}/{TEST_DB}"


@pytest_asyncio.fixture(scope="session", autouse=True)
async def test_db():
    """Create test database, run schema, seed users and categories."""
    sys_conn = await asyncpg.connect(ADMIN_DSN)
    await sys_conn.execute(
        f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
        f"WHERE datname = '{TEST_DB}' AND pid <> pg_backend_pid()"
    )
    await sys_conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")
    await sys_conn.execute(f"CREATE DATABASE {TEST_DB} OWNER xpenses")
    await sys_conn.close()

    from xpenses.config import settings

    object.__setattr__(settings, "database_url", TEST_DSN)
    object.__setattr__(settings, "seed_demo_users", True)
    object.__setattr__(settings, "cookie_secure", False)
    object.__setattr__(settings, "data_dir", "/tmp/xpenses_test_data")

    from xpenses.database import close_db, init_db
    from xpenses.seed import seed_users

    await init_db()
    await seed_users()

    yield

    await close_db()
    drop_conn = await asyncpg.connect(ADMIN_DSN)
    await drop_conn.execute(
        f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
        f"WHERE datname = '{TEST_DB}' AND pid <> pg_backend_pid()"
    )
    await drop_conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")
    await drop_conn.close()


@pytest_asyncio.fixture(autouse=True)
async def clean_tables():
    """Truncate transactional data after each test. Users + categories persist."""
    yield
    from xpenses.database import get_pool

    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM refresh_tokens")
        await conn.execute("DELETE FROM receipts")
        await conn.execute("DELETE FROM mileage_records")
        await conn.execute("DELETE FROM advance_payments")
        await conn.execute("DELETE FROM expenses")
        await conn.execute("DELETE FROM expense_reports")
        # Reset mileage rates to defaults after each test
        await conn.execute("UPDATE app_settings SET value = '0.60' WHERE key = 'mileage_rate_before_tax'")
        await conn.execute("UPDATE app_settings SET value = '0.40' WHERE key = 'mileage_rate_after_tax'")
        await conn.execute("UPDATE users SET signature_path = NULL WHERE signature_path IS NOT NULL")

    import glob
    import os

    from xpenses.config import settings
    for f in glob.glob(os.path.join(settings.signatures_dir, "*.png")):
        os.remove(f)


@pytest_asyncio.fixture
async def client():
    from xpenses.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def pool():
    from xpenses.database import get_pool

    return get_pool()


async def login(client: AsyncClient, username: str = "tech1", password: str | None = None):
    """Login helper. Returns the same client with auth cookies set."""
    if password is None:
        password = username
    resp = await client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert resp.status_code == 200, f"Login as {username} failed: {resp.text}"
    return client


async def create_expense(
    client: AsyncClient,
    *,
    amount: float = 50.0,
    currency: str = "EUR",
    date: str = "2026-01-15",
    merchant: str = "Test Shop",
    description: str = "Test expense",
    category_id: int | None = None,
    report_id: int | None = None,
) -> dict:
    """Create an expense and return the response JSON."""
    body = {
        "amount": amount,
        "currency": currency,
        "date": date,
        "merchant": merchant,
        "description": description,
    }
    if category_id is not None:
        body["category_id"] = category_id
    if report_id is not None:
        body["report_id"] = report_id
    resp = await client.post("/api/expenses", json=body)
    assert resp.status_code == 201, f"Create expense failed: {resp.text}"
    return resp.json()


def new_client() -> AsyncClient:
    """Create a fresh AsyncClient for multi-user tests."""
    from xpenses.main import app

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def create_report(
    client: AsyncClient,
    *,
    title: str = "Test Report",
    date_from: str = "2026-01-01",
    date_to: str = "2026-01-31",
) -> dict:
    """Create a report and return the response JSON."""
    resp = await client.post(
        "/api/reports",
        json={"title": title, "date_from": date_from, "date_to": date_to},
    )
    assert resp.status_code == 201, f"Create report failed: {resp.text}"
    return resp.json()


async def create_advance(
    client: AsyncClient,
    report_id: int,
    *,
    amount: float = 100.0,
    currency: str = "EUR",
    date: str = "2026-01-10",
    description: str = "Cash advance",
    advance_type: str = "paid",
) -> dict:
    """Create an advance payment and return the response JSON."""
    body: dict = {
        "type": advance_type,
        "amount": amount,
        "currency": currency,
        "description": description,
    }
    if advance_type == "paid":
        body["date"] = date
    resp = await client.post(
        f"/api/reports/{report_id}/advances",
        json=body,
    )
    assert resp.status_code == 201, f"Create advance failed: {resp.text}"
    return resp.json()


async def create_mileage(
    client: AsyncClient,
    report_id: int,
    *,
    origin: str = "Bucharest",
    destination: str = "Ploiesti",
    distance_km: float = 60.0,
    start_time: str = "2026-01-10T08:00:00Z",
    end_time: str = "2026-01-10T09:30:00Z",
    description: str | None = None,
) -> dict:
    body = {
        "origin": origin,
        "destination": destination,
        "distance_km": distance_km,
        "start_time": start_time,
        "end_time": end_time,
    }
    if description is not None:
        body["description"] = description
    resp = await client.post(f"/api/reports/{report_id}/mileage", json=body)
    assert resp.status_code == 201, f"Create mileage failed: {resp.text}"
    return resp.json()
