"""xCloud Lisbot — /api/copilot/chat  (Azure OpenAI streaming assistant)."""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.limiter import limiter
from shared.config import AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT
from shared.database import Meeting, Summary, get_async_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/copilot", tags=["copilot"])


# ── Request schema ─────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    language: str = "zh-TW"


# ── Build context from DB ──────────────────────────────────────
async def _build_context(user_id: str, session: AsyncSession) -> str:
    """Fetch recent meetings + summaries and format as context string."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    rows = await session.execute(
        select(Meeting, Summary)
        .outerjoin(Summary, Summary.meeting_id == Meeting.id)
        .where(Meeting.user_id == user_id)
        .where(Meeting.created_at >= cutoff)
        .order_by(Meeting.created_at.desc())
        .limit(30)
    )
    pairs = rows.all()

    if not pairs:
        return "（使用者目前沒有會議記錄）"

    lines: list[str] = []
    for meeting, summary in pairs:
        date_str = ""
        if meeting.start_time:
            dt = meeting.start_time
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            date_str = dt.strftime("%Y-%m-%d %H:%M")

        line = f"• [{meeting.id}] {meeting.title or '無標題'} ({date_str})"
        if meeting.folder:
            line += f" [資料夾:{meeting.folder}]"
        if meeting.participants:
            line += f" [參與者:{meeting.participants}人]"

        if summary:
            if summary.markdown:
                # markdown field stores the full summary text; extract first 200 chars as brief
                brief = summary.markdown[:200].replace("\n", " ")
                line += f"\n  摘要：{brief}"

            if summary.action_items:
                # action_items is stored as JSON list directly in the column
                items = summary.action_items if isinstance(summary.action_items, list) else []
                if items:
                    action_str = "、".join(str(i.get("text", i)) if isinstance(i, dict) else str(i) for i in items[:3])
                    line += f"\n  行動事項：{action_str}"

        lines.append(line)

    return "\n".join(lines)


# ── System prompt ──────────────────────────────────────────────
def _system_prompt(user_name: str, context: str, language: str) -> str:
    today = datetime.now().strftime("%Y年%m月%d日")
    lang_hint = "請以繁體中文回答。" if language.startswith("zh") else f"Reply in {language}."

    return f"""你是 xCloud Lisbot 的智能搜尋助手，專門協助使用者查詢與分析他們的會議記錄。
{lang_hint}

使用者：{user_name}
今天日期：{today}

以下是使用者近 30 天的會議記錄（格式：[會議ID] 標題 日期 摘要 行動事項）：

{context}

回答規則：
1. 根據以上會議資料回答問題，不要捏造資料。
2. 提到特定會議時，請標注 [會議ID]，讓使用者可以點擊查看。
3. 若使用者問的資料超出 30 天範圍或無相關記錄，誠實告知。
4. 回答簡潔有重點，使用條列式格式讓內容易讀。
5. 若使用者詢問行動事項，整理成待辦清單格式。"""


# ── OpenAI streaming ───────────────────────────────────────────
async def _stream_openai(
    system: str,
    history: list[ChatMessage],
    user_message: str,
) -> AsyncGenerator[str, None]:
    """Call Azure OpenAI and yield SSE chunks."""
    try:
        from openai import AsyncAzureOpenAI
    except ImportError:
        yield f"data: {json.dumps({'error': 'openai SDK not installed'})}\n\n"
        return

    if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_KEY:
        # Fallback mock response for dev environment
        mock = f"（開發模式：Azure OpenAI 未設定。您問的是：「{user_message}」）\n\n請在環境變數中設定 AZURE_OPENAI_ENDPOINT 與 AZURE_OPENAI_KEY。"
        for char in mock:
            yield f"data: {json.dumps({'delta': char})}\n\n"
        yield "data: [DONE]\n\n"
        return

    client = AsyncAzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_KEY,
        api_version="2024-02-01",
    )

    messages = [{"role": "system", "content": system}]
    for h in history[-10:]:  # keep last 10 turns
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": user_message})

    try:
        stream = await client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=messages,
            stream=True,
            max_tokens=1024,
            temperature=0.5,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield f"data: {json.dumps({'delta': delta})}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        logger.error(f"OpenAI stream error: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


# ── Route ──────────────────────────────────────────────────────
@router.post("/chat")
@limiter.limit("20/minute")
async def copilot_chat(
    request: Request,
    body: ChatRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    context = await _build_context(str(current_user.id), session)
    system = _system_prompt(
        user_name=current_user.name or "使用者",
        context=context,
        language=body.language,
    )

    async def generate():
        async for chunk in _stream_openai(system, body.history, body.message):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
