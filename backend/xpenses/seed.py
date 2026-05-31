from .auth import hash_password
from .config import settings
from .database import get_pool

SEED_USERS = [
    ("tech1", "tech1", "Ion Popescu", "ion.popescu@nt-automation.eu", "technician"),
    ("manager1", "manager1", "Maria Ionescu", "maria.ionescu@nt-automation.eu", "manager"),
    ("cfo1", "cfo1", "Elena Dumitrescu", "elena.dumitrescu@nt-automation.eu", "chef_finance"),
    ("mod1", "mod1", "Admin Xpenses", "admin@nt-automation.eu", "mod"),
]


async def seed_users() -> None:
    if not settings.seed_demo_users:
        return

    pool = get_pool()
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM users")
        if count > 0:
            return

        for username, password, display_name, email, role in SEED_USERS:
            await conn.execute(
                """INSERT INTO users (username, password_hash, display_name, email, role, auth_source)
                   VALUES ($1, $2, $3, $4, $5, 'local')
                   ON CONFLICT (username) DO NOTHING""",
                username, hash_password(password), display_name, email, role,
            )

        # Assign existing orphan expenses/reports to tech1
        tech1_id = await conn.fetchval("SELECT id FROM users WHERE username = 'tech1'")
        if tech1_id:
            await conn.execute("UPDATE expenses SET user_id = $1 WHERE user_id IS NULL", tech1_id)
            await conn.execute("UPDATE expense_reports SET user_id = $1 WHERE user_id IS NULL", tech1_id)
