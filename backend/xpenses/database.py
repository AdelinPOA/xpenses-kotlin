import asyncpg
from .config import settings

_pool: asyncpg.Pool | None = None

CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    limit_amount DOUBLE PRECISION,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_reports (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    date_from TEXT,
    date_to TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id),
    report_id INTEGER REFERENCES expense_reports(id),
    amount_original DOUBLE PRECISION NOT NULL,
    currency_original TEXT NOT NULL DEFAULT 'EUR',
    amount_eur DOUBLE PRECISION NOT NULL,
    fx_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    date TEXT NOT NULL,
    description TEXT,
    merchant TEXT,
    receipt_path TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
    id SERIAL PRIMARY KEY,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    original_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fx_rates (
    id SERIAL PRIMARY KEY,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate_date TEXT NOT NULL,
    rate DOUBLE PRECISION NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(from_currency, to_currency, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_receipts_expense ON receipts(expense_id);
CREATE INDEX IF NOT EXISTS idx_expenses_report ON expenses(report_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_reports_status ON expense_reports(status);
"""

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
    import os
    os.makedirs(settings.receipts_dir, exist_ok=True)

    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=2,
        max_size=10,
    )

    async with _pool.acquire() as conn:
        # Execute DDL statements one by one (asyncpg doesn't support executescript)
        for statement in CREATE_TABLES.split(";"):
            statement = statement.strip()
            if statement:
                await conn.execute(statement)

        # Seed default categories
        for name, limit in DEFAULT_CATEGORIES:
            await conn.execute(
                "INSERT INTO categories (name, limit_amount) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
                name, limit,
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
