from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_role
from ..database import get_db
from ..models import ActiveUpdate, RoleUpdate, UserOut

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
