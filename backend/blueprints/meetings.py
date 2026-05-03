"""XMeet AI — Meetings CRUD endpoints."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.access import require_meeting_owner
from shared.auth import get_current_user
from shared.database import Meeting, Summary, Transcript, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["meetings"])


# ── Pydantic bodies ───────────────────────────────────────────────────────────

class CreateMeetingBody(BaseModel):
    title: str = "Untitled Meeting"
    mode: str = "meeting"
    language: str = "zh-TW"
    folder: str | None = None
    source: str | None = None


class PatchMeetingBody(BaseModel):
    title: str | None = None
    folder: str | None = None
    mode: str | None = None
    language: str | None = None
    status: str | None = None


class BatchDeleteBody(BaseModel):
    ids: Annotated[list[str], Field(min_length=1, max_length=100)]


# ── Serializers ───────────────────────────────────────────────────────────────

def _serialize_meeting(m: Meeting, transcript_count: int = 0) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "startTime": m.start_time.isoformat() if m.start_time else None,
        "endTime": m.end_time.isoformat() if m.end_time else None,
        "createdAt": m.created_at.isoformat() if m.created_at else None,
        "status": m.status,
        "audioUrl": m.audio_url,
        "mode": m.mode,
        "language": m.language,
        "folder": m.folder,
        "source": m.source,
        "participants": m.participants,
        "shareToken": m.share_token,
        "transcriptCount": transcript_count,
    }


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
        "templateId": s.template_id,
        "templateName": s.template_name,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/meetings")
@limiter.limit("60/minute")
async def list_meetings(
    request: Request,
    page: int = Query(1, ge=1, description="1-based page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    folder: str | None = Query(None, description="Filter by folder name"),
    status: str | None = Query(None, description="Filter by status (pending/recording/processing/completed/error)"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    base_q = select(Meeting).where(Meeting.user_id == user.id)
    if folder is not None:
        base_q = base_q.where(Meeting.folder == folder)
    if status is not None:
        base_q = base_q.where(Meeting.status == status)

    total_result = await session.execute(
        select(func.count()).select_from(base_q.subquery())
    )
    total: int = total_result.scalar_one()

    offset = (page - 1) * limit
    result = await session.execute(
        base_q.order_by(Meeting.created_at.desc()).offset(offset).limit(limit)
    )
    meetings = result.scalars().all()

    meeting_ids = [m.id for m in meetings]
    counts: dict[str, int] = {}
    if meeting_ids:
        cnt_result = await session.execute(
            select(Transcript.meeting_id, func.count(Transcript.id))
            .where(Transcript.meeting_id.in_(meeting_ids))
            .group_by(Transcript.meeting_id)
        )
        counts = {row[0]: row[1] for row in cnt_result.all()}

    return ok({
        "meetings": [_serialize_meeting(m, counts.get(m.id, 0)) for m in meetings],
        "total": total,
        "page": page,
        "limit": limit,
        "hasMore": offset + len(meetings) < total,
        "filters": {"folder": folder, "status": status},
    })


@router.post("/meetings")
@limiter.limit("30/minute")
async def create_meeting(
    request: Request,
    body: CreateMeetingBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    meeting = Meeting(
        id=str(uuid.uuid4()),
        user_id=user.id,
        title=body.title,
        mode=body.mode,
        language=body.language,
        folder=body.folder,
        source=body.source,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    session.add(meeting)
    await session.commit()
    await session.refresh(meeting)
    return ok(_serialize_meeting(meeting))


@router.get("/meetings/{meeting_id}")
@limiter.limit("120/minute")
async def get_meeting(
    request: Request,
    meeting_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    meeting = await require_meeting_owner(meeting_id, user, session)

    transcripts_result = await session.execute(
        select(Transcript).where(Transcript.meeting_id == meeting_id).order_by(Transcript.offset_ms)
    )
    transcripts = transcripts_result.scalars().all()

    summary_result = await session.execute(
        select(Summary).where(Summary.meeting_id == meeting_id)
    )
    summary = summary_result.scalar_one_or_none()

    return ok({
        **_serialize_meeting(meeting, len(transcripts)),
        "transcripts": [_serialize_transcript(t) for t in transcripts],
        "summary": _serialize_summary(summary) if summary else None,
    })


@router.patch("/meetings/{meeting_id}")
@limiter.limit("30/minute")
async def patch_meeting(
    request: Request,
    meeting_id: str,
    body: PatchMeetingBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    meeting = await require_meeting_owner(meeting_id, user, session)
    if body.title is not None:
        meeting.title = body.title
    if body.folder is not None:
        meeting.folder = body.folder
    if body.mode is not None:
        meeting.mode = body.mode
    if body.language is not None:
        meeting.language = body.language
    if body.status is not None:
        meeting.status = body.status
    await session.commit()
    await session.refresh(meeting)
    return ok(_serialize_meeting(meeting))


@router.delete("/meetings/batch")
@limiter.limit("10/minute")
async def batch_delete_meetings(
    request: Request,
    body: BatchDeleteBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await session.execute(
        delete(Meeting).where(
            Meeting.id.in_(body.ids),
            Meeting.user_id == user.id,
        )
    )
    await session.commit()
    return ok({"deleted": len(body.ids)})


@router.delete("/meetings/{meeting_id}")
@limiter.limit("20/minute")
async def delete_meeting(
    request: Request,
    meeting_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    meeting = await require_meeting_owner(meeting_id, user, session)
    await session.delete(meeting)
    await session.commit()
    return ok({"deleted": meeting_id})


class TranscriptSegment(BaseModel):
    speaker: str = "Guest_1"
    text: str
    offset_ms: int = 0
    duration_ms: int = 0
    confidence: float = 1.0


class TranscriptsBody(BaseModel):
    segments: list[TranscriptSegment]


@router.post("/meetings/{meeting_id}/transcripts")
@limiter.limit("20/minute")
async def post_meeting_transcripts(
    request: Request,
    meeting_id: str,
    body: TranscriptsBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await require_meeting_owner(meeting_id, user, session)
    now = datetime.now(timezone.utc)
    records = [
        Transcript(
            id=str(uuid.uuid4()),
            meeting_id=meeting_id,
            speaker=seg.speaker,
            text=seg.text,
            offset_ms=seg.offset_ms,
            duration_ms=seg.duration_ms,
            confidence=seg.confidence,
            timestamp=now,
        )
        for seg in body.segments
    ]
    session.add_all(records)
    await session.commit()
    return ok({"inserted": len(records)})


@router.get("/meetings/{meeting_id}/transcripts")
@limiter.limit("60/minute")
async def get_meeting_transcripts(
    request: Request,
    meeting_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await require_meeting_owner(meeting_id, user, session)
    result = await session.execute(
        select(Transcript)
        .where(Transcript.meeting_id == meeting_id)
        .order_by(Transcript.offset_ms)
    )
    transcripts = result.scalars().all()
    return ok([_serialize_transcript(t) for t in transcripts])


@router.get("/meetings/{meeting_id}/transcription-status")
@limiter.limit("30/minute")
async def get_transcription_status(
    request: Request,
    meeting_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    meeting = await require_meeting_owner(meeting_id, user, session)

    progress = 0
    if meeting.status == "completed":
        progress = 100
    elif meeting.status == "processing":
        progress = 50
    elif meeting.status == "error":
        progress = 0

    return ok({
        "status": meeting.status,
        "progress": progress,
        "meetingId": meeting_id,
    })
