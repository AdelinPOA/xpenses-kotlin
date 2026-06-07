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
    signer_id INTEGER,
    signed_at TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    display_name  VARCHAR(200) NOT NULL,
    email         VARCHAR(200),
    password_hash VARCHAR(200),
    auth_source   VARCHAR(20) NOT NULL DEFAULT 'local',
    role          VARCHAR(20) NOT NULL DEFAULT 'technician',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    signature_path TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(200) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advance_payments (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount_original DOUBLE PRECISION NOT NULL,
    currency_original TEXT NOT NULL DEFAULT 'EUR',
    amount_eur DOUBLE PRECISION NOT NULL,
    fx_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    date TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_expense ON receipts(expense_id);
CREATE INDEX IF NOT EXISTS idx_expenses_report ON expenses(report_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_reports_status ON expense_reports(status);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_advance_payments_report ON advance_payments(report_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_user ON advance_payments(user_id);

CREATE TABLE IF NOT EXISTS mileage_records (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    rate_before_tax DOUBLE PRECISION NOT NULL,
    rate_after_tax DOUBLE PRECISION NOT NULL,
    amount_before_tax DOUBLE PRECISION NOT NULL,
    amount_eur DOUBLE PRECISION NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mileage_records_report ON mileage_records(report_id);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
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
    os.makedirs(settings.signatures_dir, exist_ok=True)

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

        # Add user_id columns if missing (migration from pre-auth schema)
        for table in ("expenses", "expense_reports"):
            col_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name='user_id')",
                table,
            )
            if not col_exists:
                await conn.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id)")

        # Indexes on user_id (must come after column migration)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_reports_user ON expense_reports(user_id)")

        # Tax columns migration
        await conn.execute("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_amount NUMERIC NOT NULL DEFAULT 0.0;")
        await conn.execute("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_rate NUMERIC;")
        await conn.execute("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_amount_eur NUMERIC NOT NULL DEFAULT 0.0;")

        # Add signature columns to expense_reports if missing
        for col, col_type in [("signer_id", "INTEGER REFERENCES users(id)"), ("signed_at", "TIMESTAMPTZ")]:
            col_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='expense_reports' AND column_name=$1)",
                col,
            )
            if not col_exists:
                await conn.execute(f"ALTER TABLE expense_reports ADD COLUMN {col} {col_type}")

        # Add signature_path to users if missing
        sig_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='signature_path')",
        )
        if not sig_exists:
            await conn.execute("ALTER TABLE users ADD COLUMN signature_path TEXT")

        # Add approval columns to expense_reports if missing
        for col, col_type in [("approved_by", "INTEGER REFERENCES users(id)"), ("approved_at", "TIMESTAMPTZ"), ("rejected_reason", "TEXT")]:
            col_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='expense_reports' AND column_name=$1)",
                col,
            )
            if not col_exists:
                await conn.execute(f"ALTER TABLE expense_reports ADD COLUMN {col} {col_type}")

        # Add advance_payments workflow columns if missing
        for col, col_type in [
            ("status", "TEXT DEFAULT 'paid'"),
            ("requested_amount", "DOUBLE PRECISION"),
            ("requested_currency", "TEXT"),
            ("paid_by", "INTEGER REFERENCES users(id)"),
            ("paid_at", "TIMESTAMPTZ"),
            ("rejected_by", "INTEGER REFERENCES users(id)"),
            ("rejected_at", "TIMESTAMPTZ"),
        ]:
            col_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='advance_payments' AND column_name=$1)",
                col,
            )
            if not col_exists:
                await conn.execute(f"ALTER TABLE advance_payments ADD COLUMN {col} {col_type}")

        # Backfill status for existing rows that have NULL status
        await conn.execute("UPDATE advance_payments SET status = 'paid' WHERE status IS NULL")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_advance_payments_status ON advance_payments(status)")

        # Seed default categories
        for name, limit in DEFAULT_CATEGORIES:
            await conn.execute(
                "INSERT INTO categories (name, limit_amount) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
                name, limit,
            )

        # Migrate mileage_records: date TEXT → start_time/end_time TIMESTAMPTZ
        date_col_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='mileage_records' AND column_name='date')",
        )
        if date_col_exists:
            st_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='mileage_records' AND column_name='start_time')",
            )
            if not st_exists:
                await conn.execute("ALTER TABLE mileage_records ADD COLUMN start_time TIMESTAMPTZ")
                await conn.execute("ALTER TABLE mileage_records ADD COLUMN end_time TIMESTAMPTZ")
                await conn.execute("UPDATE mileage_records SET start_time = (date || 'T08:00:00Z')::timestamptz WHERE start_time IS NULL AND date IS NOT NULL")
                await conn.execute("UPDATE mileage_records SET end_time = start_time + interval '1 hour' WHERE end_time IS NULL AND start_time IS NOT NULL")
                await conn.execute("ALTER TABLE mileage_records ALTER COLUMN start_time SET NOT NULL")
                await conn.execute("ALTER TABLE mileage_records ALTER COLUMN end_time SET NOT NULL")
            await conn.execute("ALTER TABLE mileage_records DROP COLUMN IF EXISTS date")

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
