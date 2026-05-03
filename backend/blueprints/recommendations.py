"""XMeet AI — /api/analytics/recommendations participant optimisation suggestions."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.database import Meeting, Transcript, get_async_session
from shared.responses import ok

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

REASON_TEMPLATES = [
    "近 {n} 場會議中攝影機均未開啟",
    "說話時間不足總時長 5%",
    "近 {n} 場會議中提早離線",
    "近 {n} 場會議中均未發言",
    "整體情緒指數偏負面",
]

def _word_count(text: str) -> int:
    cjk = len(re.findall(r'[一-鿿㐀-䶿]', text))
    latin = len(re.findall(r'[A-Za-z]+', text))
    return cjk + latin


def _fmt_date(m: Meeting) -> str:
    d = m.created_at or m.start_time
    if not d:
        return ""
    weekday = ["週一","週二","週三","週四","週五","週六","週日"][d.weekday()]
    if m.start_time and m.end_time:
        return f"{weekday} {d.month}/{d.day} {m.start_time.hour:02d}:{m.start_time.minute:02d}–{m.end_time.hour:02d}:{m.end_time.minute:02d}"
    return f"{weekday} {d.month}/{d.day}"


@router.get("/recommendations")
async def recommendations(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    since = datetime.now(timezone.utc) - timedelta(days=30)

    m_result = await session.execute(
        select(Meeting)
        .where(
            Meeting.user_id == current_user.id,
            Meeting.created_at >= since,
            Meeting.status == "completed",
        )
        .order_by(Meeting.created_at.desc())
        .limit(20)
    )
    meetings: list[Meeting] = list(m_result.scalars().all())
    meeting_ids = [m.id for m in meetings]

    transcripts_by_meeting: dict[str, list[Transcript]] = defaultdict(list)
    if meeting_ids:
        t_result = await session.execute(
            select(Transcript).where(Transcript.meeting_id.in_(meeting_ids))
        )
        for t in t_result.scalars().all():
            transcripts_by_meeting[t.meeting_id].append(t)

    result_meetings = []

    for m in meetings:
        segs = transcripts_by_meeting[m.id]
        if not segs:
            continue

        # Aggregate word count per speaker
        speaker_words: dict[str, int] = defaultdict(int)
        speaker_turns: dict[str, int] = defaultdict(int)
        total_words = 0
        for seg in segs:
            sp = seg.speaker or "未知"
            wc = _word_count(seg.text)
            speaker_words[sp] += wc
            speaker_turns[sp] += 1
            total_words += wc

        if total_words == 0:
            continue

        recs = []
        for sp, wc in speaker_words.items():
            if sp in ("未知", current_user.id if hasattr(current_user, 'id') else ""):
                continue
            pct = wc / total_words
            turns = speaker_turns[sp]
            reasons: list[str] = []
            if pct < 0.05:
                reasons.append("說話時間不足總時長 5%")
            if turns <= 1:
                reasons.append("近 2 場會議中均未發言")
            if not reasons:
                continue
            recs.append({
                "id": str(uuid.uuid4()),
                "name": sp,
                "title": f"建議將 {sp} 改為選填出席",
                "subtitle": "XMeet AI 建議將此人設為選填出席者",
                "reasons": reasons,
                "talk_pct": round(pct * 100, 1),
                "turns": turns,
            })

        if recs:
            result_meetings.append({
                "id": m.id,
                "title": m.title,
                "date": _fmt_date(m),
                "rec_count": len(recs),
                "recommendations": recs,
            })

    return ok({
        "meeting_count": len(meetings),
        "meetings_with_recs": len(result_meetings),
        "meetings": result_meetings,
    })
