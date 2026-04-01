"""GPT-4 dual-round summarization endpoint."""

import os
import json
import logging
from datetime import datetime, timezone

import azure.functions as func
from shared.auth import get_current_user
from shared.config import get_openai_client, meetings_container, summaries_container, templates_container
from shared.responses import json_response, error_response

logger = logging.getLogger(__name__)
bp = func.Blueprint()


_LANG_INSTRUCTION = {
    "zh-TW": "使用繁體中文，專業商業語調",
    "zh-CN": "使用简体中文，专业商务语调",
    "en-US": "Use English, professional business tone",
    "ja-JP": "日本語を使用し、プロフェッショナルなビジネストーン",
    "nan-TW": "使用繁體中文（逐字稿含台語發音，請以文意理解後用繁體中文輸出）",
    "hak-TW": "使用繁體中文（逐字稿含客語發音，請以文意理解後用繁體中文輸出）",
    "auto": "依據逐字稿語言自動選擇輸出語言，優先使用繁體中文",
}


def _build_mode_prompts(lang_instruction: str) -> dict[str, str]:
    return {
        "meeting": f"""你是一位專業的商業會議記錄專家。請分析會議逐字稿並產生結構化報告。
規則：
1. 摘要必須包含：會議目的、關鍵決策、討論重點
2. 每位發言者的主要觀點要分別列出
3. 待辦事項必須明確標示負責人和截止日期（如有提及）
4. {lang_instruction}
5. 格式使用 Markdown""",
        "interview": f"""你是一位人資訪談記錄專家。請分析訪談逐字稿，重點提取：
1. 受訪者的核心回答與觀點
2. 關鍵問答摘要
3. 值得關注的發現
4. {lang_instruction}
5. 格式使用 Markdown""",
        "brainstorm": f"""你是一位創意工作坊記錄專家。請分析腦力激盪逐字稿，重點提取：
1. 所有提出的創意與想法（不過濾）
2. 反覆出現的主題
3. 值得深入探討的方向
4. {lang_instruction}
5. 格式使用 Markdown""",
        "lecture": f"""你是一位課程內容整理專家。請分析講座逐字稿，產生：
1. 主要教學重點摘要
2. 關鍵概念解釋
3. 重要例子或案例
4. {lang_instruction}
5. 格式使用 Markdown""",
        "standup": f"""你是一位敏捷開發會議記錄專家。請分析 Stand-up 逐字稿，提取：
1. 每位成員昨日完成事項
2. 今日計劃
3. 阻礙與問題
4. {lang_instruction}
5. 格式使用 Markdown""",
        "review": f"""你是一位技術評審記錄專家。請分析技術評審逐字稿，提取：
1. 技術議題與架構決策
2. 風險評估
3. 技術債務項目
4. {lang_instruction}
5. 格式使用 Markdown""",
        "client": f"""你是一位客戶會議記錄專家。請分析客戶會議逐字稿，提取：
1. 客戶需求與期望
2. 已達成的共識
3. 後續跟進事項
4. {lang_instruction}
5. 格式使用 Markdown""",
    }


@bp.route(route="api/summarize", methods=["POST"])
def summarize_meeting(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)

    try:
        body = req.get_json()
        transcript = body.get("transcript", "")
        meeting_title = body.get("meetingTitle", "未命名會議")
        speakers = body.get("speakers", [])
        meeting_id = body.get("meetingId", "")
        template_id = body.get("templateId", "standard")
        meeting_mode = body.get("mode", "meeting")
        language = body.get("language", "zh-TW")

        if len(transcript.strip()) < 10:
            return error_response("逐字稿內容太短", 400, req)

        # Load custom template system prompt override
        custom_prompt_override = None
        builtin_ids = {"standard", "action_focused", "decision_log", "brainstorm",
                       "interview", "lecture", "client"}
        if template_id and template_id not in builtin_ids:
            try:
                tmpl = templates_container().read_item(item=template_id, partition_key=user["sub"])
                custom_prompt_override = tmpl.get("systemPromptOverride") or None
            except Exception:
                pass

        lang_instruction = _LANG_INSTRUCTION.get(language, "使用繁體中文，專業商業語調")
        mode_prompts = _build_mode_prompts(lang_instruction)
        system_prompt = custom_prompt_override or mode_prompts.get(meeting_mode, mode_prompts["meeting"])

        user_prompt = f"""會議標題：{meeting_title}
與會者：{', '.join(speakers)}
時間：{datetime.now().strftime('%Y-%m-%d %H:%M')}

會議逐字稿：
{transcript[:15000]}

請產生：
1. 會議摘要 (3-5 個重點)
2. 各發言者觀點分析
3. 具體決議事項
4. 待辦事項清單 (負責人 + Deadline)
5. 下次會議建議議題（如有）"""

        openai_client = get_openai_client()
        deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4")

        # Round 1: Markdown summary
        summary_res = openai_client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
        )
        summary_text = summary_res.choices[0].message.content

        # Round 2: Structured JSON extraction
        action_prompt = f"""從以下會議摘要中提取所有待辦事項，嚴格回傳以下 JSON 格式，不要包含其他文字：
{{
  "action_items": [
    {{
      "task": "任務描述",
      "assignee": "負責人或'待確認'",
      "priority": "高|中|低",
      "deadline": "YYYY-MM-DD 或 null",
      "category": "技術|業務|行政|其他"
    }}
  ],
  "key_decisions": ["決策1"],
  "next_meeting_topics": ["議題1"]
}}

摘要內容：
{summary_text}"""

        action_res = openai_client.chat.completions.create(
            model=deployment,
            messages=[{"role": "user", "content": action_prompt}],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        structured = json.loads(action_res.choices[0].message.content)

        result = {
            "summary": summary_text,
            "actionItems": structured.get("action_items", []),
            "keyDecisions": structured.get("key_decisions", []),
            "nextMeetingTopics": structured.get("next_meeting_topics", []),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "templateId": template_id,
            "language": language,
        }

        if meeting_id:
            summaries_container().upsert_item({
                "id": meeting_id,
                "meetingId": meeting_id,
                **result,
            })
            try:
                meeting = meetings_container().read_item(item=meeting_id, partition_key=meeting_id)
                meeting["status"] = "completed"
                meeting["endTime"] = datetime.now(timezone.utc).isoformat()
                meetings_container().replace_item(item=meeting_id, body=meeting)
            except Exception:
                pass

        return json_response(result, req=req)

    except Exception as e:
        logger.error(f"Summarize error: {e}")
        return error_response(str(e), 500, req)
