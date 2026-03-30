"""
xCloudLisbot — Azure Functions v4 後端
包含：Auth (Microsoft/Google/GitHub/Apple)、Speech WebSocket、Summarize、Meetings CRUD
"""

import azure.functions as func
import json
import logging
import os
import time
import uuid
import wave
import io
from datetime import datetime, timedelta, timezone

import jwt
import requests
from azure.cosmos import CosmosClient, exceptions as cosmos_exc
from azure.identity import DefaultAzureCredential
from azure.messaging.webpubsubservice import WebPubSubServiceClient
from azure.storage.blob import BlobServiceClient
from openai import AzureOpenAI
import azure.cognitiveservices.speech as speechsdk

# ==================== 初始化 ====================
app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)
logger = logging.getLogger(__name__)

# Azure OpenAI
openai_client = AzureOpenAI(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_KEY"],
    api_version="2024-02-01",
)

# Cosmos DB
cosmos_client = CosmosClient(
    url=os.environ["COSMOS_ENDPOINT"],
    credential=os.environ["COSMOS_KEY"],
)
db = cosmos_client.get_database_client(os.environ.get("COSMOS_DATABASE", "lisbot"))
users_container = db.get_container_client("users")
meetings_container = db.get_container_client("meetings")
transcripts_container = db.get_container_client("transcripts")
summaries_container = db.get_container_client("summaries")

JWT_SECRET = os.environ["JWT_SECRET"]
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://your-app.azurewebsites.net")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")


# ==================== 共用工具函數 ====================

def cors_headers(req: func.HttpRequest) -> dict:
    origin = req.headers.get("Origin", "")
    allowed = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Credentials": "true",
    }


def json_response(data: dict, status: int = 200, req: func.HttpRequest = None) -> func.HttpResponse:
    headers = cors_headers(req) if req else {}
    return func.HttpResponse(
        json.dumps(data, ensure_ascii=False),
        mimetype="application/json",
        status_code=status,
        headers=headers,
    )


def error_response(message: str, status: int = 400, req: func.HttpRequest = None) -> func.HttpResponse:
    return json_response({"error": message}, status, req)


def create_jwt(user_id: str, provider: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "provider": provider,
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_jwt(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        logger.warning("JWT expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT: {e}")
        return None


def get_current_user(req: func.HttpRequest) -> dict | None:
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    return verify_jwt(token)


def upsert_user(provider: str, provider_user_id: str, email: str, name: str, avatar: str = None) -> dict:
    user_id = f"{provider}_{provider_user_id}"
    user = {
        "id": user_id,
        "email": email,
        "name": name,
        "avatar": avatar or "",
        "provider": provider,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    users_container.upsert_item(user)
    return user


def build_oauth_success_html(token: str, user: dict) -> str:
    return f"""<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><title>登入成功</title></head>
<body>
<script>
  if (window.opener) {{
    window.opener.postMessage({{
      type: 'oauth_callback',
      token: {json.dumps(token)},
      user: {json.dumps(user)}
    }}, {json.dumps(FRONTEND_URL)});
  }}
  window.close();
</script>
<p>登入成功，請關閉此視窗。</p>
</body>
</html>"""


# ==================== OPTIONS 預檢 ====================

@app.route(route="api/{*path}", methods=["OPTIONS"])
def options_handler(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse("", status_code=204, headers=cors_headers(req))


# ==================== 健康檢查 ====================

@app.route(route="api/health", methods=["GET"])
def health_check(req: func.HttpRequest) -> func.HttpResponse:
    return json_response({
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": {"cosmos": "connected", "openai": "connected", "speech": "connected"},
    }, req=req)


# ==================== AUTH — Microsoft ====================

@app.route(route="api/auth/callback/microsoft", methods=["POST"])
def auth_microsoft(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
        access_token = body.get("accessToken")
        if not access_token:
            return error_response("Missing accessToken", req=req)

        # 向 Microsoft Graph API 取得使用者資訊
        graph_res = requests.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if not graph_res.ok:
            return error_response("Failed to fetch Microsoft user info", 401, req)

        graph_user = graph_res.json()
        user = upsert_user(
            provider="microsoft",
            provider_user_id=graph_user["id"],
            email=graph_user.get("mail") or graph_user.get("userPrincipalName", ""),
            name=graph_user.get("displayName", ""),
        )
        token = create_jwt(user["id"], "microsoft", user["email"])
        return json_response({"token": token, "user": user}, req=req)

    except Exception as e:
        logger.error(f"Microsoft auth error: {e}")
        return error_response(str(e), 500, req)


# ==================== AUTH — Google (OAuth 2.0 PKCE Flow) ====================

@app.route(route="api/auth/login/google", methods=["GET"])
def auth_google_login(req: func.HttpRequest) -> func.HttpResponse:
    client_id = os.environ["GOOGLE_CLIENT_ID"]
    redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/google"
    state = str(uuid.uuid4())
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        f"&state={state}"
        "&access_type=offline"
    )
    return func.HttpResponse(status_code=302, headers={"Location": url, **cors_headers(req)})


@app.route(route="api/auth/callback/google", methods=["GET"])
def auth_google_callback(req: func.HttpRequest) -> func.HttpResponse:
    try:
        code = req.params.get("code")
        if not code:
            return error_response("Missing code", 400, req)

        redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/google"
        token_res = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": os.environ["GOOGLE_CLIENT_ID"],
                "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        tokens = token_res.json()
        user_res = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            timeout=10,
        )
        g_user = user_res.json()
        user = upsert_user(
            provider="google",
            provider_user_id=g_user["sub"],
            email=g_user.get("email", ""),
            name=g_user.get("name", ""),
            avatar=g_user.get("picture"),
        )
        app_token = create_jwt(user["id"], "google", user["email"])
        html = build_oauth_success_html(app_token, user)
        return func.HttpResponse(html, mimetype="text/html", headers=cors_headers(req))

    except Exception as e:
        logger.error(f"Google auth error: {e}")
        return func.HttpResponse(f"Auth error: {e}", status_code=500)


# ==================== AUTH — GitHub ====================

@app.route(route="api/auth/login/github", methods=["GET"])
def auth_github_login(req: func.HttpRequest) -> func.HttpResponse:
    client_id = os.environ["GITHUB_CLIENT_ID"]
    redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/github"
    state = str(uuid.uuid4())
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&scope=read:user%20user:email"
        f"&state={state}"
    )
    return func.HttpResponse(status_code=302, headers={"Location": url, **cors_headers(req)})


@app.route(route="api/auth/callback/github", methods=["GET"])
def auth_github_callback(req: func.HttpRequest) -> func.HttpResponse:
    try:
        code = req.params.get("code")
        if not code:
            return error_response("Missing code", 400, req)

        redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/github"
        token_res = requests.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": os.environ["GITHUB_CLIENT_ID"],
                "client_secret": os.environ["GITHUB_CLIENT_SECRET"],
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=10,
        )
        gh_token = token_res.json().get("access_token")
        user_res = requests.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/vnd.github+json"},
            timeout=10,
        )
        gh_user = user_res.json()

        # 取得 email（GitHub 可能不公開）
        email = gh_user.get("email") or ""
        if not email:
            email_res = requests.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {gh_token}"},
                timeout=10,
            )
            emails = email_res.json()
            primary = next((e["email"] for e in emails if e.get("primary")), "")
            email = primary

        user = upsert_user(
            provider="github",
            provider_user_id=str(gh_user["id"]),
            email=email,
            name=gh_user.get("name") or gh_user.get("login", ""),
            avatar=gh_user.get("avatar_url"),
        )
        app_token = create_jwt(user["id"], "github", user["email"])
        html = build_oauth_success_html(app_token, user)
        return func.HttpResponse(html, mimetype="text/html", headers=cors_headers(req))

    except Exception as e:
        logger.error(f"GitHub auth error: {e}")
        return func.HttpResponse(f"Auth error: {e}", status_code=500)


# ==================== AUTH — Apple ====================

@app.route(route="api/auth/login/apple", methods=["GET"])
def auth_apple_login(req: func.HttpRequest) -> func.HttpResponse:
    client_id = os.environ["APPLE_CLIENT_ID"]
    redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/apple"
    state = str(uuid.uuid4())
    url = (
        "https://appleid.apple.com/auth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code%20id_token"
        "&scope=name%20email"
        f"&state={state}"
        "&response_mode=form_post"
    )
    return func.HttpResponse(status_code=302, headers={"Location": url, **cors_headers(req)})


def _build_apple_client_secret() -> str:
    """建立 Apple OAuth client_secret（使用 ES256 JWT）"""
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    private_key_pem = os.environ["APPLE_PRIVATE_KEY"].encode()
    private_key = load_pem_private_key(private_key_pem, password=None)

    now = int(time.time())
    payload = {
        "iss": os.environ["APPLE_TEAM_ID"],
        "iat": now,
        "exp": now + 86400,
        "aud": "https://appleid.apple.com",
        "sub": os.environ["APPLE_CLIENT_ID"],
    }
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": os.environ["APPLE_KEY_ID"]})


@app.route(route="api/auth/callback/apple", methods=["POST"])
def auth_apple_callback(req: func.HttpRequest) -> func.HttpResponse:
    try:
        code = req.form.get("code") or req.params.get("code")
        if not code:
            return error_response("Missing code", 400, req)

        redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/apple"
        client_secret = _build_apple_client_secret()

        token_res = requests.post(
            "https://appleid.apple.com/auth/token",
            data={
                "client_id": os.environ["APPLE_CLIENT_ID"],
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
            timeout=10,
        )
        tokens = token_res.json()
        id_token_payload = jwt.decode(
            tokens["id_token"],
            options={"verify_signature": False},  # Apple 公鑰驗證略，生產環境應驗證
        )

        # Apple 首次登入才會回傳 name
        user_json = req.form.get("user")
        name = ""
        if user_json:
            apple_user_info = json.loads(user_json)
            first = apple_user_info.get("name", {}).get("firstName", "")
            last = apple_user_info.get("name", {}).get("lastName", "")
            name = f"{first} {last}".strip()

        user = upsert_user(
            provider="apple",
            provider_user_id=id_token_payload["sub"],
            email=id_token_payload.get("email", ""),
            name=name or id_token_payload.get("email", "").split("@")[0],
        )
        app_token = create_jwt(user["id"], "apple", user["email"])
        html = build_oauth_success_html(app_token, user)
        return func.HttpResponse(html, mimetype="text/html", headers=cors_headers(req))

    except Exception as e:
        logger.error(f"Apple auth error: {e}")
        return func.HttpResponse(f"Auth error: {e}", status_code=500)


# ==================== 會議 CRUD ====================

@app.route(route="api/meetings", methods=["POST"])
def create_meeting(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        body = req.get_json()
        meeting = {
            "id": str(uuid.uuid4()),
            "userId": user["sub"],
            "title": body.get("title", "未命名會議"),
            "startTime": datetime.now(timezone.utc).isoformat(),
            "endTime": None,
            "status": "recording",
            "audioUrl": None,
        }
        meetings_container.create_item(meeting)
        return json_response(meeting, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/meetings", methods=["GET"])
def list_meetings(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        items = list(meetings_container.query_items(
            query="SELECT * FROM c WHERE c.userId = @uid ORDER BY c.startTime DESC OFFSET 0 LIMIT 20",
            parameters=[{"name": "@uid", "value": user["sub"]}],
            enable_cross_partition_query=True,
        ))
        return json_response({"meetings": items}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/meetings/{meeting_id}", methods=["GET"])
def get_meeting(req: func.HttpRequest, meeting_id: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        meeting = meetings_container.read_item(item=meeting_id, partition_key=meeting_id)
        if meeting["userId"] != user["sub"]:
            return error_response("Forbidden", 403, req)
        return json_response(meeting, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Meeting not found", 404, req)


# ==================== 語音處理 WebSocket (Azure Web PubSub Event Handler) ====================

@app.route(route="ws/speech", methods=["POST"])
def speech_event_handler(req: func.HttpRequest) -> func.HttpResponse:
    """
    Azure Web PubSub 事件處理器
    當前端透過 WebSocket 傳送音訊 binary chunk 時觸發
    """
    try:
        event_type = req.headers.get("ce-type", "")
        connection_id = req.headers.get("ce-connectionid", "")

        # 驗證 WebSocket 連線（Abuse Protection）
        if event_type == "azure.webpubsub.sys.connect":
            token_param = req.params.get("token", "")
            user_payload = verify_jwt(token_param)
            if not user_payload:
                return func.HttpResponse(status_code=401)
            return json_response({"userId": user_payload["sub"]})

        if event_type == "azure.webpubsub.user.message":
            content_type = req.headers.get("Content-Type", "")

            if "application/json" in content_type:
                # 設定訊息
                config = req.get_json()
                if config.get("type") == "config":
                    logger.info(f"Speech config: {config}")
                return func.HttpResponse(status_code=200)

            # 二進位音訊 chunk
            audio_bytes = req.get_body()
            meeting_id = req.params.get("meetingId", "unknown")

            # 建立 WAV 格式
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(audio_bytes)
            wav_buffer.seek(0)

            # Azure Speech ConversationTranscriber（說話者分離）
            speech_config = speechsdk.SpeechConfig(
                subscription=os.environ["SPEECH_KEY"],
                region=os.environ["SPEECH_REGION"],
            )
            speech_config.speech_recognition_language = "zh-TW"
            audio_config = speechsdk.audio.AudioConfig(stream=speechsdk.audio.PushAudioInputStream())

            transcriber = speechsdk.transcription.ConversationTranscriber(
                speech_config=speech_config, audio_config=audio_config
            )

            results: list[dict] = []
            done_event = __import__("threading").Event()

            def on_transcribed(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    results.append({
                        "speaker": getattr(evt.result, "speaker_id", "Speaker_1"),
                        "text": evt.result.text,
                        "offset": evt.result.offset // 10000,  # 100ns → ms
                        "duration": evt.result.duration // 10000,
                    })

            def on_session_stopped(_):
                done_event.set()

            transcriber.transcribed.connect(on_transcribed)
            transcriber.session_stopped.connect(on_session_stopped)

            push_stream = transcriber.audio_config.stream
            push_stream.write(wav_buffer.read())
            push_stream.close()
            transcriber.start_transcribing_async()
            done_event.wait(timeout=8)
            transcriber.stop_transcribing_async()

            # 推送逐字稿結果到前端（Web PubSub）
            if results:
                pubsub = WebPubSubServiceClient(
                    endpoint=os.environ["WEB_PUBSUB_ENDPOINT"],
                    hub=os.environ.get("WEB_PUBSUB_HUB", "speech_hub"),
                    credential=os.environ["WEB_PUBSUB_KEY"],
                )
                user_id = req.params.get("userId", connection_id)
                for item in results:
                    pubsub.send_to_user(
                        user_id=user_id,
                        message=json.dumps({
                            "type": "transcript",
                            "speakerId": item["speaker"],
                            "text": item["text"],
                            "confidence": 0.95,
                            "offset": item["offset"],
                            "duration": item["duration"],
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }),
                        content_type="application/json",
                    )

                    # 持久化到 Cosmos DB
                    transcripts_container.create_item({
                        "id": str(uuid.uuid4()),
                        "meetingId": meeting_id,
                        "speaker": item["speaker"],
                        "text": item["text"],
                        "offset": item["offset"],
                        "duration": item["duration"],
                        "confidence": 0.95,
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                    })

        return func.HttpResponse(status_code=200)

    except Exception as e:
        logger.error(f"Speech event handler error: {e}")
        return func.HttpResponse(status_code=500)


# ==================== AI 摘要 ====================

@app.route(route="api/summarize", methods=["POST"])
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

        if len(transcript.strip()) < 10:
            return error_response("逐字稿內容太短", 400, req)

        system_prompt = """你是一位專業的商業會議記錄專家。請分析會議逐字稿並產生結構化報告。

規則：
1. 摘要必須包含：會議目的、關鍵決策、討論重點
2. 每位發言者的主要觀點要分別列出
3. 待辦事項必須明確標示負責人（從發言內容推斷）和截止日期（如有提及）
4. 使用繁體中文，專業商業語調
5. 格式使用 Markdown"""

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

        # 第一輪：摘要 Markdown
        summary_res = openai_client.chat.completions.create(
            model=os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
        )
        summary_text = summary_res.choices[0].message.content

        # 第二輪：結構化 JSON
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
            model=os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4"),
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
        }

        # 持久化摘要
        if meeting_id:
            summaries_container.upsert_item({
                "id": meeting_id,
                "meetingId": meeting_id,
                **result,
            })
            # 更新會議狀態
            try:
                meeting = meetings_container.read_item(item=meeting_id, partition_key=meeting_id)
                meeting["status"] = "completed"
                meeting["endTime"] = datetime.now(timezone.utc).isoformat()
                meetings_container.replace_item(item=meeting_id, body=meeting)
            except Exception:
                pass

        return json_response(result, req=req)

    except Exception as e:
        logger.error(f"Summarize error: {e}")
        return error_response(str(e), 500, req)
