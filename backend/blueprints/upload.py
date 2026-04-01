"""Audio upload and batch transcription endpoints."""

import os
import uuid
import logging
from datetime import datetime, timedelta, timezone

import requests
import azure.functions as func
from azure.cosmos import exceptions as cosmos_exc
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions

from shared.auth import get_current_user
from shared.config import meetings_container
from shared.responses import json_response, error_response

logger = logging.getLogger(__name__)
bp = func.Blueprint()


@bp.route(route="api/meetings/{meeting_id}/upload", methods=["POST"])
def upload_meeting_audio(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        meeting_id = req.route_params.get("meeting_id")

        try:
            meeting = meetings_container().read_item(item=meeting_id, partition_key=meeting_id)
        except cosmos_exc.CosmosResourceNotFoundError:
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

        blob_service = BlobServiceClient.from_connection_string(
            os.environ["AZURE_STORAGE_CONNECTION_STRING"]
        )
        container_name = os.environ.get("STORAGE_CONTAINER", "audio-recordings")
        blob_name = f"{user['sub']}/{meeting_id}.{ext}"
        blob_client = blob_service.get_blob_client(container=container_name, blob=blob_name)
        blob_client.upload_blob(audio_bytes, overwrite=True, content_settings={"content_type": content_type})
        audio_url = blob_client.url

        speech_key = os.environ["SPEECH_KEY"]
        speech_region = os.environ["SPEECH_REGION"]
        language = req.params.get("language", "zh-TW")

        sas_token = generate_blob_sas(
            account_name=blob_client.account_name,
            container_name=container_name,
            blob_name=blob_name,
            account_key=blob_service.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(hours=12),
        )
        sas_url = f"{audio_url}?{sas_token}"

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

        if meeting:
            meeting["audioUrl"] = audio_url
            meeting["transcriptionJobId"] = job_id
            meeting["status"] = "transcribing"
            custom_title = req.params.get("title", "").strip()
            if custom_title:
                meeting["title"] = custom_title
            meetings_container().replace_item(item=meeting_id, body=meeting)
        else:
            meetings_container().create_item({
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


@bp.route(route="api/meetings/{meeting_id}/transcription-status", methods=["GET"])
def get_transcription_status(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        meeting_id = req.route_params.get("meeting_id")
        meeting = meetings_container().read_item(item=meeting_id, partition_key=meeting_id)
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
        job_status = status_data.get("status", "Running")

        if job_status == "Succeeded":
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

            meeting["status"] = "completed"
            meetings_container().replace_item(item=meeting_id, body=meeting)

            return json_response({"status": "completed", "segments": segments}, req=req)

        elif job_status == "Failed":
            meeting["status"] = "failed"
            meetings_container().replace_item(item=meeting_id, body=meeting)
            return json_response({"status": "failed", "error": "轉錄失敗"}, req=req)

        return json_response({"status": "processing"}, req=req)

    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Meeting not found", 404, req)
    except Exception as e:
        logger.error(f"Transcription status error: {e}")
        return error_response(str(e), 500, req)
