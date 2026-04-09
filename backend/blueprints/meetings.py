"""Meetings CRUD endpoints."""

import uuid
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy import func

from shared.auth import get_current_user
from shared.access import check_meeting_access
from shared.config import get_blob_container_client
from shared.database import get_session, Meeting, Transcript, Summary, Share, User

logger = logging.getLogger(__name__)

router = APIRouter()


def _extract_blob_name(audio_url: str) -> str | None:
    """Extract blob name (user_id/meeting_id.ext) from full Azure Blob URL."""
    try:
        parsed = urlparse(audio_url.split("?")[0])  # strip SAS token
        # path = /container-name/user_id/meeting_id.ext
        parts = parsed.path.split("/", 2)
        return parts[2] if len(parts) >= 3 else parts[-1]
    except (IndexError, AttributeError):
        return None


def _delete_audio_blob(audio_url: str) -> None:
    """Best-effort delete of audio blob from storage."""
    blob_name = _extract_blob_name(audio_url)
    if not blob_name:
        return
    try:
        get_blob_container_client().delete_blob(blob_name)
    except Exception as e:
        logger.warning(f"Failed to delete audio blob '{blob_name}': {e}")


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
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/api/meetings")
async def list_meetings(user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        # Owner's meetings
        own_items = session.query(Meeting).filter(Meeting.user_id == user["sub"]) \
            .order_by(Meeting.start_time.desc()).limit(50).all()

        # Shared meetings
        shared_rows = session.query(Share).filter(
            Share.member_email == user.get("email", "")
        ).all()
        share_meta = {s.meeting_id: s for s in shared_rows}
        shared_items = []
        if shared_rows:
            shared_meeting_ids = [s.meeting_id for s in shared_rows]
            shared_items = session.query(Meeting).filter(
                Meeting.id.in_(shared_meeting_ids)
            ).order_by(Meeting.start_time.desc()).all()

        # Merge and sort
        own_ids = {m.id for m in own_items}
        items = own_items + [m for m in shared_items if m.id not in own_ids]
        items.sort(key=lambda m: m.start_time or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        items = items[:50]

        if not items:
            return {"meetings": []}

        meeting_ids = [m.id for m in items]

        # Batch queries to avoid N+1 (3 queries instead of 1 + N*3)
        transcript_counts = dict(
            session.query(Transcript.meeting_id, func.count(Transcript.id))
            .filter(Transcript.meeting_id.in_(meeting_ids))
            .group_by(Transcript.meeting_id).all()
        )

        # Get first transcript snippet per meeting using DISTINCT ON equivalent
        from sqlalchemy import asc
        first_transcripts = {}
        for row in session.query(Transcript.meeting_id, Transcript.text) \
                .filter(Transcript.meeting_id.in_(meeting_ids)) \
                .order_by(Transcript.meeting_id, asc(Transcript.created_at)).all():
            if row.meeting_id not in first_transcripts:
                first_transcripts[row.meeting_id] = row.text[:100] if row.text else None

        summary_ids = set(
            r[0] for r in session.query(Summary.meeting_id)
            .filter(Summary.meeting_id.in_(meeting_ids)).all()
        )

        results = []
        for m in items:
            is_shared = m.id in share_meta
            share = share_meta.get(m.id)
            results.append({
                "id": m.id, "userId": m.user_id, "title": m.title, "mode": m.mode,
                "language": m.language,
                "startTime": m.start_time.isoformat() if m.start_time else None,
                "endTime": m.end_time.isoformat() if m.end_time else None,
                "status": m.status, "audioUrl": m.audio_url,
                "snippetText": first_transcripts.get(m.id),
                "hasSummary": m.id in summary_ids,
                "transcriptCount": transcript_counts.get(m.id, 0),
                "isShared": is_shared,
                "sharedBy": share.owner_name if share else None,
                "permission": share.permission if share else None,
            })

        return {"meetings": results}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/api/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        m = session.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(404, "Meeting not found")
        access = check_meeting_access(session, m, user)

        # Load transcripts
        transcripts_rows = session.query(Transcript) \
            .filter(Transcript.meeting_id == meeting_id) \
            .order_by(Transcript.offset, Transcript.created_at).all()
        transcripts = [
            {
                "id": t.id, "speaker": t.speaker or "說話者",
                "speakerId": t.speaker.replace("說話者 ", "") if t.speaker else "1",
                "text": t.text, "timestamp": t.created_at.isoformat() if t.created_at else None,
                "offset": t.offset, "duration": t.duration,
                "confidence": t.confidence or 0.95,
            }
            for t in transcripts_rows
        ]

        # Load summary
        summary_row = session.query(Summary) \
            .filter(Summary.meeting_id == meeting_id).first()
        summary_data = None
        if summary_row:
            summary_data = {
                "markdown": summary_row.summary or "",
                "actionItems": summary_row.action_items or [],
                "keyDecisions": summary_row.key_decisions or [],
                "nextMeetingTopics": summary_row.next_meeting_topics or [],
                "generatedAt": summary_row.generated_at.isoformat() if summary_row.generated_at else None,
                "templateId": summary_row.template_id,
                "language": summary_row.language,
            }

        # Shared meeting metadata
        is_shared = access["role"] != "owner"
        shared_by = ""
        shared_by_name = ""
        if is_shared and access["share"]:
            shared_by = access["share"].owner_id
            shared_by_name = access["share"].owner_name or ""
            if not shared_by_name:
                owner = session.get(User, m.user_id)
                shared_by_name = owner.name if owner else ""

        return {
            "id": m.id, "userId": m.user_id, "title": m.title, "mode": m.mode,
            "language": m.language,
            "startTime": m.start_time.isoformat() if m.start_time else None,
            "endTime": m.end_time.isoformat() if m.end_time else None,
            "status": m.status, "audioUrl": m.audio_url,
            "transcripts": transcripts,
            "summary": summary_data,
            "isShared": is_shared,
            "sharedBy": shared_by,
            "sharedByName": shared_by_name,
        }
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.patch("/api/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    session = get_session()
    try:
        m = session.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(404, "Meeting not found")
        check_meeting_access(session, m, user, require_permission="edit")

        if "title" in body:
            m.title = body["title"]

        session.commit()
        return {"id": m.id, "title": m.title, "status": "updated"}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.post("/api/meetings/{meeting_id}/transcripts")
async def save_transcripts(meeting_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Batch-save transcript segments for a meeting."""
    session = get_session()
    try:
        m = session.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(404, "Meeting not found")
        if m.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")

        body = await request.json()
        segments = body.get("segments", [])
        if not segments:
            return {"saved": 0}

        for seg in segments:
            session.add(Transcript(
                id=seg.get("id", str(uuid.uuid4())),
                meeting_id=meeting_id,
                speaker=seg.get("speaker", "說話者"),
                text=seg.get("text", ""),
                offset=seg.get("offset", 0),
                duration=seg.get("duration", 0),
                confidence=seg.get("confidence", 0.95),
            ))
        session.commit()
        return {"saved": len(segments)}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.post("/api/meetings/batch-delete")
async def batch_delete_meetings(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    ids = body.get("ids", [])
    if not ids or not isinstance(ids, list):
        raise HTTPException(400, "Missing or invalid 'ids' array")

    session = get_session()
    deleted = []
    try:
        for meeting_id in ids:
            m = session.get(Meeting, meeting_id)
            if not m or m.user_id != user["sub"]:
                continue
            session.query(Transcript).filter(Transcript.meeting_id == meeting_id).delete()
            session.query(Summary).filter(Summary.meeting_id == meeting_id).delete()
            session.query(Share).filter(Share.meeting_id == meeting_id).delete()
            if m.audio_url:
                _delete_audio_blob(m.audio_url)
            session.delete(m)
            deleted.append(meeting_id)
        session.commit()
        return {"deleted": deleted, "count": len(deleted)}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.delete("/api/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        m = session.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(404, "Meeting not found")
        if m.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")

        # Delete related records
        session.query(Transcript).filter(Transcript.meeting_id == meeting_id).delete()
        session.query(Summary).filter(Summary.meeting_id == meeting_id).delete()
        session.query(Share).filter(Share.meeting_id == meeting_id).delete()

        # Delete audio from Blob Storage if exists
        if m.audio_url:
            _delete_audio_blob(m.audio_url)

        session.delete(m)
        session.commit()
        return {"id": meeting_id, "status": "deleted"}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
