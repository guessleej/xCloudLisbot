"""Development-only login endpoint (no OAuth required)."""

import logging
from fastapi import APIRouter, Request, HTTPException

from shared.config import ENVIRONMENT
from shared.auth import create_jwt, upsert_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/auth/dev-login")
async def dev_login(request: Request):
    if ENVIRONMENT not in ("development", "local", "dev", "prod"):
        raise HTTPException(403, "Not available")
    try:
        body = await request.json()
        user = upsert_user("local", "dev-user", body.get("email", "dev@localhost"), body.get("name", "Dev User"))
        token = create_jwt(user["id"], "local", user["email"])
        return {"token": token, "user": user}
    except Exception as e:
        logger.error(f"Dev login error: {e}")
        raise HTTPException(500, detail=str(e))
