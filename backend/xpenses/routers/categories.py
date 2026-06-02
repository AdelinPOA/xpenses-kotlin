import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user, require_role
from ..database import get_db
from ..models import CategoryCreate, CategoryOut, CategoryUpdate

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
    row = await db.fetchrow("SELECT * FROM categories WHERE id = $1", category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")

    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not fields:
        return dict(row)

    set_parts = []
    values = []
    for i, (k, v) in enumerate(fields.items(), start=1):
        set_parts.append(f"{k} = ${i}")
        values.append(v)
    set_clause = ", ".join(set_parts)
    values.append(category_id)
    await db.execute(
        f"UPDATE categories SET {set_clause} WHERE id = ${len(values)}",
        *values,
    )

    updated = await db.fetchrow("SELECT * FROM categories WHERE id = $1", category_id)
    return dict(updated)


@router.delete("/{category_id}", status_code=204)
async def deactivate_category(category_id: int, current_user: dict = require_role("mod"), db: asyncpg.Connection = Depends(get_db)):
    await db.execute("UPDATE categories SET is_active = false WHERE id = $1", category_id)
