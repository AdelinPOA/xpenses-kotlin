# Authentication & Role-Based Access Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT-based authentication with four roles (technician, manager, chef_finance, mod) to the xpenses app, with local test accounts and preparation for future AD/LDAP.

**Architecture:** Backend issues JWT access tokens (15 min) and refresh tokens (7 days) as httpOnly cookies. A `get_current_user()` FastAPI dependency protects all routes. Role gating uses a `require_role()` dependency. Frontend uses Next.js middleware for route protection and a React AuthProvider for user state.

**Tech Stack:** FastAPI, asyncpg, PyJWT, bcrypt, Next.js 15, React 19, TanStack Query v5

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `backend/xpenses/auth.py` | JWT creation/verification, password hashing, `get_current_user()` and `require_role()` dependencies |
| `backend/xpenses/routers/auth.py` | Login, refresh, logout, /me endpoints |
| `backend/xpenses/routers/users.py` | User management (MOD only): list, get, change role, activate/deactivate |
| `backend/xpenses/seed.py` | Create test users on first startup |

### Backend — Modified Files

| File | Change |
|------|--------|
| `backend/pyproject.toml` | Add `PyJWT`, `bcrypt` dependencies |
| `backend/xpenses/config.py` | Add `JWT_SECRET`, `JWT_ACCESS_EXPIRES_MINUTES`, `JWT_REFRESH_EXPIRES_DAYS`, `LDAP_ENABLED`, `LDAP_HOST`, `LDAP_BASE_DN` settings |
| `backend/xpenses/database.py` | Add `users` and `refresh_tokens` tables to schema, add `user_id` columns to expenses/expense_reports, add `approved_by`/`approved_at`/`rejected_reason` to expense_reports |
| `backend/xpenses/models.py` | Add `UserOut`, `LoginRequest`, `RoleUpdate`, `ActiveUpdate` models; update `ReportOut` with approval fields |
| `backend/xpenses/main.py` | Register auth and users routers, call seed on startup |
| `backend/xpenses/routers/expenses.py` | Add `get_current_user` dependency, scope queries by `user_id` |
| `backend/xpenses/routers/reports.py` | Add auth dependencies, scope queries, add approve/reject endpoints, update pay to require chef_finance role |
| `backend/xpenses/routers/categories.py` | Add `require_role("mod")` dependency |
| `backend/xpenses/routers/dashboard.py` | Add auth, show personal stats for technician/manager, org-wide for chef_finance/mod |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `frontend/lib/auth.ts` | Auth types, auth API functions (login, logout, refresh, getMe) |
| `frontend/components/AuthProvider.tsx` | React context providing current user + role + logout |
| `frontend/middleware.ts` | Next.js middleware: redirect unauthenticated to /login |
| `frontend/app/login/page.tsx` | Login page (no sidebar) |
| `frontend/app/login/layout.tsx` | Login layout without sidebar |
| `frontend/app/approvals/page.tsx` | Approvals page (Manager, Chef of Finances) |
| `frontend/app/payments/page.tsx` | Payments page (Chef of Finances) |
| `frontend/app/admin/users/page.tsx` | User management page (MOD) |
| `frontend/app/(authenticated)/layout.tsx` | Layout with sidebar for authenticated routes |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `frontend/lib/api.ts` | Add `withCredentials: true` to axios, add `User` type |
| `frontend/components/layout/Sidebar.tsx` | Role-based nav items, user info at bottom, logout button |
| `frontend/components/Providers.tsx` | Wrap with AuthProvider |
| `frontend/app/layout.tsx` | Restructure for auth/unauth layouts |
| `frontend/app/expenses/page.tsx` | Already scoped by backend (no frontend changes needed) |
| `frontend/app/reports/page.tsx` | Add status badges for "approved"/"rejected" |
| `frontend/app/reports/[id]/page.tsx` | Show approval/rejection info |

---

## Task 1: Add Backend Dependencies

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add PyJWT and bcrypt to dependencies**

In `backend/pyproject.toml`, add to the `dependencies` list:

```toml
[project]
name = "xpenses"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi==0.115.2",
    "uvicorn[standard]==0.30.1",
    "asyncpg==0.30.0",
    "pydantic==2.9.2",
    "pydantic-settings==2.4.0",
    "python-multipart==0.0.9",
    "httpx==0.27.0",
    "aiofiles==24.1.0",
    "reportlab==4.2.5",
    "pypdf==4.3.1",
    "Pillow==10.4.0",
    "PyJWT==2.9.0",
    "bcrypt==4.2.1",
]
```

- [ ] **Step 2: Rebuild backend container**

Run: `docker compose up -d --build backend`
Expected: Container rebuilds with new packages installed.

- [ ] **Step 3: Verify packages installed**

Run: `docker exec xpenses-backend pip show PyJWT bcrypt`
Expected: Both packages show version info.

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml
git commit -m "feat(auth): add PyJWT and bcrypt dependencies"
```

---

## Task 2: Update Config with Auth Settings

**Files:**
- Modify: `backend/xpenses/config.py`

- [ ] **Step 1: Add auth-related settings to Settings class**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
import json
import secrets


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    cors_origins: list[str] = ["http://localhost:3000"]
    data_dir: str = "/app/data"
    default_currency: str = "EUR"
    database_url: str = "postgresql://xpenses:xpenses@localhost:5432/xpenses"
    company_name: str = "Newtech Automation"
    submitter_name: str = "Popescu Adelin"
    submitter_email: str = "adelin.popescu@nt-automation.eu"

    # Auth
    jwt_secret: str = secrets.token_hex(32)
    jwt_access_expires_minutes: int = 15
    jwt_refresh_expires_days: int = 7

    # LDAP (disabled until production)
    ldap_enabled: bool = False
    ldap_host: str = ""
    ldap_base_dn: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list) -> list[str]:
        if isinstance(v, str):
            v_stripped = v.strip()
            if v_stripped.startswith("["):
                return json.loads(v_stripped)
            return [origin.strip() for origin in v_stripped.split(",") if origin.strip()]
        return v

    @property
    def receipts_dir(self) -> str:
        return f"{self.data_dir}/receipts"


settings = Settings()
```

- [ ] **Step 2: Add JWT_SECRET to .env file**

Append to `.env`:
```
JWT_SECRET=dev-secret-change-in-production-xpenses-2026
```

- [ ] **Step 3: Verify settings load**

Run: `docker exec xpenses-backend python -c "from xpenses.config import settings; print(settings.jwt_secret[:10], settings.ldap_enabled)"`
Expected: prints the first 10 chars of the secret and `False`

- [ ] **Step 4: Commit**

```bash
git add backend/xpenses/config.py .env
git commit -m "feat(auth): add JWT and LDAP config settings"
```

---

## Task 3: Update Database Schema

**Files:**
- Modify: `backend/xpenses/database.py`

- [ ] **Step 1: Add users and refresh_tokens tables, alter existing tables**

Add to `CREATE_TABLES` string (after the existing table definitions, before the CREATE INDEX statements):

```sql
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    display_name  VARCHAR(200) NOT NULL,
    email         VARCHAR(200),
    password_hash VARCHAR(200),
    auth_source   VARCHAR(20) NOT NULL DEFAULT 'local',
    role          VARCHAR(20) NOT NULL DEFAULT 'technician',
    is_active     BOOLEAN NOT NULL DEFAULT true,
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
```

And add these indexes after the existing ones:

```sql
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_user ON expense_reports(user_id);
```

- [ ] **Step 2: Add migration logic in init_db for existing tables**

After the DDL execution loop in `init_db()`, add column migration:

```python
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

        # Add approval columns to expense_reports if missing
        for col, col_type in [("approved_by", "INTEGER REFERENCES users(id)"), ("approved_at", "TIMESTAMPTZ"), ("rejected_reason", "TEXT")]:
            col_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='expense_reports' AND column_name=$1)",
                col,
            )
            if not col_exists:
                await conn.execute(f"ALTER TABLE expense_reports ADD COLUMN {col} {col_type}")

        # Seed default categories
        for name, limit in DEFAULT_CATEGORIES:
            await conn.execute(
                "INSERT INTO categories (name, limit_amount) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
                name, limit,
            )
```

- [ ] **Step 3: Restart backend and verify tables exist**

Run: `docker compose restart backend && sleep 3 && docker exec xpenses-db psql -U xpenses -c "\dt"`
Expected: `users` and `refresh_tokens` tables appear in the list.

- [ ] **Step 4: Verify columns were added**

Run: `docker exec xpenses-db psql -U xpenses -c "SELECT column_name FROM information_schema.columns WHERE table_name='expenses' AND column_name='user_id'"`
Expected: returns `user_id`

- [ ] **Step 5: Commit**

```bash
git add backend/xpenses/database.py
git commit -m "feat(auth): add users and refresh_tokens tables, user_id columns"
```

---

## Task 4: Add Pydantic Models for Auth

**Files:**
- Modify: `backend/xpenses/models.py`

- [ ] **Step 1: Add auth-related models at the top of models.py (after imports)**

```python
# ── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: str
    email: str | None
    auth_source: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RoleUpdate(BaseModel):
    role: str


class ActiveUpdate(BaseModel):
    is_active: bool
```

- [ ] **Step 2: Update ReportOut model with approval fields**

```python
class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: str | None
    date_from: str | None
    date_to: str | None
    status: str
    submitted_at: datetime | None
    paid_at: datetime | None
    approved_by: int | None = None
    approved_at: datetime | None = None
    rejected_reason: str | None = None
    total_amount: float
    currency: str
    created_at: datetime
    updated_at: datetime
    expenses: list[ExpenseOut] = []
```

- [ ] **Step 3: Commit**

```bash
git add backend/xpenses/models.py
git commit -m "feat(auth): add auth and user Pydantic models"
```

---

## Task 5: Implement Auth Utilities (auth.py)

**Files:**
- Create: `backend/xpenses/auth.py`

- [ ] **Step 1: Create the auth module with JWT + password utilities and FastAPI dependencies**

```python
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Annotated

import bcrypt
import jwt
from fastapi import Cookie, Depends, HTTPException, status

from .config import settings
from .database import get_pool


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_access_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_expires_minutes),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def get_current_user(access_token: Annotated[str | None, Cookie()] = None) -> dict:
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(access_token)
    user_id = int(payload["sub"])
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id, username, display_name, email, role, is_active FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    user = dict(row)
    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account deactivated")
    return user


def require_role(*allowed_roles: str):
    async def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return Depends(role_checker)
```

- [ ] **Step 2: Verify module imports**

Run: `docker exec xpenses-backend python -c "from xpenses.auth import hash_password, verify_password, create_access_token; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/xpenses/auth.py
git commit -m "feat(auth): implement JWT + bcrypt auth utilities and FastAPI dependencies"
```

---

## Task 6: Implement Seed Script

**Files:**
- Create: `backend/xpenses/seed.py`

- [ ] **Step 1: Create seed module**

```python
from .auth import hash_password
from .database import get_pool

SEED_USERS = [
    ("tech1", "tech1", "Ion Popescu", "ion.popescu@nt-automation.eu", "technician"),
    ("manager1", "manager1", "Maria Ionescu", "maria.ionescu@nt-automation.eu", "manager"),
    ("cfo1", "cfo1", "Elena Dumitrescu", "elena.dumitrescu@nt-automation.eu", "chef_finance"),
    ("mod1", "mod1", "Admin Xpenses", "admin@nt-automation.eu", "mod"),
]


async def seed_users() -> None:
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/xpenses/seed.py
git commit -m "feat(auth): add seed script for test users"
```

---

## Task 7: Register Auth Router and Seed in main.py

**Files:**
- Modify: `backend/xpenses/main.py`

- [ ] **Step 1: Update main.py to include auth router, users router, and run seed**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .seed import seed_users
from .routers import categories, expenses, reports, dashboard, auth, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_users()
    yield


app = FastAPI(title="xpenses API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(categories.router)
app.include_router(expenses.router)
app.include_router(reports.router)
app.include_router(dashboard.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Create the auth router file**

See Task 8.

- [ ] **Step 3: Create the users router file**

See Task 9.

- [ ] **Step 4: Commit (after Tasks 8 and 9 are done)**

```bash
git add backend/xpenses/main.py
git commit -m "feat(auth): register auth and users routers, run seed on startup"
```

---

## Task 8: Implement Auth Router

**Files:**
- Create: `backend/xpenses/routers/auth.py`

- [ ] **Step 1: Create auth router with login, refresh, logout, me endpoints**

```python
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, Cookie
from typing import Annotated
import asyncpg

from ..auth import (
    verify_password,
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
    get_current_user,
)
from ..config import settings
from ..database import get_db
from ..models import LoginRequest, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(body: LoginRequest, response: Response, db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM users WHERE username = $1", body.username)
    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = dict(row)
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account deactivated")

    if user["auth_source"] == "local":
        if not user["password_hash"] or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
    elif user["auth_source"] == "ldap":
        if not settings.ldap_enabled:
            raise HTTPException(status_code=503, detail="LDAP authentication not configured")
        raise HTTPException(status_code=501, detail="LDAP not implemented yet")

    access = create_access_token(user["id"], user["username"], user["role"])
    refresh = create_refresh_token()
    refresh_hash = hash_refresh_token(refresh)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expires_days)

    await db.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user["id"], refresh_hash, expires_at,
    )

    response.set_cookie(
        "access_token", access, httponly=True, samesite="lax",
        max_age=settings.jwt_access_expires_minutes * 60,
    )
    response.set_cookie(
        "refresh_token", refresh, httponly=True, samesite="lax",
        max_age=settings.jwt_refresh_expires_days * 86400,
    )

    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "email": user["email"],
        "role": user["role"],
    }


@router.post("/refresh")
async def refresh_tokens(response: Response, refresh_token: Annotated[str | None, Cookie()] = None, db: asyncpg.Connection = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    token_hash = hash_refresh_token(refresh_token)
    row = await db.fetchrow(
        "SELECT rt.*, u.username, u.role, u.is_active FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token_hash = $1",
        token_hash,
    )

    if not row:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if row["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        await db.execute("DELETE FROM refresh_tokens WHERE id = $1", row["id"])
        raise HTTPException(status_code=401, detail="Refresh token expired")
    if not row["is_active"]:
        await db.execute("DELETE FROM refresh_tokens WHERE user_id = $1", row["user_id"])
        raise HTTPException(status_code=403, detail="Account deactivated")

    # Rotate: delete old, create new
    await db.execute("DELETE FROM refresh_tokens WHERE id = $1", row["id"])

    new_access = create_access_token(row["user_id"], row["username"], row["role"])
    new_refresh = create_refresh_token()
    new_refresh_hash = hash_refresh_token(new_refresh)
    new_expires = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expires_days)

    await db.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        row["user_id"], new_refresh_hash, new_expires,
    )

    response.set_cookie(
        "access_token", new_access, httponly=True, samesite="lax",
        max_age=settings.jwt_access_expires_minutes * 60,
    )
    response.set_cookie(
        "refresh_token", new_refresh, httponly=True, samesite="lax",
        max_age=settings.jwt_refresh_expires_days * 86400,
    )

    return {"status": "refreshed"}


@router.post("/logout")
async def logout(response: Response, refresh_token: Annotated[str | None, Cookie()] = None, db: asyncpg.Connection = Depends(get_db)):
    if refresh_token:
        token_hash = hash_refresh_token(refresh_token)
        await db.execute("DELETE FROM refresh_tokens WHERE token_hash = $1", token_hash)

    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"status": "logged out"}


@router.get("/me", response_model=UserOut)
async def get_me(current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM users WHERE id = $1", current_user["id"])
    return dict(row)
```

- [ ] **Step 2: Test login endpoint**

Run: `docker compose restart backend && sleep 3 && curl -s -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"username":"tech1","password":"tech1"}'`
Expected: JSON response with `id`, `username`, `display_name`, `role` fields. Cookies file shows `access_token` and `refresh_token`.

- [ ] **Step 3: Test /me endpoint**

Run: `curl -s -b /tmp/cookies.txt http://localhost:8001/api/auth/me`
Expected: Full user object for `tech1`.

- [ ] **Step 4: Test logout**

Run: `curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/logout`
Expected: `{"status": "logged out"}`, cookies cleared.

- [ ] **Step 5: Commit**

```bash
git add backend/xpenses/routers/auth.py
git commit -m "feat(auth): implement login, refresh, logout, /me endpoints"
```

---

## Task 9: Implement Users Router

**Files:**
- Create: `backend/xpenses/routers/users.py`

- [ ] **Step 1: Create users router (MOD-only)**

```python
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
import asyncpg

from ..auth import get_current_user, require_role
from ..database import get_db
from ..models import UserOut, RoleUpdate, ActiveUpdate

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = ("technician", "manager", "chef_finance", "mod")


@router.get("", response_model=list[UserOut])
async def list_users(
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    rows = await db.fetch("SELECT * FROM users ORDER BY created_at")
    return [dict(r) for r in rows]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


@router.put("/{user_id}/role", response_model=UserOut)
async def update_role(
    user_id: int,
    body: RoleUpdate,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {VALID_ROLES}")
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    row = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    await db.execute(
        "UPDATE users SET role = $1, updated_at = $2 WHERE id = $3",
        body.role, datetime.now(timezone.utc), user_id,
    )
    updated = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    return dict(updated)


@router.put("/{user_id}/active", response_model=UserOut)
async def update_active(
    user_id: int,
    body: ActiveUpdate,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    row = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    await db.execute(
        "UPDATE users SET is_active = $1, updated_at = $2 WHERE id = $3",
        body.is_active, datetime.now(timezone.utc), user_id,
    )

    # If deactivating, delete their refresh tokens
    if not body.is_active:
        await db.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user_id)

    updated = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    return dict(updated)
```

- [ ] **Step 2: Test user list as mod**

Run: `curl -s -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"username":"mod1","password":"mod1"}' && curl -s -b /tmp/cookies.txt http://localhost:8001/api/users`
Expected: JSON array with 4 users.

- [ ] **Step 3: Test role change**

Run: `curl -s -b /tmp/cookies.txt -X PUT http://localhost:8001/api/users/1/role -H "Content-Type: application/json" -d '{"role":"manager"}'`
Expected: User object with updated role.

- [ ] **Step 4: Test permission denied for non-mod**

Run: `curl -s -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"username":"tech1","password":"tech1"}' && curl -s -b /tmp/cookies.txt http://localhost:8001/api/users`
Expected: 403 Forbidden.

- [ ] **Step 5: Commit**

```bash
git add backend/xpenses/routers/users.py backend/xpenses/main.py
git commit -m "feat(auth): implement users router (MOD-only) and register all auth routers"
```

---

## Task 10: Protect Existing Routers with Auth

**Files:**
- Modify: `backend/xpenses/routers/expenses.py`
- Modify: `backend/xpenses/routers/reports.py`
- Modify: `backend/xpenses/routers/categories.py`
- Modify: `backend/xpenses/routers/dashboard.py`

- [ ] **Step 1: Update expenses.py — add auth, scope by user**

Add imports at top:
```python
from ..auth import get_current_user
```

Update `list_expenses` to accept current_user and filter by user_id:
```python
@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    report_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    conditions, params = [], []
    param_idx = 1

    # Scope to current user
    conditions.append(f"e.user_id = ${param_idx}")
    params.append(current_user["id"])
    param_idx += 1

    if report_id is not None:
        conditions.append(f"e.report_id = ${param_idx}")
        params.append(report_id)
        param_idx += 1
    if category_id is not None:
        conditions.append(f"e.category_id = ${param_idx}")
        params.append(category_id)
        param_idx += 1
    if status:
        conditions.append(f"e.status = ${param_idx}")
        params.append(status)
        param_idx += 1
    if from_date:
        conditions.append(f"e.date >= ${param_idx}")
        params.append(from_date)
        param_idx += 1
    if to_date:
        conditions.append(f"e.date <= ${param_idx}")
        params.append(to_date)
        param_idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await db.fetch(f"{EXPENSE_SELECT} {where} ORDER BY e.date DESC", *params)
    expenses = [dict(r) for r in rows]
    return await _enrich_with_receipts(db, expenses)
```

Update `create_expense` to set `user_id`:
```python
@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(body: ExpenseCreate, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    try:
        fx_rate = await get_rate(body.currency, body.date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(body.amount * fx_rate, 2)

    now = datetime.utcnow()
    row = await db.fetchrow(
        """INSERT INTO expenses
           (category_id, report_id, amount_original, currency_original, amount_eur, fx_rate,
            date, description, merchant, user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id""",
        body.category_id, body.report_id, body.amount, body.currency.upper(), amount_eur, fx_rate,
        body.date, body.description, body.merchant, current_user["id"], now, now,
    )
    new_id = row["id"]
    expense_row = await db.fetchrow(f"{EXPENSE_SELECT} WHERE e.id = $1", new_id)
    expenses = await _enrich_with_receipts(db, [dict(expense_row)])
    return expenses[0]
```

Add `current_user: dict = Depends(get_current_user)` parameter to all remaining endpoints (`get_expense`, `update_expense`, `delete_expense`, `upload_receipts`, `upload_receipt_compat`, `delete_single_receipt`, `get_single_receipt`, `get_receipt_compat`). For get/update/delete, add an ownership check:
```python
# After fetching the expense row
if row["user_id"] != current_user["id"]:
    raise HTTPException(status_code=403, detail="Not your expense")
```

- [ ] **Step 2: Update categories.py — require MOD role for write operations**

```python
from ..auth import get_current_user, require_role

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(active_only: bool = True, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    query = "SELECT * FROM categories"
    if active_only:
        query += " WHERE is_active = true"
    query += " ORDER BY name"
    rows = await db.fetch(query)
    return [dict(r) for r in rows]


@router.post("", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryCreate, current_user: dict = require_role("mod"), db: asyncpg.Connection = Depends(get_db)):
    try:
        row = await db.fetchrow(
            "INSERT INTO categories (name, limit_amount) VALUES ($1, $2) RETURNING id",
            body.name, body.limit_amount,
        )
        new_id = row["id"]
        row = await db.fetchrow("SELECT * FROM categories WHERE id = $1", new_id)
        return dict(row)
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="Category name already exists")


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(category_id: int, body: CategoryUpdate, current_user: dict = require_role("mod"), db: asyncpg.Connection = Depends(get_db)):
    # ... (same implementation, just added current_user param)


@router.delete("/{category_id}", status_code=204)
async def deactivate_category(category_id: int, current_user: dict = require_role("mod"), db: asyncpg.Connection = Depends(get_db)):
    await db.execute("UPDATE categories SET is_active = false WHERE id = $1", category_id)
```

- [ ] **Step 3: Update reports.py — add auth, scoping, approve/reject endpoints**

Add imports:
```python
from ..auth import get_current_user, require_role
```

Update `list_reports`:
```python
@router.get("", response_model=list[ReportOut])
async def list_reports(status: str | None = None, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    # Chef of finance and mod see all reports; others see only their own
    if current_user["role"] in ("chef_finance", "mod"):
        query = "SELECT * FROM expense_reports"
        params: list = []
        if status:
            query += " WHERE status = $1"
            params.append(status)
    else:
        query = "SELECT * FROM expense_reports WHERE user_id = $1"
        params = [current_user["id"]]
        if status:
            query += " AND status = $2"
            params.append(status)

    query += " ORDER BY created_at DESC"
    rows = await db.fetch(query, *params)
    result = []
    for row in rows:
        r = dict(row)
        expenses = await db.fetch(f"{EXPENSE_SELECT} WHERE e.report_id = $1", r["id"])
        r["expenses"] = await _enrich_expenses_receipts(db, [dict(e) for e in expenses])
        result.append(r)
    return result
```

Update `create_report` to set `user_id`:
```python
@router.post("", response_model=ReportOut, status_code=201)
async def create_report(body: ReportCreate, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    now = datetime.utcnow()
    row = await db.fetchrow(
        "INSERT INTO expense_reports (title, description, date_from, date_to, currency, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        body.title, body.description, body.date_from, body.date_to, body.currency.upper(), current_user["id"], now, now,
    )
    return await _fetch_report(db, row["id"])
```

Add `current_user` to all other endpoints (get, update, delete, attach, submit, recall, pay, export, receipts-zip). For update/delete/attach/submit/recall, verify ownership:
```python
if row["user_id"] != current_user["id"]:
    raise HTTPException(status_code=403, detail="Not your report")
```

Add approve and reject endpoints:
```python
@router.post("/{report_id}/approve", response_model=ReportOut)
async def approve_report(
    report_id: int,
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["status"] != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted reports can be approved")
    if row["user_id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot approve your own report")

    now = datetime.utcnow()
    await db.execute(
        "UPDATE expense_reports SET status = 'approved', approved_by = $1, approved_at = $2, updated_at = $3 WHERE id = $4",
        current_user["id"], now, now, report_id,
    )
    await db.execute(
        "UPDATE expenses SET status = 'approved', updated_at = $1 WHERE report_id = $2",
        now, report_id,
    )
    return await _fetch_report(db, report_id)


class RejectBody(BaseModel):
    reason: str = ""


@router.post("/{report_id}/reject", response_model=ReportOut)
async def reject_report(
    report_id: int,
    body: RejectBody = RejectBody(),
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["status"] != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted reports can be rejected")
    if row["user_id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot reject your own report")

    now = datetime.utcnow()
    await db.execute(
        "UPDATE expense_reports SET status = 'rejected', approved_by = $1, approved_at = $2, rejected_reason = $3, updated_at = $4 WHERE id = $5",
        current_user["id"], now, body.reason, now, report_id,
    )
    await db.execute(
        "UPDATE expenses SET status = 'draft', report_id = NULL, updated_at = $1 WHERE report_id = $2",
        now, report_id,
    )
    return await _fetch_report(db, report_id)
```

Update `pay_report` to require `chef_finance` role:
```python
@router.post("/{report_id}/pay", response_model=ReportOut)
async def pay_report(report_id: int, current_user: dict = require_role("chef_finance"), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT status FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["status"] != "approved":
        raise HTTPException(status_code=400, detail="Only approved reports can be marked as paid")

    now = datetime.utcnow()
    await db.execute(
        "UPDATE expense_reports SET status = 'paid', paid_at = $1, updated_at = $2 WHERE id = $3",
        now, now, report_id,
    )
    await db.execute(
        "UPDATE expenses SET status = 'paid', updated_at = $1 WHERE report_id = $2",
        now, report_id,
    )
    return await _fetch_report(db, report_id)
```

- [ ] **Step 4: Update dashboard.py — personal vs org-wide stats**

```python
from ..auth import get_current_user

@router.get("", response_model=DashboardStats)
async def get_dashboard(current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    now = datetime.utcnow()
    month_start = f"{now.year}-{now.month:02d}-01"

    # Chef of finance and mod see org-wide; others see personal
    user_filter = ""
    user_params: list = []
    if current_user["role"] not in ("chef_finance", "mod"):
        user_filter = " AND e.user_id = $2" if "e." in "e" else " AND user_id = $2"
        user_params = [current_user["id"]]

    # Build queries with optional user filter
    if user_params:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expenses WHERE user_id = $1", current_user["id"])
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expenses")
    expense_count_total = row["cnt"]

    if user_params:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expenses WHERE date >= $1 AND user_id = $2", month_start, current_user["id"])
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expenses WHERE date >= $1", month_start)
    expense_count_month = row["cnt"]

    if user_params:
        row = await db.fetchrow("SELECT COALESCE(SUM(amount_eur), 0) as total FROM expenses WHERE date >= $1 AND user_id = $2", month_start, current_user["id"])
    else:
        row = await db.fetchrow("SELECT COALESCE(SUM(amount_eur), 0) as total FROM expenses WHERE date >= $1", month_start)
    total_month_eur = row["total"]

    if user_params:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'draft' AND user_id = $1", current_user["id"])
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'draft'")
    draft_count = row["cnt"]

    if user_params:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'submitted' AND user_id = $1", current_user["id"])
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'submitted'")
    submitted_count = row["cnt"]

    if user_params:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'paid' AND user_id = $1", current_user["id"])
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'paid'")
    paid_count = row["cnt"]

    if user_params:
        rows = await db.fetch(
            """SELECT e.category_id, COALESCE(c.name, 'Uncategorized') as category_name,
                      SUM(e.amount_eur) as total, COUNT(*) as count
               FROM expenses e
               LEFT JOIN categories c ON e.category_id = c.id
               WHERE e.date >= $1 AND e.user_id = $2
               GROUP BY e.category_id, c.name
               ORDER BY total DESC LIMIT 10""",
            month_start, current_user["id"],
        )
    else:
        rows = await db.fetch(
            """SELECT e.category_id, COALESCE(c.name, 'Uncategorized') as category_name,
                      SUM(e.amount_eur) as total, COUNT(*) as count
               FROM expenses e
               LEFT JOIN categories c ON e.category_id = c.id
               WHERE e.date >= $1
               GROUP BY e.category_id, c.name
               ORDER BY total DESC LIMIT 10""",
            month_start,
        )
    spend_by_category = [
        CategorySpend(category_id=r["category_id"], category_name=r["category_name"], total=r["total"], count=r["count"])
        for r in rows
    ]

    if user_params:
        rows = await db.fetch(f"{EXPENSE_SELECT} WHERE e.user_id = $1 ORDER BY e.created_at DESC LIMIT 10", current_user["id"])
    else:
        rows = await db.fetch(f"{EXPENSE_SELECT} ORDER BY e.created_at DESC LIMIT 10")
    recent = [dict(r) for r in rows]

    if recent:
        ids = [e["id"] for e in recent]
        rcpt_rows = await db.fetch("SELECT * FROM receipts WHERE expense_id = ANY($1::int[]) ORDER BY created_at", ids)
        all_rcpts = [dict(r) for r in rcpt_rows]
        by_exp: dict[int, list] = {}
        for r in all_rcpts:
            by_exp.setdefault(r["expense_id"], []).append(r)
        for e in recent:
            e["receipts"] = by_exp.get(e["id"], [])

    return DashboardStats(
        expense_count_total=expense_count_total,
        expense_count_month=expense_count_month,
        total_month_eur=total_month_eur,
        draft_count=draft_count,
        submitted_count=submitted_count,
        paid_count=paid_count,
        spend_by_category=spend_by_category,
        recent_expenses=recent,
    )
```

- [ ] **Step 5: Rebuild and test**

Run: `docker compose up -d --build backend && sleep 3 && curl -s http://localhost:8001/api/health`
Expected: `{"status":"ok"}`

Run: `curl -s -X GET http://localhost:8001/api/expenses`
Expected: 401 Unauthorized (no longer public).

Run: `curl -s -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"username":"tech1","password":"tech1"}' && curl -s -b /tmp/cookies.txt http://localhost:8001/api/expenses`
Expected: List of expenses for tech1.

- [ ] **Step 6: Commit**

```bash
git add backend/xpenses/routers/expenses.py backend/xpenses/routers/reports.py backend/xpenses/routers/categories.py backend/xpenses/routers/dashboard.py
git commit -m "feat(auth): protect all routers with auth, scope data by user, add approve/reject"
```

---

## Task 11: Frontend — Auth Types and API Client Update

**Files:**
- Create: `frontend/lib/auth.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Update api.ts to include credentials (cookies)**

```typescript
import axios from "axios";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

export default api;

// ... rest of types unchanged ...
```

Add `User` type at the end of the file:

```typescript
export interface User {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: "technician" | "manager" | "chef_finance" | "mod";
  is_active: boolean;
  auth_source: string;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Create auth.ts with auth API functions**

```typescript
import api, { User } from "./api";

export async function login(username: string, password: string): Promise<User> {
  const { data } = await api.post("/auth/login", { username, password });
  return data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function refreshTokens(): Promise<void> {
  await api.post("/auth/refresh");
}

export async function getMe(): Promise<User> {
  const { data } = await api.get("/auth/me");
  return data;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/auth.ts frontend/lib/api.ts
git commit -m "feat(auth): add auth API functions and withCredentials to axios"
```

---

## Task 12: Frontend — AuthProvider and useAuth Hook

**Files:**
- Create: `frontend/components/AuthProvider.tsx`
- Modify: `frontend/components/Providers.tsx`

- [ ] **Step 1: Create AuthProvider**

```tsx
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { User } from "@/lib/api";
import { getMe, logout as apiLogout, refreshTokens } from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  setUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 2: Update Providers.tsx to include AuthProvider**

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import AuthProvider from "./AuthProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/AuthProvider.tsx frontend/components/Providers.tsx
git commit -m "feat(auth): add AuthProvider with useAuth hook"
```

---

## Task 13: Frontend — Next.js Middleware for Route Protection

**Files:**
- Create: `frontend/middleware.ts`

- [ ] **Step 1: Create middleware.ts in frontend root**

```typescript
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require auth
  if (pathname === "/login" || pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname === "/favicon.ico" || pathname.endsWith(".png")) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token");
  if (!accessToken) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/middleware.ts
git commit -m "feat(auth): add Next.js middleware for route protection"
```

---

## Task 14: Frontend — Login Page

**Files:**
- Create: `frontend/app/login/layout.tsx`
- Create: `frontend/app/login/page.tsx`

- [ ] **Step 1: Create login layout (no sidebar)**

```tsx
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Create login page**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import Image from "next/image";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(username, password);
      setUser(user);
      router.push("/dashboard");
    } catch {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Image src="/logo.png" alt="Newtech Automation" width={56} height={56} className="rounded-full mb-3" />
          <h1 className="text-xl font-bold text-slate-800">xpenses</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/login/
git commit -m "feat(auth): add login page"
```

---

## Task 15: Frontend — Update Sidebar with Role-Based Nav and Logout

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar with role-aware navigation**

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, FileText, Tag, Users, CheckSquare, Banknote, LogOut } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: string[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/expenses", label: "Expenses", icon: Receipt, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/reports", label: "Reports", icon: FileText, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, roles: ["manager", "chef_finance"] },
  { href: "/payments", label: "Payments", icon: Banknote, roles: ["chef_finance"] },
  { href: "/categories", label: "Categories", icon: Tag, roles: ["mod"] },
  { href: "/admin/users", label: "Users", icon: Users, roles: ["mod"] },
];

const ROLE_LABELS: Record<string, string> = {
  technician: "Technician",
  manager: "Manager",
  chef_finance: "Chef of Finances",
  mod: "Moderator",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const visibleNav = NAV.filter((item) => user && item.roles.includes(user.role));

  return (
    <aside className="fixed top-0 left-0 h-full w-[220px] bg-slate-900 text-slate-200 flex flex-col z-20">
      <div className="px-6 py-4 border-b border-slate-700 flex flex-col items-center gap-2">
        <Image src="/logo.png" alt="Newtech Automation" width={48} height={48} className="rounded-full" />
        <span className="text-lg font-bold text-white tracking-tight">xpenses</span>
      </div>
      <nav className="flex-1 py-4 px-3">
        {visibleNav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-slate-700">
        {user && (
          <div className="mb-3">
            <p className="text-sm font-medium text-white truncate">{user.display_name}</p>
            <p className="text-xs text-slate-400">{ROLE_LABELS[user.role] || user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/layout/Sidebar.tsx
git commit -m "feat(auth): role-based sidebar navigation with user info and logout"
```

---

## Task 16: Frontend — Authenticated Layout Wrapper

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/dashboard/page.tsx` (if it imports Sidebar directly)

- [ ] **Step 1: Update root layout to conditionally show sidebar**

The root layout stays minimal. The sidebar is already included in the dashboard/expenses/reports pages via their own layouts or direct import. We need to ensure the login page doesn't show it.

Check current page.tsx — it redirects to /dashboard:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

This is fine — the middleware will catch unauthenticated users before the redirect.

- [ ] **Step 2: Ensure Sidebar is imported in pages that need it**

The existing pages already import Sidebar. The login page has its own layout without it. No changes needed here if the current structure already works this way. Verify by checking if Sidebar is in a shared layout or per-page.

Check current `frontend/app/dashboard/page.tsx` — if Sidebar is there, it's fine. The login layout overrides without sidebar.

- [ ] **Step 3: Commit (if any changes were needed)**

```bash
git add frontend/app/
git commit -m "feat(auth): ensure authenticated layout uses sidebar, login does not"
```

---

## Task 17: Frontend — Approvals Page

**Files:**
- Create: `frontend/app/approvals/page.tsx`

- [ ] **Step 1: Create approvals page**

```tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Report } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/layout/Sidebar";
import { CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";

export default function ApprovalsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["reports", "submitted"],
    queryFn: async () => {
      const { data } = await api.get("/reports?status=submitted");
      return data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: (reportId: number) => api.post(`/reports/${reportId}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ reportId, reason }: { reportId: number; reason: string }) =>
      api.post(`/reports/${reportId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      setRejectingId(null);
      setRejectReason("");
    },
  });

  if (!user || !["manager", "chef_finance"].includes(user.role)) {
    return <div className="ml-[220px] p-8">Access denied</div>;
  }

  // Filter out own reports
  const pendingReports = reports.filter((r) => r.user_id !== user.id);

  return (
    <div className="ml-[220px]">
      <Sidebar />
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Pending Approvals</h1>
        {isLoading ? (
          <p className="text-slate-500">Loading...</p>
        ) : pendingReports.length === 0 ? (
          <p className="text-slate-500">No reports pending approval.</p>
        ) : (
          <div className="space-y-4">
            {pendingReports.map((report) => (
              <div key={report.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">{report.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {report.date_from} — {report.date_to} | {report.expenses.length} expenses | {report.total_amount.toFixed(2)} {report.currency}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveMutation.mutate(report.id)}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={() => setRejectingId(report.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
                {rejectingId === report.id && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Reason for rejection (optional)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                    />
                    <button
                      onClick={() => rejectMutation.mutate({ reportId: report.id, reason: rejectReason })}
                      disabled={rejectMutation.isPending}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectReason(""); }}
                      className="px-3 py-1.5 text-slate-600 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

Note: The `Report` type in `api.ts` needs a `user_id` field added:
```typescript
export interface Report {
  id: number;
  title: string;
  // ... existing fields ...
  user_id?: number;  // add this
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/approvals/ frontend/lib/api.ts
git commit -m "feat(auth): add approvals page for managers"
```

---

## Task 18: Frontend — Payments Page

**Files:**
- Create: `frontend/app/payments/page.tsx`

- [ ] **Step 1: Create payments page**

```tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Report } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/layout/Sidebar";
import { Banknote } from "lucide-react";

export default function PaymentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["reports", "approved"],
    queryFn: async () => {
      const { data } = await api.get("/reports?status=approved");
      return data;
    },
  });

  const payMutation = useMutation({
    mutationFn: (reportId: number) => api.post(`/reports/${reportId}/pay`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  if (!user || user.role !== "chef_finance") {
    return <div className="ml-[220px] p-8">Access denied</div>;
  }

  return (
    <div className="ml-[220px]">
      <Sidebar />
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Payments</h1>
        {isLoading ? (
          <p className="text-slate-500">Loading...</p>
        ) : reports.length === 0 ? (
          <p className="text-slate-500">No approved reports awaiting payment.</p>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">{report.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {report.date_from} — {report.date_to} | {report.total_amount.toFixed(2)} {report.currency}
                    </p>
                  </div>
                  <button
                    onClick={() => payMutation.mutate(report.id)}
                    disabled={payMutation.isPending}
                    className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Banknote className="w-4 h-4" /> Mark as Paid
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/payments/
git commit -m "feat(auth): add payments page for chef of finances"
```

---

## Task 19: Frontend — User Management Page (MOD)

**Files:**
- Create: `frontend/app/admin/users/page.tsx`

- [ ] **Step 1: Create user management page**

```tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { User } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/layout/Sidebar";
import { Shield, ShieldOff } from "lucide-react";
import { useState } from "react";

const ROLES = [
  { value: "technician", label: "Technician" },
  { value: "manager", label: "Manager" },
  { value: "chef_finance", label: "Chef of Finances" },
  { value: "mod", label: "Moderator" },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await api.get("/users");
      return data;
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.put(`/users/${userId}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const activeMutation = useMutation({
    mutationFn: ({ userId, is_active }: { userId: number; is_active: boolean }) =>
      api.put(`/users/${userId}/active`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  if (!currentUser || currentUser.role !== "mod") {
    return <div className="ml-[220px] p-8">Access denied</div>;
  }

  return (
    <div className="ml-[220px]">
      <Sidebar />
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">User Management</h1>
        {isLoading ? (
          <p className="text-slate-500">Loading...</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">User</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Username</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className={!u.is_active ? "opacity-50" : ""}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{u.display_name}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.username}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => roleMutation.mutate({ userId: u.id, role: e.target.value })}
                        disabled={u.id === currentUser.id}
                        className="px-2 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.id !== currentUser.id && (
                        <button
                          onClick={() => activeMutation.mutate({ userId: u.id, is_active: !u.is_active })}
                          className="text-slate-500 hover:text-slate-700"
                          title={u.is_active ? "Deactivate" : "Activate"}
                        >
                          {u.is_active ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/admin/
git commit -m "feat(auth): add user management page for MOD role"
```

---

## Task 20: Frontend — Update Report Status Badges and Detail

**Files:**
- Modify: `frontend/app/reports/page.tsx`
- Modify: `frontend/app/reports/[id]/page.tsx`

- [ ] **Step 1: Update status badge rendering to include "approved" and "rejected"**

In any component that renders report status badges, ensure the color mapping includes:
```typescript
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-green-100 text-green-700",
};
```

- [ ] **Step 2: In report detail page, show approval/rejection info**

After the report status section, add:
```tsx
{report.status === "approved" && report.approved_at && (
  <div className="text-sm text-slate-500 mt-2">
    Approved on {new Date(report.approved_at).toLocaleDateString()}
  </div>
)}
{report.status === "rejected" && (
  <div className="text-sm text-red-600 mt-2">
    Rejected{report.rejected_reason ? `: ${report.rejected_reason}` : ""}
  </div>
)}
```

- [ ] **Step 3: Update Report interface in api.ts**

Add the approval fields:
```typescript
export interface Report {
  id: number;
  title: string;
  description: string | null;
  date_from: string | null;
  date_to: string | null;
  status: string;
  submitted_at: string | null;
  paid_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  rejected_reason: string | null;
  user_id: number | null;
  total_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  expenses: Expense[];
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/reports/ frontend/lib/api.ts
git commit -m "feat(auth): update report status badges and detail for approve/reject flow"
```

---

## Task 21: Integration Test — Full Workflow

- [ ] **Step 1: Rebuild everything**

Run: `docker compose up -d --build`
Expected: All 3 containers healthy.

- [ ] **Step 2: Test login flow in browser**

Open http://localhost:3001 — should redirect to /login.
Login as `tech1` / `tech1` — should land on /dashboard.
Sidebar should show: Dashboard, Expenses, Reports.

- [ ] **Step 3: Test role-based access**

Login as `manager1` / `manager1` — sidebar should show Approvals tab.
Login as `cfo1` / `cfo1` — sidebar should show Approvals + Payments.
Login as `mod1` / `mod1` — sidebar should show Categories + Users.

- [ ] **Step 4: Test approval workflow**

1. As `tech1`: create expense, create report, attach expense, submit report.
2. As `manager1`: go to /approvals, approve the report.
3. As `cfo1`: go to /payments, mark as paid.
4. As `tech1`: verify report shows status "paid".

- [ ] **Step 5: Test user management**

As `mod1`: go to /admin/users, change tech1's role to manager, verify it updates.
Change back to technician.

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "feat(auth): Phase 4 complete — authentication and role-based access control"
git push origin main
```

---

## Summary of Commits

1. `feat(auth): add PyJWT and bcrypt dependencies`
2. `feat(auth): add JWT and LDAP config settings`
3. `feat(auth): add users and refresh_tokens tables, user_id columns`
4. `feat(auth): add auth and user Pydantic models`
5. `feat(auth): implement JWT + bcrypt auth utilities and FastAPI dependencies`
6. `feat(auth): add seed script for test users`
7. `feat(auth): implement login, refresh, logout, /me endpoints`
8. `feat(auth): implement users router (MOD-only) and register all auth routers`
9. `feat(auth): protect all routers with auth, scope data by user, add approve/reject`
10. `feat(auth): add auth API functions and withCredentials to axios`
11. `feat(auth): add AuthProvider with useAuth hook`
12. `feat(auth): add Next.js middleware for route protection`
13. `feat(auth): add login page`
14. `feat(auth): role-based sidebar navigation with user info and logout`
15. `feat(auth): ensure authenticated layout uses sidebar, login does not`
16. `feat(auth): add approvals page for managers`
17. `feat(auth): add payments page for chef of finances`
18. `feat(auth): add user management page for MOD role`
19. `feat(auth): update report status badges and detail for approve/reject flow`
20. `feat(auth): Phase 4 complete — authentication and role-based access control`
