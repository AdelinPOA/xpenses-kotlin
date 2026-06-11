from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user, require_role
from ..database import get_db
from ..models import ActiveUpdate, RoleUpdate, UserOut


class UserCreate(BaseModel):
    username: str
    display_name: str
    password: str
    role: str
    email: str | None = None

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = ("technician", "manager", "chef_finance", "mod")


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Invalid role. Must be one of: {VALID_ROLES}")
    existing = await db.fetchrow("SELECT id FROM users WHERE username = $1", body.username)
    if existing:
        raise HTTPException(409, "Username already taken")
    from ..auth import hash_password
    pw_hash = hash_password(body.password)
    now = datetime.now(timezone.utc)
    row = await db.fetchrow(
        """INSERT INTO users (username, display_name, email, password_hash, auth_source, role, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'local', $5, true, $6, $6) RETURNING *""",
        body.username, body.display_name, body.email, pw_hash, body.role, now,
    )
    return dict(row)


@router.get("", response_model=list[UserOut])
async def list_users(
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    if current_user["role"] not in ("chef_finance", "manager", "mod"):
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = await db.fetch("SELECT * FROM users ORDER BY created_at")
    return [dict(r) for r in rows]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    if user_id != current_user["id"] and current_user["role"] not in ("chef_finance", "manager", "mod"):
        raise HTTPException(status_code=403, detail="Forbidden")
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


class UserUpdateMe(BaseModel):
    display_name: str | None = None
    notifications_enabled: bool | None = None


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdateMe,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    updates = []
    params = []
    
    if body.display_name is not None:
        updates.append(f"display_name = ${len(params) + 1}")
        params.append(body.display_name)
        
    if body.notifications_enabled is not None:
        updates.append(f"notifications_enabled = ${len(params) + 1}")
        params.append(body.notifications_enabled)
        
    if not updates:
        row = await db.fetchrow("SELECT * FROM users WHERE id = $1", current_user["id"])
        return dict(row)
        
    updates.append(f"updated_at = ${len(params) + 1}")
    params.append(datetime.now(timezone.utc))
    
    params.append(current_user["id"])
    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ${len(params)} RETURNING *"
    row = await db.fetchrow(query, *params)
    return dict(row)
