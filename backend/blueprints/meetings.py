"""Meetings CRUD endpoints."""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException

from shared.auth import get_current_user
from shared.database import get_session, Meeting

router = APIRouter()


@router.post("/api/meetings")
async def create_meeting(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    session = get_session()
    try:
        m = Meeting(
            id=str(uuid.uuid4()), user_id=user["sub"],
            title=body.get("title", "未命名會議"), mode=body.get("mode", "meeting"),
            language=body.get("language", "zh-TW"), template_id=body.get("templateId", "standard"),
            start_time=datetime.now(timezone.utc), status="recording",
        )
        session.add(m)
        session.commit()
        return {"id": m.id, "userId": m.user_id, "title": m.title, "mode": m.mode,
                "language": m.language, "templateId": m.template_id,
                "startTime": m.start_time.isoformat(), "endTime": None,
                "status": m.status, "audioUrl": None}
    finally:
        session.close()


@router.get("/api/meetings")
async def list_meetings(user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        items = session.query(Meeting).filter(Meeting.user_id == user["sub"]) \
            .order_by(Meeting.start_time.desc()).limit(20).all()
        return {"meetings": [
            {"id": m.id, "userId": m.user_id, "title": m.title, "mode": m.mode,
             "language": m.language, "startTime": m.start_time.isoformat() if m.start_time else None,
             "endTime": m.end_time.isoformat() if m.end_time else None,
             "status": m.status, "audioUrl": m.audio_url}
            for m in items
        ]}
    finally:
        session.close()


@router.get("/api/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        m = session.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(404, "Meeting not found")
        if m.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")
        return {"id": m.id, "userId": m.user_id, "title": m.title, "mode": m.mode,
                "language": m.language, "startTime": m.start_time.isoformat() if m.start_time else None,
                "endTime": m.end_time.isoformat() if m.end_time else None,
                "status": m.status, "audioUrl": m.audio_url}
    finally:
        session.close()
