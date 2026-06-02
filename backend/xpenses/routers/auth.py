from datetime import datetime, timedelta, timezone
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response

from ..auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_refresh_token,
    verify_password,
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
        secure=settings.cookie_secure,
        max_age=settings.jwt_access_expires_minutes * 60,
    )
    response.set_cookie(
        "refresh_token", refresh, httponly=True, samesite="strict",
        secure=settings.cookie_secure,
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
        secure=settings.cookie_secure,
        max_age=settings.jwt_access_expires_minutes * 60,
    )
    response.set_cookie(
        "refresh_token", new_refresh, httponly=True, samesite="strict",
        secure=settings.cookie_secure,
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
