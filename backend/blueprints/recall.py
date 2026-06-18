"""xCloud Lisbot — Recall.ai meeting-bot endpoints.

Dispatch a Recall.ai bot to join an online meeting (Zoom / Google Meet /
Microsoft Teams), then ingest its transcript into the meeting's Transcript rows.
This replaces in-browser Azure Speech capture for remote meetings.

Routes:
    POST /api/recall/bots                         create a bot for a meeting URL
    GET  /api/recall/meetings/{meeting_id}/status bot + meeting status
    POST /api/recall/webhook                      public webhook (signature-verified)
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.access import require_meeting_owner
from shared.auth import get_current_user
from shared.database import Meeting, Transcript, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok
from shared import recall_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/recall", tags=["recall"])


# ── Map Recall bot events → our Meeting.status enum ──────────────────────────
_EVENT_TO_STATUS = {
    "bot.joining_call": "recording",
    "bot.in_waiting_room": "recording",
    "bot.in_call_not_recording": "recording",
    "bot.recording_permission_allowed": "recording",
    "bot.in_call_recording": "recording",
    "bot.call_ended": "processing",
    # bot.done means media is ready but the transcript may still be processing —
    # stay "processing" until transcript.done ingests the text.
    "bot.done": "processing",
    "bot.fatal": "error",
    "bot.recording_permission_denied": "error",
    "transcript.failed": "error",
    "recording.failed": "error",
}

# Terminal statuses must not be overwritten by a later, out-of-order status event.
_TERMINAL_STATUS = {"completed", "error"}


class CreateBotBody(BaseModel):
    meeting_url: str
    meeting_id: Optional[str] = None
    bot_name: Optional[str] = None
    title: Optional[str] = None
    language: Optional[str] = None
    join_at: Optional[str] = None  # ISO datetime — schedule the bot to join later


@router.post("/bots")
@limiter.limit("20/minute")
async def create_recall_bot(
    request: Request,
    body: CreateBotBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Dispatch a Recall.ai bot to join `meeting_url`.

    If `meeting_id` is given it must belong to the caller; otherwise a new
    meeting record is created to hold the bot's recording and transcript.
    """
    if not recall_service.is_configured():
        return error("Recall.ai is not configured (RECALL_API_KEY missing)", 503)

    if body.meeting_id:
        meeting = await require_meeting_owner(body.meeting_id, user, session)
    else:
        meeting = Meeting(
            id=str(uuid.uuid4()),
            user_id=user.id,
            title=body.title or "線上會議錄音",
            language=body.language or "zh-TW",
            status="pending",
            source="recall",
            created_at=datetime.now(timezone.utc),
        )
        session.add(meeting)
        await session.flush()

    if (meeting.language or "zh-TW") in recall_service.UNSUPPORTED_LANGUAGES:
        return error(
            "台語/客語請使用實體錄音(Azure Speech),recall.ai 無法轉錄此語言", 400
        )

    try:
        bot = await recall_service.create_bot(
            body.meeting_url,
            bot_name=body.bot_name or "xCloud Lisbot Notetaker",
            language=meeting.language or "zh-TW",
            join_at=body.join_at,
            metadata={"meeting_id": meeting.id, "user_id": user.id},
        )
    except recall_service.RecallAuthError:
        return error("Recall.ai API key invalid or expired", 502)
    except recall_service.RecallError as exc:
        logger.error("Recall create_bot failed: %s", exc)
        return error("Failed to dispatch Recall.ai bot", 502)

    meeting.recall_bot_id = bot.get("id")
    meeting.recall_status = "bot.joining_call"
    meeting.status = "recording"
    meeting.start_time = datetime.now(timezone.utc)
    await session.commit()

    return ok({
        "meetingId": meeting.id,
        "botId": meeting.recall_bot_id,
        "status": meeting.status,
    })


@router.get("/meetings/{meeting_id}/status")
@limiter.limit("60/minute")
async def recall_meeting_status(
    request: Request,
    meeting_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Return the meeting's Recall bot status (live from Recall when available)."""
    meeting = await require_meeting_owner(meeting_id, user, session)

    live: Optional[str] = None
    if meeting.recall_bot_id and recall_service.is_configured():
        try:
            bot = await recall_service.get_bot(meeting.recall_bot_id)
            changes = bot.get("status_changes") or []
            if changes:
                live = changes[-1].get("code") or changes[-1].get("type")
        except recall_service.RecallError as exc:
            logger.warning("Recall get_bot failed for %s: %s", meeting.recall_bot_id, exc)

    return ok({
        "meetingId": meeting_id,
        "botId": meeting.recall_bot_id,
        "recallStatus": meeting.recall_status,
        "liveStatus": live,
        "status": meeting.status,
    })


# ── Webhook ──────────────────────────────────────────────────────────────────

def _extract_bot_id(payload: dict) -> Optional[str]:
    data = payload.get("data") or {}
    bot = data.get("bot") or {}
    return bot.get("id") or data.get("bot_id") or data.get("id")


def _extract_meeting_id(payload: dict) -> Optional[str]:
    data = payload.get("data") or {}
    bot = data.get("bot") or {}
    meta = bot.get("metadata") or data.get("metadata") or {}
    return meta.get("meeting_id")


def _extract_transcript_ids(bot_obj: dict) -> list[str]:
    """Defensively walk a bot object for transcript artifact ids."""
    ids: list[str] = []
    for rec in (bot_obj.get("recordings") or []):
        shortcuts = rec.get("media_shortcuts") or {}
        tr = shortcuts.get("transcript") or {}
        tid = tr.get("id")
        if tid:
            ids.append(tid)
    return ids


def _extract_transcript_id_from_payload(payload: dict) -> Optional[str]:
    """A transcript.done event carries the transcript id directly."""
    data = payload.get("data") or {}
    tr = data.get("transcript") or {}
    return tr.get("id") or data.get("transcript_id")


def _extract_recording_url(payload: dict) -> Optional[str]:
    """A recording.done event carries the recording download URL."""
    data = payload.get("data") or {}
    rec = data.get("recording") or {}
    download = rec.get("download_url") or (rec.get("data") or {}).get("download_url")
    return download or data.get("download_url")


# ── Transcript text formatting ───────────────────────────────────────────────

_opencc_converter = None


def _to_traditional(text: str) -> str:
    """Convert Simplified → Traditional Chinese (Taiwan). Recall transcribes in
    the spoken language and often returns Simplified for Mandarin; normalise to
    Traditional. Non-Chinese text passes through unchanged. No-op if opencc fails."""
    global _opencc_converter
    if not text:
        return text
    try:
        if _opencc_converter is None:
            from opencc import OpenCC
            _opencc_converter = OpenCC("s2twp")
        return _opencc_converter.convert(text)
    except Exception as exc:
        logger.warning("OpenCC conversion skipped: %s", exc)
        return text


def _is_ascii_word_char(ch: str) -> bool:
    return bool(ch) and ch.isascii() and ch.isalnum()


def _join_words(words: list) -> str:
    """Join Recall word tokens, inserting a space only between two ASCII
    alphanumeric boundaries (English words) — never around CJK characters, which
    must not be space-separated."""
    parts: list[str] = []
    prev_last = ""
    for w in words:
        if not isinstance(w, dict):
            continue
        t = (w.get("text") or "").strip()
        if not t:
            continue
        if _is_ascii_word_char(prev_last) and _is_ascii_word_char(t[0]):
            parts.append(" ")
        parts.append(t)
        prev_last = t[-1]
    return "".join(parts)


def _parse_transcript(data: Any) -> list[dict]:
    """Normalise a Recall transcript payload into Transcript-row dicts.

    Recall transcripts are a list of utterances; each carries a speaker and a
    list of words with relative start timestamps. Parsing is defensive because
    the exact shape varies by transcript provider/version. Text is joined
    CJK-aware and converted to Traditional Chinese.
    """
    segments = data if isinstance(data, list) else (data.get("transcript") if isinstance(data, dict) else None)
    out: list[dict] = []
    if not isinstance(segments, list):
        return out
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        speaker = seg.get("speaker")
        if not speaker:
            participant = seg.get("participant") or {}
            speaker = participant.get("name") if isinstance(participant, dict) else None
        words = seg.get("words") or []
        text = _join_words(words)
        if not text:
            text = (seg.get("text") or "").strip()
        if not text:
            continue
        text = _to_traditional(text)
        offset_ms = 0
        if words and isinstance(words[0], dict):
            start = words[0].get("start_timestamp") or words[0].get("start")
            if isinstance(start, dict):
                start = start.get("relative")
            if isinstance(start, (int, float)):
                offset_ms = int(start * 1000)
        out.append({
            "speaker": speaker or "Speaker",
            "text": text,
            "offset_ms": offset_ms,
        })
    return out


async def _ingest_transcript(
    meeting: Meeting,
    session: AsyncSession,
    transcript_id: Optional[str] = None,
) -> int:
    """Fetch the bot's transcript from Recall and store it as Transcript rows.

    Idempotent: clears this meeting's existing transcripts first, so a redelivered
    webhook re-ingests cleanly instead of duplicating segments. If `transcript_id`
    is given (from a transcript.done event) it is used directly; otherwise the
    bot object is walked for transcript artifact ids.
    """
    transcript_ids = [transcript_id] if transcript_id else _extract_transcript_ids(
        await recall_service.get_bot(meeting.recall_bot_id)
    )
    if not transcript_ids:
        return 0

    rows: list[Transcript] = []
    now = datetime.now(timezone.utc)
    for tid in transcript_ids:
        url = await recall_service.get_transcript_download_url(tid)
        if not url:
            continue
        data = await recall_service.fetch_transcript_json(url)
        for seg in _parse_transcript(data):
            rows.append(Transcript(
                id=str(uuid.uuid4()),
                meeting_id=meeting.id,
                speaker=seg["speaker"],
                text=seg["text"],
                offset_ms=seg["offset_ms"],
                timestamp=now,
                language=meeting.language,
                source="recall",
            ))

    if not rows:
        return 0
    # Idempotency: replace only previously-ingested *recall* segments. Scoping by
    # source guarantees Azure Speech transcripts on the same meeting are never
    # deleted (dual-track safety).
    await session.execute(
        delete(Transcript).where(
            Transcript.meeting_id == meeting.id,
            Transcript.source == "recall",
        )
    )
    session.add_all(rows)
    return len(rows)


@router.post("/webhook")
async def recall_webhook(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    """Public endpoint for Recall.ai bot.* events. Signature-verified, no auth."""
    raw = await request.body()
    if not recall_service.verify_webhook(dict(request.headers), raw):
        logger.warning("Recall webhook signature verification failed")
        return error("Invalid signature", 401)

    try:
        payload = await request.json()
    except Exception:
        return error("Invalid JSON", 400)

    event = payload.get("event", "")

    # Calendar V2 events (calendar.update / calendar.sync_events) carry a
    # calendar_id, not a bot — delegate to the calendar blueprint.
    if event.startswith("calendar."):
        from blueprints.calendar_v2 import handle_calendar_webhook
        result = await handle_calendar_webhook(event, payload, session)
        return ok(result)

    bot_id = _extract_bot_id(payload)
    if not bot_id:
        return ok({"ignored": True})

    # Locate the meeting: prefer bot id, fall back to metadata.meeting_id.
    result = await session.execute(select(Meeting).where(Meeting.recall_bot_id == bot_id))
    meeting = result.scalar_one_or_none()
    if meeting is None:
        mid = _extract_meeting_id(payload)
        if mid:
            result = await session.execute(select(Meeting).where(Meeting.id == mid))
            meeting = result.scalar_one_or_none()
            if meeting is not None and not meeting.recall_bot_id:
                meeting.recall_bot_id = bot_id
    if meeting is None:
        logger.info("Recall webhook for unknown bot %s (event %s)", bot_id, event)
        return ok({"ignored": True})

    meeting.recall_status = event
    # Apply the mapped status, but never downgrade a meeting that already reached
    # a terminal state (guards against out-of-order events, e.g. bot.done arriving
    # after transcript.done/transcript.failed already set completed/error).
    new_status = _EVENT_TO_STATUS.get(event)
    if new_status and meeting.status not in _TERMINAL_STATUS:
        meeting.status = new_status

    # recording.done → keep the recording's download URL for playback.
    if event == "recording.done":
        rec_url = _extract_recording_url(payload)
        if rec_url:
            meeting.audio_url = rec_url

    # transcript.done is the reliable ingest trigger; bot.done is a fallback
    # (idempotent ingest makes a double-fire safe).
    if event in ("transcript.done", "bot.done"):
        try:
            count = await _ingest_transcript(
                meeting, session,
                transcript_id=_extract_transcript_id_from_payload(payload),
            )
            if count > 0:
                meeting.status = "completed"
            logger.info("Ingested %d transcript segments for meeting %s (%s)",
                        count, meeting.id, event)
        except Exception as exc:  # never fail the webhook on ingest errors
            logger.error("Transcript ingest failed for %s: %s", meeting.id, exc)
            # Give the meeting a terminal state regardless of which event drove
            # the ingest, so the frontend stops polling and surfaces the failure.
            meeting.status = "error"

    await session.commit()
    return ok({"received": True, "event": event})
