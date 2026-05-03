"""XMeet AI — /api/analytics/for-you personalised insights."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.database import Meeting, Summary, get_async_session
from shared.responses import ok

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _extract_keywords(title: str) -> list[str]:
    """Very lightweight CJK + Latin keyword extraction from a meeting title."""
    # Split on common separators / stopwords
    stop = {"會議", "討論", "會", "的", "與", "及", "和", "第", "次", "周", "週",
            "月", "日", "年", "線上", "【", "】", "（", "）", "(", ")", "-", "—",
            "meeting", "call", "sync", "review", "update", "standup"}
    # Tokenise: CJK chars (1-4 char groups) + latin words
    cjk_tokens = re.findall(r'[一-鿿㐀-䶿]{2,4}', title)
    latin_tokens = re.findall(r'[A-Za-z]{3,}', title)
    tokens = cjk_tokens + [t.lower() for t in latin_tokens]
    return [t for t in tokens if t not in stop]


def _cluster_meetings(meetings: list[Meeting]) -> list[dict]:
    """Group meetings by folder first; ungrouped ones form keyword clusters."""
    folder_groups: dict[str, list[Meeting]] = defaultdict(list)
    unfoldered: list[Meeting] = []

    for m in meetings:
        if m.folder:
            folder_groups[m.folder].append(m)
        else:
            unfoldered.append(m)

    clusters: list[dict] = []

    # Folder-based clusters (2+ members)
    for folder, mlist in folder_groups.items():
        if len(mlist) >= 2:
            clusters.append({
                "label": folder,
                "meetings": [{"id": m.id, "title": m.title,
                               "created_at": m.created_at.isoformat() if m.created_at else None}
                              for m in sorted(mlist, key=lambda x: x.created_at or datetime.min, reverse=True)[:4]],
            })

    # Keyword-based clusters for ungrouped meetings
    keyword_map: dict[str, list[Meeting]] = defaultdict(list)
    for m in unfoldered:
        for kw in _extract_keywords(m.title or "")[:2]:  # top 2 keywords per meeting
            keyword_map[kw].append(m)

    seen_ids: set[str] = set()
    for kw, mlist in sorted(keyword_map.items(), key=lambda x: -len(x[1])):
        unique = [m for m in mlist if m.id not in seen_ids]
        if len(unique) >= 2:
            for m in unique:
                seen_ids.add(m.id)
            clusters.append({
                "label": kw,
                "meetings": [{"id": m.id, "title": m.title,
                               "created_at": m.created_at.isoformat() if m.created_at else None}
                              for m in sorted(unique, key=lambda x: x.created_at or datetime.min, reverse=True)[:4]],
            })

    return clusters[:6]  # cap at 6 clusters


@router.get("/for-you")
async def for_you(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    since = datetime.now(timezone.utc) - timedelta(days=30)

    # Fetch recent meetings
    m_result = await session.execute(
        select(Meeting)
        .where(Meeting.user_id == current_user.id, Meeting.created_at >= since)
        .order_by(Meeting.created_at.desc())
        .limit(100)
    )
    meetings: list[Meeting] = list(m_result.scalars().all())
    meeting_ids = [m.id for m in meetings]

    # Fetch summaries for those meetings
    summaries: dict[str, Summary] = {}
    if meeting_ids:
        s_result = await session.execute(
            select(Summary).where(Summary.meeting_id.in_(meeting_ids))
        )
        for s in s_result.scalars().all():
            summaries[s.meeting_id] = s

    meeting_map = {m.id: m for m in meetings}

    # ── Themes ──────────────────────────────────────────────────
    folder_counts: dict[str, int] = defaultdict(int)
    folder_meeting_ids: dict[str, list[str]] = defaultdict(list)
    for m in meetings:
        key = m.folder or "未分類"
        folder_counts[key] += 1
        folder_meeting_ids[key].append(m.id)

    themes = [
        {
            "label": folder,
            "count": cnt,
            "meeting_ids": folder_meeting_ids[folder][:5],
        }
        for folder, cnt in sorted(folder_counts.items(), key=lambda x: -x[1])
        if cnt >= 1
    ][:8]

    # ── Action items ─────────────────────────────────────────────
    action_items: list[dict] = []
    for mid, s in summaries.items():
        items = s.action_items or []
        m = meeting_map.get(mid)
        if not m:
            continue
        if isinstance(items, list):
            for item in items:
                text = item if isinstance(item, str) else item.get("text", str(item))
                action_items.append({
                    "text": text,
                    "meeting_id": mid,
                    "meeting_title": m.title,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                    "done": item.get("done", False) if isinstance(item, dict) else False,
                })

    pending_actions = [a for a in action_items if not a.get("done")][:20]

    # ── Related content ──────────────────────────────────────────
    related = _cluster_meetings(meetings)

    # ── Key issues ───────────────────────────────────────────────
    key_issues: list[dict] = []
    for mid, s in summaries.items():
        m = meeting_map.get(mid)
        if not m:
            continue
        decisions = s.key_decisions or []
        if isinstance(decisions, list):
            for d in decisions:
                text = d if isinstance(d, str) else d.get("text", str(d))
                # Heuristic: flag as issue if it contains question marks or unresolved keywords
                is_issue = ("?" in text or "？" in text or
                            any(kw in text for kw in ["待確認", "待解決", "未決", "問題", "風險", "阻塞"]))
                if is_issue:
                    key_issues.append({
                        "text": text,
                        "meeting_id": mid,
                        "meeting_title": m.title,
                        "created_at": m.created_at.isoformat() if m.created_at else None,
                    })

    # Also flag meetings with no summary as "pending transcription" issues
    unsummarised = [m for m in meetings if m.id not in summaries and m.status == "processing"]
    for m in unsummarised[:3]:
        key_issues.append({
            "text": f"「{m.title}」摘要仍在處理中",
            "meeting_id": m.id,
            "meeting_title": m.title,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })

    return ok({
        "period_days": 30,
        "meeting_count": len(meetings),
        "themes": themes,
        "action_items": pending_actions,
        "related": related,
        "key_issues": key_issues[:10],
    })
