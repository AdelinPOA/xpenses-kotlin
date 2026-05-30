from fastapi import APIRouter, HTTPException
import aiosqlite
from ..database import get_db
from ..models import CategoryOut, CategoryCreate, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(active_only: bool = True):
    db = await get_db()
    try:
        query = "SELECT * FROM categories"
        if active_only:
            query += " WHERE is_active = 1"
        query += " ORDER BY name"
        async with db.execute(query) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.post("", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryCreate):
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO categories (name, limit_amount) VALUES (?, ?)",
            (body.name, body.limit_amount),
        )
        await db.commit()
        async with db.execute("SELECT * FROM categories WHERE id = ?", (cursor.lastrowid,)) as c:
            row = await c.fetchone()
        return dict(row)
    except aiosqlite.IntegrityError:
        raise HTTPException(status_code=409, detail="Category name already exists")
    finally:
        await db.close()


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(category_id: int, body: CategoryUpdate):
    db = await get_db()
    try:
        async with db.execute("SELECT * FROM categories WHERE id = ?", (category_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Category not found")

        fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
        if not fields:
            return dict(row)

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [category_id]
        await db.execute(f"UPDATE categories SET {set_clause} WHERE id = ?", values)
        await db.commit()

        async with db.execute("SELECT * FROM categories WHERE id = ?", (category_id,)) as c:
            updated = await c.fetchone()
        return dict(updated)
    finally:
        await db.close()


@router.delete("/{category_id}", status_code=204)
async def deactivate_category(category_id: int):
    db = await get_db()
    try:
        await db.execute("UPDATE categories SET is_active = 0 WHERE id = ?", (category_id,))
        await db.commit()
    finally:
        await db.close()
