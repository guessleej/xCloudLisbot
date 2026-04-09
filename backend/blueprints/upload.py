"""Audio upload and batch transcription endpoints."""

import os
import uuid
import logging
from datetime import datetime, timedelta, timezone

import requests as http_requests
from fastapi import APIRouter, Request, Depends, HTTPException
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions

from shared.auth import get_current_user
from shared.access import check_meeting_access
from shared.database import get_session, Meeting, Transcript

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/meetings/{meeting_id}/upload")
async def upload_meeting_audio(meeting_id: str, request: Request, user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        meeting = session.get(Meeting, meeting_id)
        if meeting and meeting.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")

        # Enforce upload size limit (200 MB)
        max_size = 200 * 1024 * 1024
        content_length = request.headers.get("Content-Length")
        if content_length and int(content_length) > max_size:
            raise HTTPException(413, f"檔案超過 200MB 限制")

        audio_bytes = await request.body()
        if len(audio_bytes) > max_size:
            raise HTTPException(413, f"檔案超過 200MB 限制")

        content_type = request.headers.get("Content-Type", "audio/wav")
        ext_map = {"audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
                   "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/ogg": "ogg", "audio/flac": "flac", "video/mp4": "mp4"}
        ext = ext_map.get(content_type.split(";")[0].strip(), "wav")

        blob_service = BlobServiceClient.from_connection_string(os.environ["AZURE_STORAGE_CONNECTION_STRING"])
        container_name = os.environ.get("STORAGE_CONTAINER", "audio-recordings")
        blob_name = f"{user['sub']}/{meeting_id}.{ext}"
        blob_client = blob_service.get_blob_client(container=container_name, blob=blob_name)
        blob_client.upload_blob(audio_bytes, overwrite=True, content_settings={"content_type": content_type})
        audio_url = blob_client.url

        speech_key = os.environ["SPEECH_KEY"]
        speech_region = os.environ["SPEECH_REGION"]
        language = request.query_params.get("language", "zh-TW")

        sas_token = generate_blob_sas(account_name=blob_client.account_name, container_name=container_name,
            blob_name=blob_name, account_key=blob_service.credential.account_key,
            permission=BlobSasPermissions(read=True), expiry=datetime.now(timezone.utc) + timedelta(hours=12))
        sas_url = f"{audio_url}?{sas_token}"

        batch_res = http_requests.post(
            f"https://{speech_region}.api.cognitive.microsoft.com/speechtotext/v3.1/transcriptions",
            headers={"Ocp-Apim-Subscription-Key": speech_key, "Content-Type": "application/json"},
            json={"contentUrls": [sas_url], "locale": language, "displayName": f"Meeting {meeting_id}",
                  "properties": {"diarizationEnabled": True, "wordLevelTimestampsEnabled": True,
                                 "punctuationMode": "DictatedAndAutomatic", "profanityFilterMode": "None"}},
            timeout=15)
        if not batch_res.ok:
            raise HTTPException(500, f"轉錄提交失敗: {batch_res.text}")

        job_id = batch_res.json().get("self", "").split("/")[-1]

        if meeting:
            meeting.audio_url = audio_url
            meeting.transcription_job_id = job_id
            meeting.status = "transcribing"
            custom_title = request.query_params.get("title", "").strip()
            if custom_title:
                meeting.title = custom_title
        else:
            session.add(Meeting(id=meeting_id, user_id=user["sub"],
                title=request.query_params.get("title", "上傳音檔會議"),
                audio_url=audio_url, transcription_job_id=job_id, status="transcribing",
                start_time=datetime.now(timezone.utc)))
        session.commit()

        return {"jobId": job_id, "audioUrl": audio_url, "status": "transcribing"}
    finally:
        session.close()


@router.get("/api/meetings/{meeting_id}/transcription-status")
async def get_transcription_status(meeting_id: str, user: dict = Depends(get_current_user)):
    session = get_session()
    try:
        meeting = session.get(Meeting, meeting_id)
        if not meeting:
            raise HTTPException(404, "Meeting not found")
        check_meeting_access(session, meeting, user)

        # Idempotency: if already completed, return existing transcripts
        if meeting.status == "completed":
            existing = session.query(Transcript).filter(
                Transcript.meeting_id == meeting_id
            ).order_by(Transcript.offset).all()
            segments = [
                {"id": t.id, "speaker": t.speaker, "speakerId": (t.speaker or "").replace("說話者 ", "") or "1",
                 "text": t.text, "offset": t.offset, "duration": t.duration, "confidence": t.confidence}
                for t in existing
            ]
            return {"status": "completed", "segments": segments}

        job_id = meeting.transcription_job_id
        if not job_id:
            return {"status": meeting.status or "unknown"}

        speech_key = os.environ["SPEECH_KEY"]
        speech_region = os.environ["SPEECH_REGION"]
        status_url = f"https://{speech_region}.api.cognitive.microsoft.com/speechtotext/v3.1/transcriptions/{job_id}"
        sr = http_requests.get(status_url, headers={"Ocp-Apim-Subscription-Key": speech_key}, timeout=10)
        if not sr.ok:
            raise HTTPException(500, "無法取得轉錄狀態")

        job_status = sr.json().get("status", "Running")

        if job_status == "Succeeded":
            # Delete any previously inserted transcripts (idempotency on retry)
            session.query(Transcript).filter(Transcript.meeting_id == meeting_id).delete()

            fr = http_requests.get(f"{status_url}/files", headers={"Ocp-Apim-Subscription-Key": speech_key}, timeout=10)
            tf = next((f for f in fr.json().get("values", []) if f.get("kind") == "Transcription"), None)
            segments = []
            if tf:
                cr = http_requests.get(tf["links"]["contentUrl"], timeout=30).json()
                for p in cr.get("recognizedPhrases", []):
                    b = p.get("nBest", [{}])[0]; sid = str(p.get("speaker", 1))
                    seg_id = str(uuid.uuid4())
                    segments.append({"id": seg_id, "speaker": f"說話者 {sid}", "speakerId": sid,
                        "text": b.get("display", ""), "offset": p.get("offsetInTicks", 0) // 10000,
                        "duration": p.get("durationInTicks", 0) // 10000, "confidence": b.get("confidence", 0.9)})
                    session.add(Transcript(
                        id=seg_id, meeting_id=meeting_id,
                        speaker=f"說話者 {sid}", text=b.get("display", ""),
                        offset=p.get("offsetInTicks", 0) // 10000,
                        duration=p.get("durationInTicks", 0) // 10000,
                        confidence=b.get("confidence", 0.9),
                    ))

            if not segments:
                # Azure returned Succeeded but no transcription data
                meeting.status = "failed"
                meeting.end_time = datetime.now(timezone.utc)
                session.commit()
                logger.warning(f"Transcription {job_id} succeeded but no transcript data found")
                return {"status": "failed", "error": "轉錄完成但無法取得內容，請重試"}

            meeting.status = "completed"
            meeting.end_time = datetime.now(timezone.utc)
            session.commit()
            return {"status": "completed", "segments": segments}

        elif job_status == "Failed":
            meeting.status = "failed"
            meeting.end_time = datetime.now(timezone.utc)
            session.commit()
            return {"status": "failed", "error": "轉錄失敗"}

        return {"status": "processing"}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/api/meetings/{meeting_id}/audio-url")
async def get_audio_playback_url(meeting_id: str, user: dict = Depends(get_current_user)):
    """Generate a short-lived SAS URL for audio playback."""
    session = get_session()
    try:
        meeting = session.get(Meeting, meeting_id)
        if not meeting:
            raise HTTPException(404, "Meeting not found")
        check_meeting_access(session, meeting, user)
        if not meeting.audio_url:
            raise HTTPException(404, "No audio file")

        from urllib.parse import urlparse
        parsed = urlparse(meeting.audio_url.split("?")[0])
        parts = parsed.path.split("/", 2)
        container_name = parts[1] if len(parts) >= 2 else os.environ.get("STORAGE_CONTAINER", "audio-recordings")
        blob_name = parts[2] if len(parts) >= 3 else parts[-1]

        blob_service = BlobServiceClient.from_connection_string(os.environ["AZURE_STORAGE_CONNECTION_STRING"])
        sas_token = generate_blob_sas(
            account_name=blob_service.credential.account_name,
            container_name=container_name,
            blob_name=blob_name,
            account_key=blob_service.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(hours=1))
        return {"url": f"{meeting.audio_url}?{sas_token}", "expiresIn": 3600}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
