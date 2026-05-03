"""XMeet AI — Audio file upload endpoint.

Storage routing:
  • microsoft / dev  → OneDrive for Business (Graph API, X-Storage-Token header)
  • google           → Google Drive (stored refresh token in calendar_tokens)
  • fallback         → Azure Blob Storage
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.access import require_meeting_owner
from shared.auth import get_current_user
from shared.cloud_storage import upload_to_gdrive, upload_to_onedrive
from shared.config import AZURE_STORAGE_CONNECTION_STRING, STORAGE_CONTAINER
from shared.crypto import decrypt_json, encrypt_json
from shared.database import CalendarToken, Meeting, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["upload"])

MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB
_GDRIVE_PROVIDER_KEY = "google_drive"


# ── Fallback: Azure Blob ──────────────────────────────────────────────────────

async def _upload_to_blob(file_bytes: bytes, filename: str) -> str:
    from azure.storage.blob import BlobServiceClient  # type: ignore
    blob_service = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    container_client = blob_service.get_container_client(STORAGE_CONTAINER)
    blob_name = f"{uuid.uuid4()}/{filename}"
    blob_client = container_client.get_blob_client(blob_name)
    blob_client.upload_blob(file_bytes, overwrite=True)
    return blob_client.url


# ── Google Drive token persistence ───────────────────────────────────────────

async def _get_gdrive_token_record(user_id: str, session: AsyncSession):
    tid = f"{user_id}_{_GDRIVE_PROVIDER_KEY}"
    result = await session.execute(select(CalendarToken).where(CalendarToken.id == tid))
    return result.scalar_one_or_none()


async def _persist_gdrive_token(record: CalendarToken, token_data: dict, session: AsyncSession) -> None:
    record.token_data = encrypt_json(token_data)
    await session.commit()


# ── Upload endpoint ───────────────────────────────────────────────────────────

@router.post("/meetings/{meeting_id}/upload")
@limiter.limit("5/minute")
async def upload_audio(
    request: Request,
    meeting_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    meeting = await require_meeting_owner(meeting_id, user, session)

    file_bytes = await file.read()
    if not file_bytes:
        return error("Empty file", 400)
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        return error(f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB)", 413)

    filename = file.filename or "audio.wav"
    audio_url: str | None = None
    storage_provider: str | None = None

    # ── Microsoft / OneDrive ──────────────────────────────────────────────────
    if user.provider in ("microsoft", "dev"):
        storage_token = request.headers.get("X-Storage-Token")
        if storage_token:
            try:
                audio_url = await upload_to_onedrive(file_bytes, filename, storage_token)
                if audio_url:
                    storage_provider = "onedrive"
                    logger.info(f"Uploaded to OneDrive for meeting {meeting_id}")
            except Exception as exc:
                logger.error(f"OneDrive upload error: {exc}")

        if not audio_url:
            logger.info(f"OneDrive skipped (no token or failed); falling back to Blob for meeting {meeting_id}")

    # ── Google Drive ──────────────────────────────────────────────────────────
    elif user.provider == "google":
        record = await _get_gdrive_token_record(user.id, session)
        if record:
            token_data = decrypt_json(record.token_data)
            if token_data:
                try:
                    url, updated_td = await upload_to_gdrive(file_bytes, filename, token_data)
                    if url:
                        audio_url = url
                        storage_provider = "google_drive"
                        logger.info(f"Uploaded to Google Drive for meeting {meeting_id}")
                    if updated_td and updated_td != token_data:
                        await _persist_gdrive_token(record, updated_td, session)
                except Exception as exc:
                    logger.error(f"Google Drive upload error: {exc}")
            else:
                logger.warning(f"GDrive token decrypt failed for user {user.id}")
        else:
            logger.info(f"No GDrive token for user {user.id}; falling back to Blob")

    # ── Azure Blob fallback ───────────────────────────────────────────────────
    if not audio_url:
        if AZURE_STORAGE_CONNECTION_STRING:
            try:
                audio_url = await _upload_to_blob(file_bytes, filename)
                storage_provider = "azure_blob"
                logger.info(f"Uploaded to Azure Blob for meeting {meeting_id}")
            except Exception as exc:
                logger.error(f"Blob upload failed: {exc}")
        else:
            logger.info(f"No storage configured; skipped upload for meeting {meeting_id}")

    # ── Persist meeting state ─────────────────────────────────────────────────
    if not audio_url:
        meeting.status = "error"
        meeting.source = "upload"
        meeting.cloud_storage_provider = None
        await session.commit()
        return error("No storage backend available — configure Azure Blob, OneDrive, or Google Drive", 503)

    meeting.audio_url = audio_url
    meeting.cloud_storage_provider = storage_provider
    meeting.status = "processing"
    meeting.source = "upload"

    await session.commit()
    return ok({
        "message": "Upload received",
        "meetingId": meeting_id,
        "status": meeting.status,
        "storageProvider": storage_provider,
    })
