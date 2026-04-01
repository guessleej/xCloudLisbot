"""WebSocket token and Speech event handler."""

import os
import io
import json
import uuid
import wave
import logging
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Depends, Response

try:
    import azure.cognitiveservices.speech as speechsdk
except ImportError:
    speechsdk = None

from shared.auth import get_current_user, verify_jwt
from shared.config import get_pubsub_client, SPEECH_TIMEOUT
from shared.database import get_session, Transcript

logger = logging.getLogger(__name__)
router = APIRouter()

_speech_configs: dict[str, dict] = {}
_DIALECT_FALLBACK = {"nan-TW": "zh-TW", "hak-TW": "zh-TW"}


@router.get("/api/ws/token")
async def get_ws_token(user: dict = Depends(get_current_user)):
    pubsub = get_pubsub_client()
    tr = pubsub.get_client_access_token(
        user_id=user["sub"],
        roles=["webpubsub.sendToGroup", "webpubsub.joinLeaveGroup"],
        minutes_to_expire=60)
    return {"url": tr["url"], "userId": user["sub"]}


@router.post("/ws/speech")
async def speech_event_handler(request: Request):
    try:
        event_type = request.headers.get("ce-type", "")
        connection_id = request.headers.get("ce-connectionid", "")
        user_id_from_header = request.headers.get("ce-userid", connection_id)

        if event_type == "azure.webpubsub.sys.connect":
            payload = verify_jwt(request.query_params.get("token", ""))
            if not payload:
                return Response(status_code=401)
            return {"userId": payload["sub"]}

        if event_type == "azure.webpubsub.user.message":
            ct = request.headers.get("Content-Type", "")

            if "application/json" in ct:
                config = await request.json()
                if config.get("type") == "config":
                    _speech_configs[connection_id] = {
                        "language": config.get("language", "zh-TW"),
                        "maxSpeakers": config.get("maxSpeakers", 4),
                        "terminology": config.get("terminology", []),
                        "mode": config.get("mode", "meeting"),
                        "meetingId": config.get("meetingId", ""),
                        "enableDiarization": config.get("enableDiarization", True),
                    }
                return Response(status_code=200)

            if speechsdk is None:
                return Response(status_code=200)

            audio_bytes = await request.body()
            conn_cfg = _speech_configs.get(connection_id, {})
            meeting_id = conn_cfg.get("meetingId") or "unknown"
            lang = conn_cfg.get("language", "zh-TW")
            speech_language = _DIALECT_FALLBACK.get(lang, lang)
            terminology_words = conn_cfg.get("terminology", [])

            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, "wb") as wf:
                wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(16000)
                wf.writeframes(audio_bytes)
            wav_buffer.seek(0)

            sc = speechsdk.SpeechConfig(subscription=os.environ["SPEECH_KEY"], region=os.environ["SPEECH_REGION"])
            sc.speech_recognition_language = speech_language
            ps = speechsdk.audio.PushAudioInputStream()
            ac = speechsdk.audio.AudioConfig(stream=ps)
            transcriber = speechsdk.transcription.ConversationTranscriber(speech_config=sc, audio_config=ac)

            if terminology_words:
                pl = speechsdk.PhraseListGrammar.from_recognizer(transcriber)
                for w in terminology_words:
                    pl.addPhrase(w)

            results = []
            done_event = threading.Event()

            def on_transcribed(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    results.append({
                        "speaker": getattr(evt.result, "speaker_id", "Speaker_1"),
                        "text": evt.result.text,
                        "offset": evt.result.offset // 10000,
                        "duration": evt.result.duration // 10000,
                        "confidence": getattr(evt.result, "confidence", 0.95),
                        "language": speech_language,
                    })

            transcriber.transcribed.connect(on_transcribed)
            transcriber.session_stopped.connect(lambda _: done_event.set())
            ps.write(wav_buffer.read()); ps.close()
            transcriber.start_transcribing_async()
            done_event.wait(timeout=SPEECH_TIMEOUT)
            transcriber.stop_transcribing_async()

            if results:
                pubsub = get_pubsub_client()
                session = get_session()
                try:
                    for item in results:
                        pubsub.send_to_user(user_id=user_id_from_header,
                            message=json.dumps({"type": "transcript", "speakerId": item["speaker"],
                                "text": item["text"], "confidence": item["confidence"],
                                "offset": item["offset"], "duration": item["duration"],
                                "language": item["language"],
                                "timestamp": datetime.now(timezone.utc).isoformat()}),
                            content_type="application/json")
                        session.add(Transcript(id=str(uuid.uuid4()), meeting_id=meeting_id,
                            speaker=item["speaker"], text=item["text"],
                            offset=item["offset"], duration=item["duration"],
                            confidence=item["confidence"], created_at=datetime.now(timezone.utc)))
                    session.commit()
                finally:
                    session.close()

        return Response(status_code=200)
    except Exception as e:
        logger.error(f"Speech error: {e}")
        return Response(status_code=500)
