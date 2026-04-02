"""GPT-4 dual-round summarization endpoint."""

import os
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Depends, HTTPException

from shared.auth import get_current_user
from shared.config import get_openai_client
from shared.database import get_session, Meeting, Summary, Template

logger = logging.getLogger(__name__)
router = APIRouter()

_LANG_INSTRUCTION = {
    "zh-TW": "使用繁體中文，專業商業語調",
    "zh-CN": "使用简体中文，专业商务语调",
    "en-US": "Use English, professional business tone",
    "ja-JP": "日本語を使用し、プロフェッショナルなビジネストーン",
    "nan-TW": "使用繁體中文（逐字稿含台語發音，請以文意理解後用繁體中文輸出）",
    "hak-TW": "使用繁體中文（逐字稿含客語發音，請以文意理解後用繁體中文輸出）",
    "auto": "依據逐字稿語言自動選擇輸出語言，優先使用繁體中文",
}


def _build_mode_prompts(lang_inst: str) -> dict[str, str]:
    return {
        "meeting": f"你是專業的商業會議記錄專家。分析逐字稿產生結構化報告：摘要、關鍵決策、討論重點、待辦事項（含負責人和截止日期）。{lang_inst}。Markdown 格式。",
        "interview": f"你是人資訪談記錄專家。提取受訪者核心回答、關鍵問答、值得關注的發現。{lang_inst}。Markdown 格式。",
        "brainstorm": f"你是創意工作坊記錄專家。整理所有創意想法、反覆出現的主題、值得深入探討的方向。{lang_inst}。Markdown 格式。",
        "lecture": f"你是課程內容整理專家。提取主要教學重點、關鍵概念、重要例子。{lang_inst}。Markdown 格式。",
        "standup": f"你是敏捷開發會議記錄專家。整理每位成員昨日完成、今日計劃、阻礙與問題。{lang_inst}。Markdown 格式。",
        "review": f"你是技術評審記錄專家。整理技術議題、架構決策、風險評估、技術債務。{lang_inst}。Markdown 格式。",
        "client": f"你是客戶會議記錄專家。整理客戶需求、已達成共識、後續跟進事項。{lang_inst}。Markdown 格式。",
    }


@router.post("/api/summarize")
async def summarize_meeting(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    transcript = body.get("transcript", "")
    meeting_title = body.get("meetingTitle", "未命名會議")
    speakers = body.get("speakers", [])
    meeting_id = body.get("meetingId", "")
    template_id = body.get("templateId", "standard")
    meeting_mode = body.get("mode", "meeting")
    language = body.get("language", "zh-TW")

    if len(transcript.strip()) < 10:
        raise HTTPException(400, "逐字稿內容太短")

    # Check custom template
    custom_prompt = None
    builtin_ids = {"standard", "action_focused", "decision_log", "brainstorm", "interview", "lecture", "client"}
    if template_id and template_id not in builtin_ids:
        session = get_session()
        try:
            tmpl = session.get(Template, template_id)
            if tmpl and tmpl.system_prompt_override:
                custom_prompt = tmpl.system_prompt_override
        finally:
            session.close()

    lang_inst = _LANG_INSTRUCTION.get(language, "使用繁體中文，專業商業語調")
    mode_prompts = _build_mode_prompts(lang_inst)
    system_prompt = custom_prompt or mode_prompts.get(meeting_mode, mode_prompts["meeting"])

    user_prompt = f"會議標題：{meeting_title}\n與會者：{', '.join(speakers)}\n時間：{datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n逐字稿：\n{transcript[:15000]}\n\n請產生完整會議摘要、決議事項、待辦清單。"

    oc = get_openai_client()
    dep = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4")

    r1 = oc.chat.completions.create(model=dep,
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        temperature=0.3, max_tokens=2000)
    summary_text = r1.choices[0].message.content

    r2 = oc.chat.completions.create(model=dep,
        messages=[{"role": "user", "content": f'從以下摘要提取 JSON：{{"action_items":[{{"task":"","assignee":"","priority":"高|中|低","deadline":"YYYY-MM-DD或null","category":"技術|業務|行政|其他"}}],"key_decisions":[],"next_meeting_topics":[]}}\n\n{summary_text}'}],
        temperature=0.1, response_format={"type": "json_object"})
    try:
        structured = json.loads(r2.choices[0].message.content)
    except (json.JSONDecodeError, TypeError):
        structured = {"action_items": [], "key_decisions": [], "next_meeting_topics": []}

    result = {
        "summary": summary_text,
        "actionItems": structured.get("action_items", []),
        "keyDecisions": structured.get("key_decisions", []),
        "nextMeetingTopics": structured.get("next_meeting_topics", []),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "templateId": template_id, "language": language,
    }

    if meeting_id:
        session = get_session()
        try:
            # Upsert summary
            existing = session.get(Summary, meeting_id)
            if existing:
                existing.summary = summary_text
                existing.action_items = structured.get("action_items", [])
                existing.key_decisions = structured.get("key_decisions", [])
                existing.next_meeting_topics = structured.get("next_meeting_topics", [])
                existing.template_id = template_id
                existing.language = language
                existing.generated_at = datetime.now(timezone.utc)
            else:
                session.add(Summary(id=meeting_id, meeting_id=meeting_id, summary=summary_text,
                    action_items=structured.get("action_items", []),
                    key_decisions=structured.get("key_decisions", []),
                    next_meeting_topics=structured.get("next_meeting_topics", []),
                    template_id=template_id, language=language,
                    generated_at=datetime.now(timezone.utc)))
            # Update meeting status
            m = session.get(Meeting, meeting_id)
            if m:
                m.status = "completed"
                m.end_time = datetime.now(timezone.utc)
            session.commit()
        finally:
            session.close()

    return result
