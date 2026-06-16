"""xCloud Lisbot — /api/analytics/* endpoints."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.database import Meeting, Summary, Transcript, get_async_session
from shared.responses import ok

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

WEEKDAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"]
TIME_SLOTS = [
    {"label": "06–09", "start": 6,  "end": 9},
    {"label": "09–12", "start": 9,  "end": 12},
    {"label": "12–15", "start": 12, "end": 15},
    {"label": "15–18", "start": 15, "end": 18},
    {"label": "18–21", "start": 18, "end": 21},
]


def _duration_min(m: Meeting) -> float:
    if m.start_time and m.end_time:
        return (m.end_time - m.start_time).total_seconds() / 60
    return 45.0  # default assumption


def _participants(m: Meeting) -> int:
    return m.participants or 2


@router.get("/meeting-policy")
async def meeting_policy(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    since = datetime.now(timezone.utc) - timedelta(days=30)

    m_result = await session.execute(
        select(Meeting)
        .where(Meeting.user_id == current_user.id, Meeting.created_at >= since)
        .order_by(Meeting.created_at.desc())
        .limit(200)
    )
    meetings: list[Meeting] = list(m_result.scalars().all())
    meeting_ids = [m.id for m in meetings]

    summaries: dict[str, Summary] = {}
    if meeting_ids:
        s_result = await session.execute(
            select(Summary).where(Summary.meeting_id.in_(meeting_ids))
        )
        for s in s_result.scalars().all():
            summaries[s.meeting_id] = s

    transcripts_by_meeting: dict[str, list[Transcript]] = defaultdict(list)
    if meeting_ids:
        t_result = await session.execute(
            select(Transcript).where(Transcript.meeting_id.in_(meeting_ids))
        )
        for t in t_result.scalars().all():
            transcripts_by_meeting[t.meeting_id].append(t)

    n = len(meetings)

    # ── Weekday distribution ───────────────────────────────────
    weekday_counts = [0] * 7
    for m in meetings:
        if m.created_at:
            # Monday=0 … Sunday=6
            weekday_counts[m.created_at.weekday()] += 1

    # ── Time-of-day distribution ────────────────────────────────
    time_counts = [0] * len(TIME_SLOTS)
    for m in meetings:
        if m.start_time:
            hour = m.start_time.hour
        elif m.created_at:
            hour = m.created_at.hour
        else:
            continue
        for i, slot in enumerate(TIME_SLOTS):
            if slot["start"] <= hour < slot["end"]:
                time_counts[i] += 1
                break

    # ── Meeting size distribution ────────────────────────────────
    size_1v1 = size_23 = size_4p = 0
    for m in meetings:
        p = _participants(m)
        if p <= 1: size_1v1 += 1
        elif p <= 3: size_23 += 1
        else: size_4p += 1
    total_size = size_1v1 + size_23 + size_4p or 1
    size_dist = [
        {"label": "一對一",  "count": size_1v1, "pct": round(size_1v1 / total_size * 100)},
        {"label": "2–3 人",  "count": size_23,  "pct": round(size_23  / total_size * 100)},
        {"label": "4+ 人",   "count": size_4p,  "pct": round(size_4p  / total_size * 100)},
    ]

    # ── Duration distribution ────────────────────────────────────
    dur_short = dur_mid = dur_long = 0
    for m in meetings:
        d = _duration_min(m)
        if d < 30: dur_short += 1
        elif d <= 60: dur_mid += 1
        else: dur_long += 1
    total_dur = dur_short + dur_mid + dur_long or 1
    dur_dist = [
        {"label": "< 30 分鐘",  "count": dur_short, "pct": round(dur_short / total_dur * 100)},
        {"label": "30–60 分鐘", "count": dur_mid,   "pct": round(dur_mid   / total_dur * 100)},
        {"label": "> 60 分鐘",  "count": dur_long,  "pct": round(dur_long  / total_dur * 100)},
    ]

    # ── Scores per dimension ────────────────────────────────────
    # Derived heuristically from available metadata
    summarized = len(summaries)
    with_transcripts = sum(1 for mid in meeting_ids if transcripts_by_meeting[mid])
    completion_rate = summarized / n if n else 0
    transcript_rate = with_transcripts / n if n else 0

    lisbot_score    = round(60 + completion_rate * 25 + transcript_rate * 15) if n else None
    sentiment_score = round(65 + completion_rate * 20) if n else None
    engagement_score = round(55 + transcript_rate * 30 + (size_23 + size_4p) / (n or 1) * 15) if n else None
    compliance_score = round(50 + completion_rate * 30 + transcript_rate * 20) if n else None

    return ok({
        "period_days": 30,
        "meeting_count": n,
        "scores": {
            "lisbot":      min(lisbot_score, 100)    if lisbot_score    else None,
            "sentiment":  min(sentiment_score, 100) if sentiment_score else None,
            "engagement": min(engagement_score, 100) if engagement_score else None,
            "compliance": min(compliance_score, 100) if compliance_score else None,
        },
        "benchmarks": {
            "lisbot": 74, "sentiment": 72, "engagement": 70, "compliance": 78,
        },
        "weekday": [
            {"label": WEEKDAYS[i], "count": weekday_counts[i]} for i in range(7)
        ],
        "time_of_day": [
            {"label": TIME_SLOTS[i]["label"], "count": time_counts[i]}
            for i in range(len(TIME_SLOTS))
        ],
        "size": size_dist,
        "duration": dur_dist,
    })


# ── Workspace Overview ────────────────────────────────────────────────────────

@router.get("/workspace")
async def workspace_overview(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    since = datetime.now(timezone.utc) - timedelta(days=30)

    m_result = await session.execute(
        select(Meeting)
        .where(Meeting.user_id == current_user.id, Meeting.created_at >= since)
        .order_by(Meeting.created_at.desc())
        .limit(200)
    )
    meetings: list[Meeting] = list(m_result.scalars().all())
    n = len(meetings)
    meeting_ids = [m.id for m in meetings]

    summaries: dict[str, Summary] = {}
    if meeting_ids:
        s_result = await session.execute(
            select(Summary).where(Summary.meeting_id.in_(meeting_ids))
        )
        for s in s_result.scalars().all():
            summaries[s.meeting_id] = s

    transcripts_by_meeting: dict[str, list[Transcript]] = defaultdict(list)
    if meeting_ids:
        t_result = await session.execute(
            select(Transcript).where(Transcript.meeting_id.in_(meeting_ids))
        )
        for t in t_result.scalars().all():
            transcripts_by_meeting[t.meeting_id].append(t)

    # ── Heatmap + time_mgmt bucketing ─────────────────────────────
    SLOTS = ["6–9", "9–12", "12–15", "15–18", "18–21"]

    # Track completed / neutral / error meetings per day×slot
    slot_completed: dict[str, dict[str, int]] = {d: {s: 0 for s in SLOTS} for d in WEEKDAYS}
    slot_neutral:   dict[str, dict[str, int]] = {d: {s: 0 for s in SLOTS} for d in WEEKDAYS}
    slot_error:     dict[str, dict[str, int]] = {d: {s: 0 for s in SLOTS} for d in WEEKDAYS}

    late_start_by_day = {d: 0 for d in WEEKDAYS}
    overtime_by_day   = {d: 0 for d in WEEKDAYS}

    for m in meetings:
        ref_time = m.start_time or m.created_at
        if not ref_time:
            continue
        day_label = WEEKDAYS[ref_time.weekday()]
        hour = ref_time.hour

        for slot in TIME_SLOTS:
            if slot["start"] <= hour < slot["end"]:
                slot_label = slot["label"]
                if m.status == "completed" and m.id in summaries:
                    slot_completed[day_label][slot_label] += 1
                elif m.status == "error":
                    slot_error[day_label][slot_label] += 1
                else:
                    slot_neutral[day_label][slot_label] += 1
                break

        if ref_time.minute > 5:
            late_start_by_day[day_label] += 1

        if m.start_time and m.end_time:
            if (m.end_time - m.start_time).total_seconds() > 3600:
                overtime_by_day[day_label] += 1

    def _sentiment(day: str, slot: str) -> str:
        c = slot_completed[day][slot]
        ne = slot_neutral[day][slot]
        er = slot_error[day][slot]
        total = c + ne + er
        if total == 0:
            return "none"
        if er > 0 and er >= c:
            return "negative"
        if c > 0:
            return "positive"
        return "neutral"

    heatmap = {
        day: {slot: _sentiment(day, slot) for slot in SLOTS}
        for day in WEEKDAYS
    }

    # ── Scores ────────────────────────────────────────────────────
    completion_rate = len(summaries) / n if n else 0
    transcript_rate = sum(1 for mid in meeting_ids if transcripts_by_meeting[mid]) / n if n else 0

    lisbot_score    = min(round(60 + completion_rate * 25 + transcript_rate * 15), 100) if n else 0
    sentiment_score = min(round(65 + completion_rate * 20), 100) if n else 0
    engagement_score = min(round(55 + transcript_rate * 30), 100) if n else 0
    reference_score  = min(round(70 + completion_rate * 15), 100) if n else 0

    # ── Participation heuristic ───────────────────────────────────
    balanced_count = 0
    total_dominant_ratio = 0.0
    mtgs_with_ts = [mid for mid in meeting_ids if transcripts_by_meeting[mid]]

    for mid in mtgs_with_ts:
        speaker_words: dict[str, int] = defaultdict(int)
        for t in transcripts_by_meeting[mid]:
            if t.speaker:
                speaker_words[t.speaker] += len(t.text.split())
        if len(speaker_words) >= 2:
            total_words = sum(speaker_words.values()) or 1
            dominant = max(speaker_words.values()) / total_words
            total_dominant_ratio += dominant * 100
            if dominant < 0.6:
                balanced_count += 1

    denom = len(mtgs_with_ts) or 1
    balanced_pct   = round(balanced_count / denom * 100)
    avg_talk_ratio = round(total_dominant_ratio / denom)

    return ok({
        "meeting_count": n,
        "time_mgmt": {
            "late_start": late_start_by_day,
            "overtime":   overtime_by_day,
        },
        "heatmap": heatmap,
        "meeting_mgmt": {
            "lisbot_score": lisbot_score,
            "sentiment":   sentiment_score,
            "engagement":  engagement_score,
            "reference":   reference_score,
        },
        "participation": {
            "balanced_pct":   balanced_pct,
            "avg_talk_ratio": avg_talk_ratio,
        },
    })
