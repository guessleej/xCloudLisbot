"""XMeet AI — GPT-4 meeting summarization endpoint."""

import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.config import (
    AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY,
)
from shared.database import Meeting, Summary, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["summarize"])

# ── System prompts by meeting mode ────────────────────────────────────────────

MODE_PROMPTS: dict[str, str] = {
    "meeting": "你是一位專業的會議記錄助手。請根據逐字稿產生繁體中文的會議摘要。",
    "interview": "你是一位人資面試記錄助手。請根據逐字稿產生繁體中文的面試摘要。",
    "brainstorm": "你是一位創意腦力激盪記錄助手。請根據逐字稿產生繁體中文的腦力激盪摘要。",
    "lecture": "你是一位課程記錄助手。請根據逐字稿產生繁體中文的課程摘要。",
    "standup": "你是一位敏捷開發站立會議助手。請根據逐字稿產生繁體中文的站立會議摘要。",
    "review": "你是一位程式碼審查記錄助手。請根據逐字稿產生繁體中文的審查摘要。",
    "client": "你是一位客戶會議記錄助手。請根據逐字稿產生繁體中文的客戶會議摘要。",
}

DEFAULT_SYSTEM_PROMPT = MODE_PROMPTS["meeting"]

SUMMARY_INSTRUCTION = """
請產出 JSON 格式，包含以下欄位：
{
  "markdown": "完整的 Markdown 格式摘要",
  "action_items": ["行動事項1", "行動事項2"],
  "key_decisions": ["關鍵決策1", "關鍵決策2"],
  "next_meeting_topics": ["下次議題1", "下次議題2"]
}
只回傳 JSON，不要加任何前置說明。
"""


# ── Pydantic body ─────────────────────────────────────────────────────────────

class SummarizeBody(BaseModel):
    meetingId: str
    transcript: str
    meetingTitle: str = ""
    speakers: list[str] = []
    templateId: str | None = None
    mode: str = "meeting"
    systemPromptOverride: str | None = None


# ── Mock summary (when OpenAI is not configured) ──────────────────────────────

def _mock_summary(meeting_title: str) -> dict:
    return {
        "markdown": f"# {meeting_title or '會議摘要'}\n\n> （AI 服務未設定，顯示示範摘要）\n\n## 討論內容\n- 議題一\n- 議題二\n\n## 結論\n- 待定",
        "action_items": ["確認下次開會時間", "整理會議記錄"],
        "key_decisions": ["延後決策"],
        "next_meeting_topics": ["進度追蹤"],
    }


# ── Azure OpenAI call ─────────────────────────────────────────────────────────

async def _call_openai(system_prompt: str, transcript: str, meeting_title: str) -> dict:
    endpoint = AZURE_OPENAI_ENDPOINT.rstrip("/")
    url = f"{endpoint}/openai/deployments/{AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-01"

    user_message = (
        f"會議名稱：{meeting_title}\n\n"
        f"逐字稿：\n{transcript}\n\n"
        f"{SUMMARY_INSTRUCTION}"
    )

    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.3,
        "max_tokens": 2000,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={
                "api-key": AZURE_OPENAI_KEY,
                "Content-Type": "application/json",
            },
        )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]

    import json
    return json.loads(content)


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/summarize")
@limiter.limit("10/minute")
async def summarize(
    request: Request,
    body: SummarizeBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    # Verify meeting ownership
    result = await session.execute(
        select(Meeting).where(Meeting.id == body.meetingId, Meeting.user_id == user.id)
    )
    meeting = result.scalar_one_or_none()
    if meeting is None:
        return error("Meeting not found or access denied", 404)

    if not body.transcript.strip():
        return error("Transcript is empty", 400)

    # Determine system prompt
    system_prompt = (
        body.systemPromptOverride
        or MODE_PROMPTS.get(body.mode, DEFAULT_SYSTEM_PROMPT)
    )

    # Generate summary
    if AZURE_OPENAI_KEY and AZURE_OPENAI_ENDPOINT:
        try:
            result_data = await _call_openai(system_prompt, body.transcript, body.meetingTitle)
        except Exception as exc:
            logger.error(f"OpenAI call failed: {exc}")
            result_data = _mock_summary(body.meetingTitle)
    else:
        result_data = _mock_summary(body.meetingTitle)

    # Upsert Summary row
    existing_result = await session.execute(
        select(Summary).where(Summary.meeting_id == body.meetingId)
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.markdown = result_data.get("markdown", "")
        existing.action_items = result_data.get("action_items", [])
        existing.key_decisions = result_data.get("key_decisions", [])
        existing.next_meeting_topics = result_data.get("next_meeting_topics", [])
        existing.generated_at = datetime.now(timezone.utc)
        existing.template_id = body.templateId
        summary = existing
    else:
        summary = Summary(
            id=str(uuid.uuid4()),
            meeting_id=body.meetingId,
            markdown=result_data.get("markdown", ""),
            action_items=result_data.get("action_items", []),
            key_decisions=result_data.get("key_decisions", []),
            next_meeting_topics=result_data.get("next_meeting_topics", []),
            generated_at=datetime.now(timezone.utc),
            template_id=body.templateId,
        )
        session.add(summary)

    # Update meeting status
    meeting.status = "completed"
    await session.commit()
    await session.refresh(summary)

    return ok({
        "id": summary.id,
        "meetingId": body.meetingId,
        "markdown": summary.markdown,
        "actionItems": summary.action_items,
        "keyDecisions": summary.key_decisions,
        "nextMeetingTopics": summary.next_meeting_topics,
        "generatedAt": summary.generated_at.isoformat() if summary.generated_at else None,
    })
