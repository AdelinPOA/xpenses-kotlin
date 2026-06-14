import asyncpg

from .config import settings

_pool: asyncpg.Pool | None = None

DEFAULT_CATEGORIES = [
    ("Meals & Food", 200.0),
    ("Transport", 500.0),
    ("Accommodation", 1000.0),
    ("Equipment", None),
    ("Software & Subscriptions", None),
    ("Office Supplies", 300.0),
    ("Training & Education", None),
    ("Entertainment", 500.0),
    ("Laundry", None),
    ("Other", None),
]


async def init_db() -> None:
    import asyncio
    import os

    from alembic import command
    from alembic.config import Config

    os.makedirs(settings.receipts_dir, exist_ok=True)
    os.makedirs(settings.signatures_dir, exist_ok=True)

    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=2,
        max_size=10,
    )

    async with _pool.acquire() as conn:
        # Check if alembic_version table exists
        alembic_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='alembic_version')"
        )

        ini_path = os.path.join(os.path.dirname(__file__), "alembic.ini")
        alembic_cfg = Config(ini_path)

        if not alembic_exists:
            # Check if it's an existing database with tables already created
            users_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='users')"
            )
            if users_exists:
                # Stamp the database to the baseline revision so Alembic knows it is already current
                # and then upgrade to head to apply any subsequent migrations.
                await asyncio.to_thread(command.stamp, alembic_cfg, "a078be00200b")
                await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
            else:
                # Fresh database, run migrations up to head
                await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
            
            # Clean up the legacy migrations table if it exists
            await conn.execute("DROP TABLE IF EXISTS schema_migrations")
        else:
            # Upgrade database to head (apply any new migrations)
            await asyncio.to_thread(command.upgrade, alembic_cfg, "head")

        # Seed default categories
        for name, limit in DEFAULT_CATEGORIES:
            await conn.execute(
                "INSERT INTO categories (name, limit_amount) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
                name, limit,
            )

        # Seed default mileage rates
        for key, val in [("mileage_rate_before_tax", "0.60"), ("mileage_rate_after_tax", "0.40")]:
            await conn.execute(
                "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
                key, val,
            )


async def close_db() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    return _pool


async def get_db() -> asyncpg.Connection:
    async with _pool.acquire() as conn:
        yield conn
