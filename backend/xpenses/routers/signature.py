import base64
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from ..auth import get_current_user
from ..config import settings
from ..database import get_db

router = APIRouter(prefix="/api/users/me", tags=["signature"])

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MAX_SIZE = 500 * 1024


class SignaturePayload(BaseModel):
    image: str


@router.get("/signature")
async def get_signature(user=Depends(get_current_user), db=Depends(get_db)):
    path = await db.fetchval(
        "SELECT signature_path FROM users WHERE id = $1", user["id"]
    )
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No signature found")
    return FileResponse(path, media_type="image/png")


@router.put("/signature")
async def put_signature(
    payload: SignaturePayload,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    prefix = "data:image/png;base64,"
    if not payload.image.startswith(prefix):
        raise HTTPException(status_code=400, detail="Invalid image format")

    try:
        data = base64.b64decode(payload.image[len(prefix):])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")

    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Signature exceeds 500KB limit")

    if not data.startswith(PNG_MAGIC):
        raise HTTPException(status_code=400, detail="Not a valid PNG")

    os.makedirs(settings.signatures_dir, exist_ok=True)
    file_path = os.path.join(settings.signatures_dir, f"{user['id']}.png")

    with open(file_path, "wb") as f:
        f.write(data)

    await db.execute(
        "UPDATE users SET signature_path = $1 WHERE id = $2", file_path, user["id"]
    )

    return {"signature_path": file_path}


@router.delete("/signature", status_code=204)
async def delete_signature(user=Depends(get_current_user), db=Depends(get_db)):
    path = await db.fetchval(
        "SELECT signature_path FROM users WHERE id = $1", user["id"]
    )
    if path and os.path.exists(path):
        os.remove(path)

    await db.execute(
        "UPDATE users SET signature_path = NULL WHERE id = $1", user["id"]
    )

    return Response(status_code=204)
