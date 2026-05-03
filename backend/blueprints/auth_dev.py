"""XMeet AI — Dev login (development environment only)."""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import create_token
from shared.config import ENVIRONMENT
from shared.database import User, get_async_session
from shared.responses import error, ok

router = APIRouter(prefix="/api/auth", tags=["auth"])


class DevLoginBody(BaseModel):
    email: str
    name: str = "Dev User"
    provider: str = "dev"   # allow testing google/microsoft flows in dev


@router.post("/dev/login")
async def dev_login(
    body: DevLoginBody,
    session: AsyncSession = Depends(get_async_session),
):
    """Quick login for development — creates or retrieves a user by email."""
    if ENVIRONMENT not in ("development", "local", "dev"):
        return error("Dev login is not available in this environment", 403)
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    allowed_providers = {"dev", "microsoft", "google", "github"}
    provider = body.provider if body.provider in allowed_providers else "dev"

    if user is None:
        user = User(
            id=str(uuid.uuid4()),
            email=body.email,
            name=body.name,
            provider=provider,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
    elif user.provider != provider:
        user.provider = provider
        await session.commit()
        await session.refresh(user)

    token = create_token(user.id)
    return ok({
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "avatar": user.avatar,
            "provider": user.provider,
        },
    })
