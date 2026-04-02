"""Summary template CRUD endpoints."""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException

from shared.auth import get_current_user
from shared.database import get_session, Template

router = APIRouter()


@router.get("/api/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        items = session.query(Template).filter(Template.user_id == user["sub"]) \
            .order_by(Template.created_at.desc()).all()
        return {"templates": [
            {"id": t.id, "userId": t.user_id, "name": t.name, "description": t.description,
             "icon": t.icon, "systemPromptOverride": t.system_prompt_override,
             "isBuiltIn": t.is_built_in,
             "createdAt": t.created_at.isoformat() if t.created_at else "",
             "updatedAt": t.updated_at.isoformat() if t.updated_at else ""}
            for t in items
        ]}
    finally:
        session.close()


@router.post("/api/templates", status_code=201)
async def create_template(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    if not body.get("name", "").strip():
        raise HTTPException(400, "範本名稱不可為空")
    session = get_session()
    try:
        now = datetime.now(timezone.utc)
        t = Template(id=str(uuid.uuid4()), user_id=user["sub"], name=body["name"].strip(),
                     description=body.get("description", ""), icon=body.get("icon", "📋"),
                     system_prompt_override=body.get("systemPromptOverride", ""),
                     is_built_in=False, created_at=now, updated_at=now)
        session.add(t)
        session.commit()
        return {"id": t.id, "userId": t.user_id, "name": t.name, "description": t.description,
                "icon": t.icon, "systemPromptOverride": t.system_prompt_override,
                "isBuiltIn": False, "createdAt": now.isoformat(), "updatedAt": now.isoformat()}
    finally:
        session.close()


@router.put("/api/templates/{template_id}")
async def update_template(template_id: str, request: Request, user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        t = session.get(Template, template_id)
        if not t:
            raise HTTPException(404, "Not found")
        if t.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")
        body = await request.json()
        t.name = body.get("name", t.name)
        t.description = body.get("description", t.description)
        t.icon = body.get("icon", t.icon)
        t.system_prompt_override = body.get("systemPromptOverride", t.system_prompt_override)
        t.updated_at = datetime.now(timezone.utc)
        session.commit()
        return {"id": t.id, "userId": t.user_id, "name": t.name, "description": t.description,
                "icon": t.icon, "systemPromptOverride": t.system_prompt_override,
                "isBuiltIn": t.is_built_in,
                "createdAt": t.created_at.isoformat() if t.created_at else "",
                "updatedAt": t.updated_at.isoformat()}
    finally:
        session.close()


@router.delete("/api/templates/{template_id}")
async def delete_template(template_id: str, user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        t = session.get(Template, template_id)
        if not t:
            raise HTTPException(404, "Not found")
        if t.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")
        session.delete(t)
        session.commit()
        return {"ok": True}
    finally:
        session.close()
