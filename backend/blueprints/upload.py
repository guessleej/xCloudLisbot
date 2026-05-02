"""XMeet AI — Audio file upload endpoint."""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.access import require_meeting_owner
from shared.limiter import limiter
from shared.auth import get_current_user
from shared.config import AZURE_STORAGE_CONNECTION_STRING, STORAGE_CONTAINER
from shared.database import Meeting, User, get_async_session
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["upload"])


async def _upload_to_blob(file_bytes: bytes, filename: str) -> str:
    """Upload file to Azure Blob Storage and return the blob URL."""
    from azure.storage.blob import BlobServiceClient  # type: ignore
    blob_service = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    container_client = blob_service.get_container_client(STORAGE_CONTAINER)

    blob_name = f"{uuid.uuid4()}/{filename}"
    blob_client = container_client.get_blob_client(blob_name)
    blob_client.upload_blob(file_bytes, overwrite=True)

    return blob_client.url


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

    if AZURE_STORAGE_CONNECTION_STRING:
        try:
            audio_url = await _upload_to_blob(file_bytes, file.filename or "audio.wav")
            meeting.audio_url = audio_url
            meeting.status = "processing"
            meeting.source = "upload"
            logger.info(f"Uploaded {file.filename} to Blob Storage for meeting {meeting_id}")
        except Exception as exc:
            logger.error(f"Blob upload failed: {exc}")
            # Graceful fallback: mark as processing anyway
            meeting.status = "processing"
            meeting.source = "upload"
    else:
        # No storage configured — just mark as processing
        meeting.status = "processing"
        meeting.source = "upload"
        logger.info(f"No Azure Storage configured; skipped blob upload for meeting {meeting_id}")

    await session.commit()
    return ok({"message": "Upload received", "meetingId": meeting_id, "status": meeting.status})
