"""xCloud Lisbot — Terminology dictionary CRUD endpoints."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.database import Terminology, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

router = APIRouter(prefix="/api", tags=["terminology"])


class TerminologyBody(BaseModel):
    name: str
    description: str | None = None
    terms: list[str] = []
    isActive: bool = True


def _serialize(t: Terminology) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "terms": t.terms or [],
        "isActive": t.is_active,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
    }


@router.get("/terminology")
@limiter.limit("60/minute")
async def list_terminology(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(Terminology).where(Terminology.user_id == user.id).order_by(Terminology.created_at.desc())
    )
    items = result.scalars().all()
    return ok([_serialize(t) for t in items])


@router.post("/terminology")
@limiter.limit("30/minute")
async def create_terminology(
    request: Request,
    body: TerminologyBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    now = datetime.now(timezone.utc)
    term = Terminology(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=body.name,
        description=body.description,
        terms=body.terms,
        is_active=body.isActive,
        created_at=now,
        updated_at=now,
    )
    session.add(term)
    await session.commit()
    await session.refresh(term)
    return ok(_serialize(term))


@router.put("/terminology/{term_id}")
@limiter.limit("30/minute")
async def update_terminology(
    request: Request,
    term_id: str,
    body: TerminologyBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(Terminology).where(Terminology.id == term_id, Terminology.user_id == user.id)
    )
    term = result.scalar_one_or_none()
    if term is None:
        return error("Terminology not found", 404)

    term.name = body.name
    term.description = body.description
    term.terms = body.terms
    term.is_active = body.isActive
    term.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(term)
    return ok(_serialize(term))


@router.delete("/terminology/{term_id}")
@limiter.limit("20/minute")
async def delete_terminology(
    request: Request,
    term_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(Terminology).where(Terminology.id == term_id, Terminology.user_id == user.id)
    )
    term = result.scalar_one_or_none()
    if term is None:
        return error("Terminology not found", 404)

    await session.delete(term)
    await session.commit()
    return ok({"deleted": term_id})
