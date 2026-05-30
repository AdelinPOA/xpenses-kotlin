import aiosqlite
from .config import settings

DATABASE_PATH = settings.db_path

CREATE_TABLES = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    limit_amount REAL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expense_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date_from TEXT,
    date_to TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMP,
    paid_at TIMESTAMP,
    total_amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES categories(id),
    report_id INTEGER REFERENCES expense_reports(id),
    amount_original REAL NOT NULL,
    currency_original TEXT NOT NULL DEFAULT 'EUR',
    amount_eur REAL NOT NULL,
    fx_rate REAL NOT NULL DEFAULT 1.0,
    date TEXT NOT NULL,
    description TEXT,
    merchant TEXT,
    receipt_path TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    original_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipts_expense ON receipts(expense_id);
CREATE INDEX IF NOT EXISTS idx_expenses_report ON expenses(report_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_reports_status ON expense_reports(status);

CREATE TABLE IF NOT EXISTS fx_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate_date TEXT NOT NULL,
    rate REAL NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_currency, to_currency, rate_date)
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


async def _migrate_expenses_schema(db: aiosqlite.Connection) -> None:
    async with db.execute("PRAGMA table_info(expenses)") as c:
        columns = {row[1] for row in await c.fetchall()}

    if "amount" in columns and "amount_original" not in columns:
        await db.execute("BEGIN")
        await db.execute("ALTER TABLE expenses RENAME TO expenses_old")
        await db.execute("""
            CREATE TABLE expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER REFERENCES categories(id),
                report_id INTEGER REFERENCES expense_reports(id),
                amount_original REAL NOT NULL,
                currency_original TEXT NOT NULL DEFAULT 'EUR',
                amount_eur REAL NOT NULL,
                fx_rate REAL NOT NULL DEFAULT 1.0,
                date TEXT NOT NULL,
                description TEXT,
                merchant TEXT,
                receipt_path TEXT,
                status TEXT NOT NULL DEFAULT 'draft',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            INSERT INTO expenses
                (id, category_id, report_id, amount_original, currency_original,
                 amount_eur, fx_rate, date, description, merchant, receipt_path,
                 status, created_at, updated_at)
            SELECT id, category_id, report_id, amount, currency,
                   amount, 1.0, date, description, merchant, receipt_path,
                   status, created_at, updated_at
            FROM expenses_old
        """)
        await db.execute("DROP TABLE expenses_old")
        await db.commit()

    # Migrate fx_rates to include rate_date
    async with db.execute("PRAGMA table_info(fx_rates)") as c:
        fx_columns = {row[1] for row in await c.fetchall()}
    if fx_columns and "rate_date" not in fx_columns:
        await db.execute("DROP TABLE fx_rates")
        await db.commit()

    # Migrate receipt_path to receipts table
    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='receipts'"
    ) as c:
        has_receipts_table = await c.fetchone()
    if not has_receipts_table:
        await db.execute("""
            CREATE TABLE receipts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
                file_path TEXT NOT NULL,
                original_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("CREATE INDEX idx_receipts_expense ON receipts(expense_id)")
        await db.execute("""
            INSERT INTO receipts (expense_id, file_path, original_name)
            SELECT id, receipt_path, receipt_path
            FROM expenses WHERE receipt_path IS NOT NULL AND receipt_path != ''
        """)
        await db.commit()

    # Add date_from/date_to if missing
    async with db.execute("PRAGMA table_info(expense_reports)") as c:
        report_columns = {row[1] for row in await c.fetchall()}
    if "date_from" not in report_columns:
        await db.execute("ALTER TABLE expense_reports ADD COLUMN date_from TEXT")
        await db.execute("ALTER TABLE expense_reports ADD COLUMN date_to TEXT")
        await db.commit()

    # Update reports default currency
    await db.execute(
        "UPDATE expense_reports SET currency = 'EUR' WHERE currency != 'EUR'"
    )
    await db.commit()


async def init_db() -> None:
    import os
    os.makedirs(settings.data_dir, exist_ok=True)
    os.makedirs(settings.receipts_dir, exist_ok=True)

    async with aiosqlite.connect(DATABASE_PATH) as db:
        # Check if tables exist before migrating
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'"
        ) as c:
            has_expenses = await c.fetchone()
        if has_expenses:
            await _migrate_expenses_schema(db)

        await db.executescript(CREATE_TABLES)
        for name, limit in DEFAULT_CATEGORIES:
            await db.execute(
                "INSERT OR IGNORE INTO categories (name, limit_amount) VALUES (?, ?)",
                (name, limit),
            )
        await db.commit()


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys=ON")
    return db
