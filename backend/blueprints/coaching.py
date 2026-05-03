"""XMeet AI — /api/analytics/coaching speaking performance metrics."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.database import Meeting, Transcript, get_async_session
from shared.responses import ok

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _word_count(text: str) -> int:
    """Count words in mixed CJK + Latin text."""
    cjk = len(re.findall(r'[一-鿿㐀-䶿]', text))
    latin = len(re.findall(r'[A-Za-z]+', text))
    return cjk + latin


def _question_count(text: str) -> int:
    return text.count('?') + text.count('？')


@router.get("/coaching")
async def coaching(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    since = datetime.now(timezone.utc) - timedelta(days=30)

    # Fetch recent completed meetings
    m_result = await session.execute(
        select(Meeting)
        .where(
            Meeting.user_id == current_user.id,
            Meeting.created_at >= since,
            Meeting.status == "completed",
        )
        .order_by(Meeting.created_at.desc())
        .limit(50)
    )
    meetings: list[Meeting] = list(m_result.scalars().all())
    meeting_ids = [m.id for m in meetings]

    # Fetch all transcripts for those meetings
    transcripts: list[Transcript] = []
    if meeting_ids:
        t_result = await session.execute(
            select(Transcript).where(Transcript.meeting_id.in_(meeting_ids))
        )
        transcripts = list(t_result.scalars().all())

    # ── Aggregate per meeting ─────────────────────────────────────
    # meeting_id → { total_words, total_duration_ms, question_count, speaker_counts }
    mtx: dict[str, dict] = {
        m.id: {
            "title": m.title,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "total_words": 0,
            "total_duration_ms": 0,
            "question_count": 0,
            "speaker_words": defaultdict(int),
        }
        for m in meetings
    }

    for t in transcripts:
        if t.meeting_id not in mtx:
            continue
        mx = mtx[t.meeting_id]
        words = _word_count(t.text)
        dur = t.duration_ms or 0
        mx["total_words"] += words
        mx["total_duration_ms"] += dur
        mx["question_count"] += _question_count(t.text)
        mx["speaker_words"][t.speaker or "未知"] += words

    # ── Global averages ───────────────────────────────────────────
    meeting_rows = []
    all_wpm: list[float] = []
    all_q: list[int] = []

    for mid, mx in mtx.items():
        dur_min = mx["total_duration_ms"] / 60_000
        wpm = round(mx["total_words"] / dur_min, 1) if dur_min > 0.5 else None
        if wpm:
            all_wpm.append(wpm)
        all_q.append(mx["question_count"])

        # Dominant speaker ratio (biggest speaker / total words)
        sw = mx["speaker_words"]
        talk_ratio: float | None = None
        if sw and mx["total_words"] > 0:
            top_words = max(sw.values())
            talk_ratio = round(top_words / mx["total_words"] * 100, 1)

        meeting_rows.append({
            "id": mid,
            "title": mx["title"],
            "created_at": mx["created_at"],
            "wpm": wpm,
            "talk_ratio": talk_ratio,
            "question_count": mx["question_count"],
            "duration_min": round(dur_min, 1),
            "word_count": mx["total_words"],
        })

    avg_wpm = round(sum(all_wpm) / len(all_wpm), 1) if all_wpm else None
    avg_q   = round(sum(all_q) / len(all_q), 1) if all_q else None

    # talk_ratio & camera_usage: derive from transcript speaker diversity
    # (realistic estimate — exact camera data requires video pipeline)
    talk_ratios = [r["talk_ratio"] for r in meeting_rows if r["talk_ratio"] is not None]
    avg_talk = round(sum(talk_ratios) / len(talk_ratios), 1) if talk_ratios else None

    return ok({
        "period_days": 30,
        "meeting_count": len(meetings),
        "avg_wpm": avg_wpm,
        "avg_talk_ratio": avg_talk,       # dominant speaker %
        "avg_question_count": avg_q,
        "wpm_target": [130, 180],          # recommended range
        "meetings": sorted(meeting_rows, key=lambda x: x["created_at"] or "", reverse=True),
    })
