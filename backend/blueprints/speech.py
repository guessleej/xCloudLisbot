"""WebSocket token and Speech event handler."""

import os
import io
import json
import uuid
import wave
import logging
import threading
from datetime import datetime, timezone

import azure.functions as func
try:
    import azure.cognitiveservices.speech as speechsdk
except ImportError:
    speechsdk = None  # Speech SDK not available on all platforms

from shared.auth import verify_jwt
from shared.config import get_pubsub_client, transcripts_container, SPEECH_TIMEOUT
from shared.responses import json_response

logger = logging.getLogger(__name__)
bp = func.Blueprint()

# In-memory speech config store per WebSocket connection
_speech_configs: dict[str, dict] = {}

_DIALECT_FALLBACK = {"nan-TW": "zh-TW", "hak-TW": "zh-TW"}


@bp.route(route="api/ws/token", methods=["GET"])
def get_ws_token(req: func.HttpRequest) -> func.HttpResponse:
    from shared.auth import get_current_user
    from shared.responses import error_response

    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        pubsub = get_pubsub_client()
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
        from shared.responses import error_response
        return error_response(str(e), 500, req)


@bp.route(route="ws/speech", methods=["POST"])
def speech_event_handler(req: func.HttpRequest) -> func.HttpResponse:
    try:
        event_type = req.headers.get("ce-type", "")
        connection_id = req.headers.get("ce-connectionid", "")
        user_id_from_header = req.headers.get("ce-userid", connection_id)

        # WebSocket connect event
        if event_type == "azure.webpubsub.sys.connect":
            token_param = req.params.get("token", "")
            user_payload = verify_jwt(token_param)
            if not user_payload:
                return func.HttpResponse(status_code=401)
            return json_response({"userId": user_payload["sub"]})

        if event_type == "azure.webpubsub.user.message":
            content_type = req.headers.get("Content-Type", "")

            if "application/json" in content_type:
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
                    logger.info(f"Speech config stored for {connection_id}")
                return func.HttpResponse(status_code=200)

            # Binary audio chunk
            audio_bytes = req.get_body()
            conn_cfg = _speech_configs.get(connection_id, {})
            meeting_id = conn_cfg.get("meetingId") or req.params.get("meetingId", "unknown")
            speech_language = conn_cfg.get("language", "zh-TW")
            max_speakers = conn_cfg.get("maxSpeakers", 4)
            terminology_words = conn_cfg.get("terminology", [])

            # Dialect fallback
            speech_language = _DIALECT_FALLBACK.get(speech_language, speech_language)

            # Build WAV
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(audio_bytes)
            wav_buffer.seek(0)

            # Azure Speech ConversationTranscriber
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

            if terminology_words:
                phrase_list = speechsdk.PhraseListGrammar.from_recognizer(transcriber)
                for word in terminology_words:
                    phrase_list.addPhrase(word)

            results: list[dict] = []
            done_event = threading.Event()

            def on_transcribed(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    confidence = getattr(evt.result, "confidence", None)
                    if confidence is None:
                        confidence = 0.95
                    results.append({
                        "speaker": getattr(evt.result, "speaker_id", "Speaker_1"),
                        "text": evt.result.text,
                        "offset": evt.result.offset // 10000,
                        "duration": evt.result.duration // 10000,
                        "confidence": confidence,
                        "language": speech_language,
                    })

            def on_session_stopped(_):
                done_event.set()

            transcriber.transcribed.connect(on_transcribed)
            transcriber.session_stopped.connect(on_session_stopped)

            push_stream_obj.write(wav_buffer.read())
            push_stream_obj.close()
            transcriber.start_transcribing_async()
            done_event.wait(timeout=SPEECH_TIMEOUT)
            transcriber.stop_transcribing_async()

            # Push results to frontend via Web PubSub
            if results:
                pubsub = get_pubsub_client()
                for item in results:
                    pubsub.send_to_user(
                        user_id=user_id_from_header,
                        message=json.dumps({
                            "type": "transcript",
                            "speakerId": item["speaker"],
                            "text": item["text"],
                            "confidence": item["confidence"],
                            "offset": item["offset"],
                            "duration": item["duration"],
                            "language": item.get("language", speech_language),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }),
                        content_type="application/json",
                    )

                    transcripts_container().create_item({
                        "id": str(uuid.uuid4()),
                        "meetingId": meeting_id,
                        "speaker": item["speaker"],
                        "text": item["text"],
                        "offset": item["offset"],
                        "duration": item["duration"],
                        "confidence": item["confidence"],
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                    })

        return func.HttpResponse(status_code=200)

    except Exception as e:
        logger.error(f"Speech event handler error: {e}")
        return func.HttpResponse(status_code=500)
