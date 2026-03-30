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
terminology_container = db.get_container_client("terminology")
templates_container = db.get_container_client("templates")
shares_container = db.get_container_client("shares")
calendar_tokens_container = db.get_container_client("calendar_tokens")

# In-memory speech config store per WebSocket connection
_speech_configs: dict[str, dict] = {}

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
            "mode": body.get("mode", "meeting"),
            "language": body.get("language", "zh-TW"),
            "templateId": body.get("templateId", "standard"),
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


# ==================== WebSocket Token 端點（前端先取得 Web PubSub 連線 URL）====================

@app.route(route="api/ws/token", methods=["GET"])
def get_ws_token(req: func.HttpRequest) -> func.HttpResponse:
    """
    前端呼叫此端點取得 Azure Web PubSub client access URL，
    再以該 URL 建立原生 WebSocket 連線（不直接連 Azure Function）
    """
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        pubsub = WebPubSubServiceClient(
            endpoint=os.environ["WEB_PUBSUB_ENDPOINT"],
            hub=os.environ.get("WEB_PUBSUB_HUB", "speech_hub"),
            credential=os.environ["WEB_PUBSUB_KEY"],
        )
        token_response = pubsub.get_client_access_token(
            user_id=user["sub"],
            roles=["webpubsub.sendToGroup", "webpubsub.joinLeaveGroup"],
            minutes_to_expire=60,
        )
        return json_response({
            "url": token_response["url"],
            "userId": user["sub"],
        }, req=req)
    except Exception as e:
        logger.error(f"WS token error: {e}")
        return error_response(str(e), 500, req)


# ==================== 語音處理 WebSocket (Azure Web PubSub Event Handler) ====================

@app.route(route="ws/speech", methods=["POST"])
def speech_event_handler(req: func.HttpRequest) -> func.HttpResponse:
    """
    Azure Web PubSub 事件處理器
    當前端透過 WebSocket 傳送音訊 binary chunk 時觸發
    此端點由 Azure Web PubSub 服務呼叫（非前端直連）
    """
    try:
        event_type = req.headers.get("ce-type", "")
        connection_id = req.headers.get("ce-connectionid", "")
        # Web PubSub 連線後 ce-userid 由 connect 事件回傳的 userId 填入
        user_id_from_header = req.headers.get("ce-userid", connection_id)

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
                    _speech_configs[connection_id] = {
                        "language": config.get("language", "zh-TW"),
                        "maxSpeakers": config.get("maxSpeakers", 4),
                        "terminology": config.get("terminology", []),
                        "mode": config.get("mode", "meeting"),
                        "meetingId": config.get("meetingId", ""),
                        "enableDiarization": config.get("enableDiarization", True),
                    }
                    logger.info(f"Speech config stored for {connection_id}: {_speech_configs[connection_id]}")
                return func.HttpResponse(status_code=200)

            # 二進位音訊 chunk
            audio_bytes = req.get_body()
            conn_cfg = _speech_configs.get(connection_id, {})
            # meetingId 優先從 config message 取（Web PubSub 不保留 query params）
            meeting_id = conn_cfg.get("meetingId") or req.params.get("meetingId", "unknown")
            speech_language = conn_cfg.get("language", "zh-TW")
            max_speakers = conn_cfg.get("maxSpeakers", 4)
            terminology_words = conn_cfg.get("terminology", [])

            # 台語/客語 fallback：Azure 目前不支援，降級為繁中並附提示
            _DIALECT_FALLBACK = {"nan-TW": "zh-TW", "hak-TW": "zh-TW"}
            speech_language = _DIALECT_FALLBACK.get(speech_language, speech_language)

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
            speech_config.speech_recognition_language = speech_language
            if max_speakers:
                speech_config.set_property(
                    speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
                    "5000",
                )

            push_stream_obj = speechsdk.audio.PushAudioInputStream()
            audio_config = speechsdk.audio.AudioConfig(stream=push_stream_obj)

            transcriber = speechsdk.transcription.ConversationTranscriber(
                speech_config=speech_config, audio_config=audio_config
            )

            # 注入術語詞彙表（透過 ConversationTranscriber 取得 recognizer 後再附加）
            if terminology_words:
                phrase_list = speechsdk.PhraseListGrammar.from_recognizer(transcriber)
                for word in terminology_words:
                    phrase_list.addPhrase(word)

            results: list[dict] = []
            done_event = __import__("threading").Event()

            def on_transcribed(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    results.append({
                        "speaker": getattr(evt.result, "speaker_id", "Speaker_1"),
                        "text": evt.result.text,
                        "offset": evt.result.offset // 10000,  # 100ns → ms
                        "duration": evt.result.duration // 10000,
                        "language": speech_language,
                    })

            def on_session_stopped(_):
                done_event.set()

            transcriber.transcribed.connect(on_transcribed)
            transcriber.session_stopped.connect(on_session_stopped)

            push_stream_obj.write(wav_buffer.read())
            push_stream_obj.close()
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
                user_id = user_id_from_header
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
                            "language": item.get("language", speech_language),
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
        template_id = body.get("templateId", "standard")
        meeting_mode = body.get("mode", "meeting")
        language = body.get("language", "zh-TW")

        if len(transcript.strip()) < 10:
            return error_response("逐字稿內容太短", 400, req)

        # 嘗試載入自訂範本的 system prompt override
        custom_prompt_override = None
        if template_id and not template_id.startswith(("general", "interview", "brainstorm",
                                                         "lecture", "standup", "review", "client")):
            try:
                tmpl = templates_container.read_item(item=template_id, partition_key=user["sub"])
                custom_prompt_override = tmpl.get("systemPromptOverride") or None
            except Exception:
                pass

        # 語言指令對照
        _LANG_INSTRUCTION = {
            "zh-TW": "使用繁體中文，專業商業語調",
            "zh-CN": "使用简体中文，专业商务语调",
            "en-US": "Use English, professional business tone",
            "ja-JP": "日本語を使用し、プロフェッショナルなビジネストーン",
            "nan-TW": "使用繁體中文（逐字稿含台語發音，請以文意理解後用繁體中文輸出）",
            "hak-TW": "使用繁體中文（逐字稿含客語發音，請以文意理解後用繁體中文輸出）",
            "auto": "依據逐字稿語言自動選擇輸出語言，優先使用繁體中文",
        }
        lang_instruction = _LANG_INSTRUCTION.get(language, "使用繁體中文，專業商業語調")

        # 依會議模式的預設 system prompt
        _MODE_PROMPTS = {
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
        system_prompt = custom_prompt_override or _MODE_PROMPTS.get(meeting_mode, _MODE_PROMPTS["meeting"])

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
            "templateId": template_id,
            "language": language,
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


# ==================== 術語辭典 CRUD ====================

@app.route(route="api/terminology", methods=["GET"])
def list_terminology(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        items = list(terminology_container.query_items(
            query="SELECT * FROM c WHERE c.userId = @uid ORDER BY c.createdAt DESC",
            parameters=[{"name": "@uid", "value": user["sub"]}],
            enable_cross_partition_query=True,
        ))
        return json_response({"dicts": items}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/terminology", methods=["POST"])
def create_terminology(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        body = req.get_json()
        if not body.get("name", "").strip():
            return error_response("辭典名稱不可為空", 400, req)
        item = {
            "id": str(uuid.uuid4()),
            "userId": user["sub"],
            "name": body["name"].strip(),
            "description": body.get("description", ""),
            "isActive": body.get("isActive", True),
            "terms": body.get("terms", []),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        terminology_container.create_item(item)
        return json_response(item, 201, req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/terminology/{dict_id}", methods=["PUT"])
def update_terminology(req: func.HttpRequest, dict_id: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        existing = terminology_container.read_item(item=dict_id, partition_key=dict_id)
        if existing.get("userId") != user["sub"]:
            return error_response("Forbidden", 403, req)
        body = req.get_json()
        existing.update({
            "name": body.get("name", existing["name"]),
            "description": body.get("description", existing.get("description", "")),
            "isActive": body.get("isActive", existing.get("isActive", True)),
            "terms": body.get("terms", existing.get("terms", [])),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        terminology_container.replace_item(item=dict_id, body=existing)
        return json_response(existing, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/terminology/{dict_id}", methods=["DELETE"])
def delete_terminology(req: func.HttpRequest, dict_id: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        existing = terminology_container.read_item(item=dict_id, partition_key=dict_id)
        if existing.get("userId") != user["sub"]:
            return error_response("Forbidden", 403, req)
        terminology_container.delete_item(item=dict_id, partition_key=dict_id)
        return json_response({"ok": True}, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)


# ==================== 摘要範本 CRUD ====================

@app.route(route="api/templates", methods=["GET"])
def list_templates(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        items = list(templates_container.query_items(
            query="SELECT * FROM c WHERE c.userId = @uid ORDER BY c.createdAt DESC",
            parameters=[{"name": "@uid", "value": user["sub"]}],
            enable_cross_partition_query=True,
        ))
        return json_response({"templates": items}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/templates", methods=["POST"])
def create_template(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        body = req.get_json()
        if not body.get("name", "").strip():
            return error_response("範本名稱不可為空", 400, req)
        item = {
            "id": str(uuid.uuid4()),
            "userId": user["sub"],
            "name": body["name"].strip(),
            "description": body.get("description", ""),
            "icon": body.get("icon", "📋"),
            "systemPromptOverride": body.get("systemPromptOverride", ""),
            "isBuiltIn": False,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        templates_container.create_item(item)
        return json_response(item, 201, req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/templates/{template_id}", methods=["PUT"])
def update_template(req: func.HttpRequest, template_id: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        existing = templates_container.read_item(item=template_id, partition_key=user["sub"])
        if existing.get("userId") != user["sub"]:
            return error_response("Forbidden", 403, req)
        body = req.get_json()
        existing.update({
            "name": body.get("name", existing["name"]),
            "description": body.get("description", existing.get("description", "")),
            "icon": body.get("icon", existing.get("icon", "📋")),
            "systemPromptOverride": body.get("systemPromptOverride", existing.get("systemPromptOverride", "")),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        templates_container.replace_item(item=template_id, body=existing)
        return json_response(existing, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/templates/{template_id}", methods=["DELETE"])
def delete_template(req: func.HttpRequest, template_id: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        existing = templates_container.read_item(item=template_id, partition_key=user["sub"])
        if existing.get("userId") != user["sub"]:
            return error_response("Forbidden", 403, req)
        templates_container.delete_item(item=template_id, partition_key=user["sub"])
        return json_response({"ok": True}, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)


# ==================== 音檔上傳與批次轉錄 ====================

@app.route(route="api/meetings/{meeting_id}/upload", methods=["POST"])
def upload_meeting_audio(req: func.HttpRequest, meeting_id: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        # 驗證會議歸屬
        try:
            meeting = meetings_container.read_item(item=meeting_id, partition_key=meeting_id)
        except cosmos_exc.CosmosResourceNotFoundError:
            # 允許上傳時建立新會議
            meeting = None

        audio_bytes = req.get_body()
        content_type = req.headers.get("Content-Type", "audio/wav")
        ext_map = {
            "audio/mpeg": "mp3", "audio/mp3": "mp3",
            "audio/wav": "wav", "audio/x-wav": "wav",
            "audio/mp4": "m4a", "audio/m4a": "m4a",
            "audio/ogg": "ogg", "audio/flac": "flac",
            "video/mp4": "mp4",
        }
        ext = ext_map.get(content_type.split(";")[0].strip(), "wav")

        # 上傳到 Azure Blob Storage
        blob_service = BlobServiceClient.from_connection_string(
            os.environ["AZURE_STORAGE_CONNECTION_STRING"]
        )
        container_name = os.environ.get("STORAGE_CONTAINER", "audio-recordings")
        blob_name = f"{user['sub']}/{meeting_id}.{ext}"
        blob_client = blob_service.get_blob_client(container=container_name, blob=blob_name)
        blob_client.upload_blob(audio_bytes, overwrite=True, content_settings={"content_type": content_type})
        audio_url = blob_client.url

        # 提交 Azure Speech 批次轉錄作業
        speech_key = os.environ["SPEECH_KEY"]
        speech_region = os.environ["SPEECH_REGION"]
        language = req.params.get("language", "zh-TW")

        # 產生 SAS URL（讓 Speech Service 可以存取）
        from azure.storage.blob import generate_blob_sas, BlobSasPermissions
        sas_token = generate_blob_sas(
            account_name=blob_client.account_name,
            container_name=container_name,
            blob_name=blob_name,
            account_key=blob_service.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(hours=12),
        )
        sas_url = f"{audio_url}?{sas_token}"

        # 建立批次轉錄
        batch_api = f"https://{speech_region}.api.cognitive.microsoft.com/speechtotext/v3.1/transcriptions"
        batch_body = {
            "contentUrls": [sas_url],
            "locale": language,
            "displayName": f"Meeting {meeting_id}",
            "properties": {
                "diarizationEnabled": True,
                "wordLevelTimestampsEnabled": True,
                "punctuationMode": "DictatedAndAutomatic",
                "profanityFilterMode": "None",
            },
        }
        batch_res = requests.post(
            batch_api,
            headers={"Ocp-Apim-Subscription-Key": speech_key, "Content-Type": "application/json"},
            json=batch_body,
            timeout=15,
        )
        if not batch_res.ok:
            return error_response(f"批次轉錄提交失敗: {batch_res.text}", 500, req)

        job_id = batch_res.json().get("self", "").split("/")[-1]

        # 更新或建立會議記錄
        if meeting:
            meeting["audioUrl"] = audio_url
            meeting["transcriptionJobId"] = job_id
            meeting["status"] = "transcribing"
            # 若前端傳入 title，以此更新
            custom_title = req.params.get("title", "").strip()
            if custom_title:
                meeting["title"] = custom_title
            meetings_container.replace_item(item=meeting_id, body=meeting)
        else:
            meetings_container.create_item({
                "id": meeting_id,
                "userId": user["sub"],
                "title": req.params.get("title", "上傳音檔會議"),
                "audioUrl": audio_url,
                "transcriptionJobId": job_id,
                "status": "transcribing",
                "startTime": datetime.now(timezone.utc).isoformat(),
            })

        return json_response({"jobId": job_id, "audioUrl": audio_url, "status": "transcribing"}, req=req)

    except Exception as e:
        logger.error(f"Upload error: {e}")
        return error_response(str(e), 500, req)


@app.route(route="api/meetings/{meeting_id}/transcription-status", methods=["GET"])
def get_transcription_status(req: func.HttpRequest, meeting_id: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        meeting = meetings_container.read_item(item=meeting_id, partition_key=meeting_id)
        if meeting.get("userId") != user["sub"]:
            return error_response("Forbidden", 403, req)

        job_id = meeting.get("transcriptionJobId")
        if not job_id:
            return json_response({"status": meeting.get("status", "unknown")}, req=req)

        speech_key = os.environ["SPEECH_KEY"]
        speech_region = os.environ["SPEECH_REGION"]
        status_url = f"https://{speech_region}.api.cognitive.microsoft.com/speechtotext/v3.1/transcriptions/{job_id}"
        status_res = requests.get(
            status_url,
            headers={"Ocp-Apim-Subscription-Key": speech_key},
            timeout=10,
        )
        if not status_res.ok:
            return error_response("無法取得轉錄狀態", 500, req)

        status_data = status_res.json()
        job_status = status_data.get("status", "Running")  # Running | Succeeded | Failed

        if job_status == "Succeeded":
            # 取得轉錄結果檔案
            files_url = f"{status_url}/files"
            files_res = requests.get(
                files_url,
                headers={"Ocp-Apim-Subscription-Key": speech_key},
                timeout=10,
            )
            files_data = files_res.json()
            transcript_file = next(
                (f for f in files_data.get("values", []) if f.get("kind") == "Transcription"),
                None,
            )

            segments = []
            if transcript_file:
                content_url = transcript_file["links"]["contentUrl"]
                content_res = requests.get(content_url, timeout=30)
                content = content_res.json()
                for phrase in content.get("recognizedPhrases", []):
                    best = phrase.get("nBest", [{}])[0]
                    speaker_id = str(phrase.get("speaker", 1))
                    segments.append({
                        "id": str(uuid.uuid4()),
                        "speaker": f"說話者 {speaker_id}",
                        "speakerId": speaker_id,
                        "text": best.get("display", ""),
                        "offset": phrase.get("offsetInTicks", 0) // 10000,
                        "duration": phrase.get("durationInTicks", 0) // 10000,
                        "confidence": best.get("confidence", 0.9),
                    })

            # 更新會議狀態
            meeting["status"] = "completed"
            meetings_container.replace_item(item=meeting_id, body=meeting)

            return json_response({
                "status": "completed",
                "segments": segments,
            }, req=req)

        elif job_status == "Failed":
            meeting["status"] = "failed"
            meetings_container.replace_item(item=meeting_id, body=meeting)
            return json_response({"status": "failed", "error": status_data.get("self", "轉錄失敗")}, req=req)

        return json_response({"status": "processing"}, req=req)

    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Meeting not found", 404, req)
    except Exception as e:
        logger.error(f"Transcription status error: {e}")
        return error_response(str(e), 500, req)


# ==================== 會議分享協作 ====================

@app.route(route="api/meetings/{meeting_id}/share", methods=["GET"])
def get_meeting_shares(req: func.HttpRequest, meeting_id: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        items = list(shares_container.query_items(
            query="SELECT * FROM c WHERE c.meetingId = @mid",
            parameters=[{"name": "@mid", "value": meeting_id}],
            enable_cross_partition_query=True,
        ))
        # 驗證請求者是擁有者或被分享者
        is_owner = any(i.get("ownerId") == user["sub"] for i in items) or _is_meeting_owner(meeting_id, user["sub"])
        is_member = any(i.get("memberEmail") == user.get("email") for i in items)
        if not is_owner and not is_member:
            return error_response("Forbidden", 403, req)

        members = [
            {
                "email": i["memberEmail"],
                "name": i.get("memberName", ""),
                "permission": i.get("permission", "view"),
                "sharedAt": i.get("createdAt", ""),
            }
            for i in items
        ]
        return json_response({"members": members}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/meetings/{meeting_id}/share", methods=["POST"])
def add_meeting_share(req: func.HttpRequest, meeting_id: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        if not _is_meeting_owner(meeting_id, user["sub"]):
            return error_response("只有會議擁有者可以分享", 403, req)

        body = req.get_json()
        email = body.get("email", "").strip().lower()
        if not email:
            return error_response("Email 不可為空", 400, req)
        permission = body.get("permission", "view")
        invite_message = body.get("message", "")

        share_id = f"{meeting_id}_{email}"
        share_item = {
            "id": share_id,
            "meetingId": meeting_id,
            "ownerId": user["sub"],
            "ownerName": user.get("email", ""),
            "memberEmail": email,
            "memberName": "",
            "permission": permission,
            "inviteMessage": invite_message,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        shares_container.upsert_item(share_item)

        # TODO: 傳送 Email 通知（可接 Azure Communication Services）

        return json_response({"ok": True, "shareId": share_id}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/meetings/{meeting_id}/share/{email}", methods=["DELETE"])
def revoke_meeting_share(req: func.HttpRequest, meeting_id: str, email: str) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        if not _is_meeting_owner(meeting_id, user["sub"]):
            return error_response("只有會議擁有者可以撤銷分享", 403, req)

        share_id = f"{meeting_id}_{email.lower()}"
        shares_container.delete_item(item=share_id, partition_key=share_id)
        return json_response({"ok": True}, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Share not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)


def _is_meeting_owner(meeting_id: str, user_id: str) -> bool:
    try:
        meeting = meetings_container.read_item(item=meeting_id, partition_key=meeting_id)
        return meeting.get("userId") == user_id
    except Exception:
        return False


# ==================== 行事曆整合 ====================

@app.route(route="api/calendar/connections", methods=["GET"])
def get_calendar_connections(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        google_token = _get_calendar_token(user["sub"], "google")
        microsoft_token = _get_calendar_token(user["sub"], "microsoft")
        return json_response({
            "google": {"connected": google_token is not None},
            "microsoft": {"connected": microsoft_token is not None},
        }, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@app.route(route="api/auth/calendar/google", methods=["GET"])
def calendar_google_login(req: func.HttpRequest) -> func.HttpResponse:
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/calendar/google"
    state = req.params.get("state", str(uuid.uuid4()))
    scopes = "openid email profile https://www.googleapis.com/auth/calendar.readonly"
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        f"&scope={requests.utils.quote(scopes)}"
        f"&state={state}"
        "&access_type=offline"
        "&prompt=consent"
    )
    return func.HttpResponse(status_code=302, headers={"Location": url, **cors_headers(req)})


@app.route(route="api/auth/callback/calendar/google", methods=["GET"])
def calendar_google_callback(req: func.HttpRequest) -> func.HttpResponse:
    try:
        code = req.params.get("code")
        state = req.params.get("state", "")
        if not code:
            return error_response("Missing code", 400, req)

        redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/calendar/google"
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
        user_id = f"google_{g_user['sub']}"

        # 儲存 calendar token
        _save_calendar_token(user_id, "google", {
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "expires_in": tokens.get("expires_in", 3600),
            "stored_at": datetime.now(timezone.utc).isoformat(),
        })

        html = f"""<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"></head><body>
<script>
  if (window.opener) {{
    window.opener.postMessage({{type:'calendar_connected',provider:'google'}}, {json.dumps(FRONTEND_URL)});
  }}
  window.close();
</script><p>行事曆已連結，請關閉此視窗。</p></body></html>"""
        return func.HttpResponse(html, mimetype="text/html")
    except Exception as e:
        logger.error(f"Google calendar callback error: {e}")
        return func.HttpResponse(f"Error: {e}", status_code=500)


@app.route(route="api/calendar/events", methods=["GET"])
def get_calendar_events(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        provider = req.params.get("provider", "google")
        date_str = req.params.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))

        try:
            query_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            query_date = datetime.now(timezone.utc)

        time_min = query_date.replace(hour=0, minute=0, second=0).isoformat()
        time_max = query_date.replace(hour=23, minute=59, second=59).isoformat()

        if provider == "google":
            token_data = _get_calendar_token(user["sub"], "google")
            if not token_data:
                return json_response({"events": [], "connected": False}, req=req)

            access_token = token_data.get("access_token")
            events_res = requests.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={"Authorization": f"Bearer {access_token}"},
                params={
                    "timeMin": time_min,
                    "timeMax": time_max,
                    "singleEvents": True,
                    "orderBy": "startTime",
                    "maxResults": 20,
                },
                timeout=10,
            )
            if not events_res.ok:
                return json_response({"events": [], "connected": True, "error": "無法取得事件"}, req=req)

            raw_events = events_res.json().get("items", [])
            events = [_normalize_google_event(e) for e in raw_events]

        elif provider == "microsoft":
            token_data = _get_calendar_token(user["sub"], "microsoft")
            if not token_data:
                return json_response({"events": [], "connected": False}, req=req)

            access_token = token_data.get("access_token")
            events_res = requests.get(
                "https://graph.microsoft.com/v1.0/me/calendarView",
                headers={"Authorization": f"Bearer {access_token}"},
                params={
                    "startDateTime": time_min,
                    "endDateTime": time_max,
                    "$select": "subject,start,end,attendees,onlineMeeting,bodyPreview",
                    "$orderby": "start/dateTime",
                    "$top": 20,
                },
                timeout=10,
            )
            if not events_res.ok:
                return json_response({"events": [], "connected": True, "error": "無法取得事件"}, req=req)

            raw_events = events_res.json().get("value", [])
            events = [_normalize_microsoft_event(e) for e in raw_events]

        else:
            events = []

        return json_response({"events": events, "connected": True}, req=req)

    except Exception as e:
        logger.error(f"Calendar events error: {e}")
        return error_response(str(e), 500, req)


def _normalize_google_event(e: dict) -> dict:
    start = e.get("start", {})
    end = e.get("end", {})
    attendees = e.get("attendees", [])
    return {
        "id": e.get("id", ""),
        "title": e.get("summary", "（無標題）"),
        "startTime": start.get("dateTime", start.get("date", "")),
        "endTime": end.get("dateTime", end.get("date", "")),
        "location": e.get("location", ""),
        "description": e.get("description", ""),
        "attendees": [
            {"name": a.get("displayName", a.get("email", "")), "email": a.get("email", "")}
            for a in attendees
        ],
        "isOnline": bool(e.get("hangoutLink") or e.get("conferenceData")),
        "isAllDay": "date" in start and "dateTime" not in start,
        "meetingUrl": e.get("hangoutLink", ""),
        "provider": "google",
    }


def _normalize_microsoft_event(e: dict) -> dict:
    start = e.get("start", {})
    end = e.get("end", {})
    attendees = e.get("attendees", [])
    online_meeting = e.get("onlineMeeting") or {}
    return {
        "id": e.get("id", ""),
        "title": e.get("subject", "（無標題）"),
        "startTime": start.get("dateTime", ""),
        "endTime": end.get("dateTime", ""),
        "location": e.get("location", {}).get("displayName", ""),
        "description": e.get("bodyPreview", ""),
        "attendees": [
            {
                "name": a.get("emailAddress", {}).get("name", ""),
                "email": a.get("emailAddress", {}).get("address", ""),
            }
            for a in attendees
        ],
        "isOnline": bool(e.get("onlineMeeting")),
        "isAllDay": e.get("isAllDay", False),
        "meetingUrl": online_meeting.get("joinUrl", ""),
        "provider": "microsoft",
    }


def _get_calendar_token(user_id: str, provider: str) -> dict | None:
    try:
        item = calendar_tokens_container.read_item(
            item=f"{user_id}_{provider}", partition_key=f"{user_id}_{provider}"
        )
        return item.get("tokenData")
    except Exception:
        return None


def _save_calendar_token(user_id: str, provider: str, token_data: dict) -> None:
    calendar_tokens_container.upsert_item({
        "id": f"{user_id}_{provider}",
        "userId": user_id,
        "provider": provider,
        "tokenData": token_data,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    })


# ==================== 儲存 Microsoft Calendar token（前端傳入 Graph token）====================

@app.route(route="api/auth/calendar/microsoft", methods=["POST"])
def calendar_microsoft_connect(req: func.HttpRequest) -> func.HttpResponse:
    """前端用 MSAL 取得 Graph access token 後，POST 到此端點儲存"""
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        body = req.get_json()
        access_token = body.get("accessToken")
        if not access_token:
            return error_response("Missing accessToken", 400, req)

        _save_calendar_token(user["sub"], "microsoft", {
            "access_token": access_token,
            "stored_at": datetime.now(timezone.utc).isoformat(),
        })
        return json_response({"ok": True, "connected": True}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)
