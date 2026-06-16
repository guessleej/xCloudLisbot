"""xCloud Lisbot — Meeting sharing endpoints."""

import secrets
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

import logging
logger = logging.getLogger(__name__)

from shared.access import get_shared_meeting, require_meeting_owner
from shared.auth import get_current_user
from shared.database import Meeting, Share, Summary, Transcript, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

router = APIRouter(prefix="/api", tags=["share"])


class CreateShareBody(BaseModel):
    meetingId: str
    permission: Literal["view", "edit"] = "view"
    memberEmail: str | None = None
    memberName: str | None = None


def _serialize_transcript(t: Transcript) -> dict:
    return {
        "id": t.id,
        "speaker": t.speaker,
        "speakerId": t.speaker_id,
        "text": t.text,
        "timestamp": t.timestamp.isoformat() if t.timestamp else None,
        "offsetMs": t.offset_ms,
        "durationMs": t.duration_ms,
        "confidence": t.confidence,
        "language": t.language,
    }


def _serialize_summary(s: Summary) -> dict:
    return {
        "id": s.id,
        "markdown": s.markdown,
        "actionItems": s.action_items or [],
        "keyDecisions": s.key_decisions or [],
        "nextMeetingTopics": s.next_meeting_topics or [],
        "generatedAt": s.generated_at.isoformat() if s.generated_at else None,
    }


def _serialize_meeting(m: Meeting) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "startTime": m.start_time.isoformat() if m.start_time else None,
        "endTime": m.end_time.isoformat() if m.end_time else None,
        "status": m.status,
        "mode": m.mode,
        "language": m.language,
    }


# ── Create / generate share token ─────────────────────────────────────────────

@router.post("/share")
@limiter.limit("20/minute")
async def create_share(
    request: Request,
    body: CreateShareBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    meeting = await require_meeting_owner(body.meetingId, user, session)

    if not meeting.share_token:
        meeting.share_token = secrets.token_urlsafe(32)

    share = Share(
        id=str(uuid.uuid4()),
        meeting_id=body.meetingId,
        member_email=body.memberEmail,
        member_name=body.memberName,
        permission=body.permission,
        shared_at=datetime.now(timezone.utc),
    )
    session.add(share)
    await session.commit()
    await session.refresh(meeting)

    return ok({
        "shareToken": meeting.share_token,
        "shareId": share.id,
        "permission": body.permission,
    })


# ── Public view via share token ───────────────────────────────────────────────

@router.get("/shared/{token}")
@limiter.limit("10/minute")
async def get_shared_meeting_view(
    request: Request,
    token: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Public endpoint — no auth required."""
    meeting = await get_shared_meeting(token, session)

    transcripts_result = await session.execute(
        select(Transcript).where(Transcript.meeting_id == meeting.id).order_by(Transcript.offset_ms)
    )
    transcripts = transcripts_result.scalars().all()

    summary_result = await session.execute(
        select(Summary).where(Summary.meeting_id == meeting.id)
    )
    summary = summary_result.scalar_one_or_none()

    return ok({
        **_serialize_meeting(meeting),
        "transcripts": [_serialize_transcript(t) for t in transcripts],
        "summary": _serialize_summary(summary) if summary else None,
    })


# ── List shares for a meeting ─────────────────────────────────────────────────

@router.get("/share/{meeting_id}")
@limiter.limit("60/minute")
async def list_shares(
    request: Request,
    meeting_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await require_meeting_owner(meeting_id, user, session)

    result = await session.execute(
        select(Share).where(Share.meeting_id == meeting_id).order_by(Share.shared_at.desc())
    )
    shares = result.scalars().all()

    return ok([
        {
            "id": s.id,
            "memberEmail": s.member_email,
            "memberName": s.member_name,
            "permission": s.permission,
            "sharedAt": s.shared_at.isoformat() if s.shared_at else None,
        }
        for s in shares
    ])


# ── Remove a share ────────────────────────────────────────────────────────────

@router.delete("/share/{meeting_id}/{member_email}")
@limiter.limit("20/minute")
async def delete_share(
    request: Request,
    meeting_id: str,
    member_email: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await require_meeting_owner(meeting_id, user, session)

    result = await session.execute(
        delete(Share).where(
            Share.meeting_id == meeting_id,
            Share.member_email == member_email,
        ).returning(Share.id)
    )
    deleted_ids = result.scalars().all()
    if not deleted_ids:
        return error("Share not found", 404)
    await session.commit()
    return ok({"deleted": len(deleted_ids), "memberEmail": member_email})
