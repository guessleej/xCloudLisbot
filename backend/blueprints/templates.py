"""XMeet AI — Summary templates CRUD endpoints."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.database import Template, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

router = APIRouter(prefix="/api", tags=["templates"])


class TemplateBody(BaseModel):
    name: str
    description: str | None = None
    icon: str | None = None
    systemPromptOverride: str | None = None


def _serialize(t: Template) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "icon": t.icon,
        "isBuiltin": t.is_builtin,
        "systemPromptOverride": t.system_prompt_override,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("/templates")
@limiter.limit("60/minute")
async def list_templates(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(Template).where(
            (Template.user_id == user.id) | (Template.is_builtin == True)
        ).order_by(Template.is_builtin.desc(), Template.created_at)
    )
    items = result.scalars().all()
    return ok([_serialize(t) for t in items])


@router.post("/templates")
@limiter.limit("30/minute")
async def create_template(
    request: Request,
    body: TemplateBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    tmpl = Template(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=body.name,
        description=body.description,
        icon=body.icon,
        is_builtin=False,
        system_prompt_override=body.systemPromptOverride,
        created_at=datetime.now(timezone.utc),
    )
    session.add(tmpl)
    await session.commit()
    await session.refresh(tmpl)
    return ok(_serialize(tmpl))


@router.put("/templates/{template_id}")
@limiter.limit("30/minute")
async def update_template(
    request: Request,
    template_id: str,
    body: TemplateBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(Template).where(Template.id == template_id)
    )
    tmpl = result.scalar_one_or_none()
    if tmpl is None:
        return error("Template not found", 404)
    if tmpl.is_builtin:
        return error("Cannot modify built-in templates", 403)
    if tmpl.user_id != user.id:
        return error("Access denied", 403)

    tmpl.name = body.name
    tmpl.description = body.description
    tmpl.icon = body.icon
    tmpl.system_prompt_override = body.systemPromptOverride

    await session.commit()
    await session.refresh(tmpl)
    return ok(_serialize(tmpl))


@router.delete("/templates/{template_id}")
@limiter.limit("20/minute")
async def delete_template(
    request: Request,
    template_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(Template).where(Template.id == template_id)
    )
    tmpl = result.scalar_one_or_none()
    if tmpl is None:
        return error("Template not found", 404)
    if tmpl.is_builtin:
        return error("Cannot delete built-in templates", 403)
    if tmpl.user_id != user.id:
        return error("Access denied", 403)

    await session.delete(tmpl)
    await session.commit()
    return ok({"deleted": template_id})
