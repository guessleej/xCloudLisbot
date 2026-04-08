"""Meetings CRUD endpoints."""

import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy import func

from shared.auth import get_current_user
from shared.database import get_session, Meeting, Transcript, Summary, Share

logger = logging.getLogger(__name__)

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
            .order_by(Meeting.start_time.desc()).limit(50).all()

        results = []
        for m in items:
            # Get transcript snippet and count
            transcript_count = session.query(func.count(Transcript.id)) \
                .filter(Transcript.meeting_id == m.id).scalar() or 0
            first_transcript = session.query(Transcript.text) \
                .filter(Transcript.meeting_id == m.id) \
                .order_by(Transcript.created_at).first()
            snippet = first_transcript[0][:100] if first_transcript and first_transcript[0] else None

            # Check if summary exists
            has_summary = session.query(func.count(Summary.id)) \
                .filter(Summary.meeting_id == m.id).scalar() > 0

            results.append({
                "id": m.id, "userId": m.user_id, "title": m.title, "mode": m.mode,
                "language": m.language,
                "startTime": m.start_time.isoformat() if m.start_time else None,
                "endTime": m.end_time.isoformat() if m.end_time else None,
                "status": m.status, "audioUrl": m.audio_url,
                "snippetText": snippet,
                "hasSummary": has_summary,
                "transcriptCount": transcript_count,
            })

        return {"meetings": results}
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

        return {
            "id": m.id, "userId": m.user_id, "title": m.title, "mode": m.mode,
            "language": m.language,
            "startTime": m.start_time.isoformat() if m.start_time else None,
            "endTime": m.end_time.isoformat() if m.end_time else None,
            "status": m.status, "audioUrl": m.audio_url,
            "transcripts": transcripts,
            "summary": summary_data,
        }
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
        if m.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")

        if "title" in body:
            m.title = body["title"]

        session.commit()
        return {"id": m.id, "title": m.title, "status": "updated"}
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
                try:
                    from shared.config import blob_container_client
                    blob_name = m.audio_url.split("/")[-1].split("?")[0]
                    blob_container_client.delete_blob(blob_name)
                except Exception as e:
                    logger.warning(f"Failed to delete audio blob: {e}")
            session.delete(m)
            deleted.append(meeting_id)
        session.commit()
        return {"deleted": deleted, "count": len(deleted)}
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
            try:
                from shared.config import blob_container_client
                blob_name = m.audio_url.split("/")[-1].split("?")[0]
                blob_container_client.delete_blob(blob_name)
            except Exception as e:
                logger.warning(f"Failed to delete audio blob: {e}")

        session.delete(m)
        session.commit()
        return {"id": meeting_id, "status": "deleted"}
    finally:
        session.close()
