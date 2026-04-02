"""Terminology dictionary CRUD endpoints."""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException

from shared.auth import get_current_user
from shared.database import get_session, Terminology

router = APIRouter()


@router.get("/api/terminology")
async def list_terminology(user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        items = session.query(Terminology).filter(Terminology.user_id == user["sub"]) \
            .order_by(Terminology.created_at.desc()).all()
        return {"dicts": [
            {"id": t.id, "userId": t.user_id, "name": t.name, "description": t.description,
             "isActive": t.is_active, "terms": t.terms or [],
             "createdAt": t.created_at.isoformat() if t.created_at else "",
             "updatedAt": t.updated_at.isoformat() if t.updated_at else ""}
            for t in items
        ]}
    finally:
        session.close()


@router.post("/api/terminology", status_code=201)
async def create_terminology(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    if not body.get("name", "").strip():
        raise HTTPException(400, "辭典名稱不可為空")
    session = get_session()
    try:
        now = datetime.now(timezone.utc)
        t = Terminology(id=str(uuid.uuid4()), user_id=user["sub"], name=body["name"].strip(),
                        description=body.get("description", ""), is_active=body.get("isActive", True),
                        terms=body.get("terms", []), created_at=now, updated_at=now)
        session.add(t)
        session.commit()
        return {"id": t.id, "userId": t.user_id, "name": t.name, "description": t.description,
                "isActive": t.is_active, "terms": t.terms, "createdAt": now.isoformat(), "updatedAt": now.isoformat()}
    finally:
        session.close()


@router.put("/api/terminology/{dict_id}")
async def update_terminology(dict_id: str, request: Request, user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        t = session.get(Terminology, dict_id)
        if not t:
            raise HTTPException(404, "Not found")
        if t.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")
        body = await request.json()
        t.name = body.get("name", t.name)
        t.description = body.get("description", t.description)
        t.is_active = body.get("isActive", t.is_active)
        t.terms = body.get("terms", t.terms)
        t.updated_at = datetime.now(timezone.utc)
        session.commit()
        return {"id": t.id, "userId": t.user_id, "name": t.name, "description": t.description,
                "isActive": t.is_active, "terms": t.terms,
                "createdAt": t.created_at.isoformat() if t.created_at else "",
                "updatedAt": t.updated_at.isoformat()}
    finally:
        session.close()


@router.delete("/api/terminology/{dict_id}")
async def delete_terminology(dict_id: str, user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        t = session.get(Terminology, dict_id)
        if not t:
            raise HTTPException(404, "Not found")
        if t.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")
        session.delete(t)
        session.commit()
        return {"ok": True}
    finally:
        session.close()
