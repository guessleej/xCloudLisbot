"""XMeet AI — /api/users/me profile management."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.database import User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

router = APIRouter(prefix="/api/users", tags=["users"])


def _user_dict(u: User) -> dict:
    return {
        "id":         u.id,
        "email":      u.email,
        "name":       u.name,
        "avatar":     u.avatar,
        "provider":   u.provider,
        "job_title":  u.job_title,
        "department": u.department,
        "language":   u.language or "zh-TW",
        "timezone":   u.timezone  or "Asia/Taipei",
    }


@router.get("/me")
@limiter.limit("60/minute")
async def get_me(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(select(User).where(User.id == current_user.id))
    u = result.scalar_one_or_none()
    if not u:
        return error("User not found", 404)
    return ok(_user_dict(u))


class ProfilePatch(BaseModel):
    name:       str | None = None
    job_title:  str | None = None
    department: str | None = None
    language:   str | None = None
    timezone:   str | None = None


@router.patch("/me")
@limiter.limit("20/minute")
async def update_me(
    request: Request,
    body: ProfilePatch,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(select(User).where(User.id == current_user.id))
    u = result.scalar_one_or_none()
    if not u:
        return error("User not found", 404)

    if body.name       is not None: u.name       = body.name.strip()
    if body.job_title  is not None: u.job_title  = body.job_title.strip()
    if body.department is not None: u.department = body.department.strip()
    if body.language   is not None: u.language   = body.language
    if body.timezone   is not None: u.timezone   = body.timezone

    await session.commit()
    await session.refresh(u)
    return ok(_user_dict(u))


# ── Custom folders ────────────────────────────────────────────────────────────

class FoldersBody(BaseModel):
    folders: Annotated[list[str], Field(max_length=50)]


@router.get("/me/folders")
@limiter.limit("60/minute")
async def get_folders(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(select(User).where(User.id == current_user.id))
    u = result.scalar_one_or_none()
    if not u:
        return error("User not found", 404)
    return ok(u.custom_folders or [])


@router.put("/me/folders")
@limiter.limit("30/minute")
async def update_folders(
    request: Request,
    body: FoldersBody,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(select(User).where(User.id == current_user.id))
    u = result.scalar_one_or_none()
    if not u:
        return error("User not found", 404)
    cleaned = list(dict.fromkeys(f.strip() for f in body.folders if f.strip()))
    u.custom_folders = cleaned
    await session.commit()
    return ok(cleaned)
