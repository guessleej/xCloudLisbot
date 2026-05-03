"""XMeet AI — Cloud storage helpers (OneDrive for Business + Google Drive).

Routing logic:
  • microsoft / dev providers  → upload to OneDrive via Microsoft Graph
  • google provider            → upload to Google Drive (drive.file scope)
  • fallback                   → Azure Blob Storage (existing path)
"""

import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── OneDrive constants ────────────────────────────────────────────────────────

_GRAPH_BASE = "https://graph.microsoft.com/v1.0"
_ONEDRIVE_FOLDER = "XMeet AI Recordings"
_DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024   # 4 MB — use simple PUT below this
_CHUNK_SIZE = 10 * 1024 * 1024            # 10 MB chunks for large files

# ── Google Drive constants ────────────────────────────────────────────────────

_GDRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
_GDRIVE_FILES_URL  = "https://www.googleapis.com/drive/v3/files"
_GDRIVE_TOKEN_URL  = "https://oauth2.googleapis.com/token"
_GDRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"
_GDRIVE_FOLDER_NAME = "XMeet AI Recordings"


# ── OneDrive ──────────────────────────────────────────────────────────────────

async def upload_to_onedrive(
    file_bytes: bytes,
    filename: str,
    access_token: str,
) -> Optional[str]:
    """Upload file to OneDrive for Business via Microsoft Graph.

    Returns the web URL of the uploaded file, or None on failure.
    Uses simple PUT for files < 4 MB and upload sessions for larger files.
    """
    safe_name = filename.replace("'", "_").replace('"', "_")
    dest_path = f"/me/drive/root:/{_ONEDRIVE_FOLDER}/{safe_name}"

    headers = {"Authorization": f"Bearer {access_token}"}

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            if len(file_bytes) < _DIRECT_UPLOAD_LIMIT:
                url = f"{_GRAPH_BASE}{dest_path}:/content"
                resp = await client.put(
                    url,
                    headers={**headers, "Content-Type": "application/octet-stream"},
                    content=file_bytes,
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("webUrl")

            # Large file: create upload session
            session_url = f"{_GRAPH_BASE}{dest_path}:/createUploadSession"
            session_resp = await client.post(
                session_url,
                headers=headers,
                json={"item": {"@microsoft.graph.conflictBehavior": "rename"}},
            )
            session_resp.raise_for_status()
            upload_url: str = session_resp.json()["uploadUrl"]

            total = len(file_bytes)
            offset = 0
            web_url: Optional[str] = None

            while offset < total:
                end = min(offset + _CHUNK_SIZE, total)
                chunk = file_bytes[offset:end]
                chunk_headers = {
                    "Content-Range": f"bytes {offset}-{end - 1}/{total}",
                    "Content-Length": str(len(chunk)),
                }
                chunk_resp = await client.put(upload_url, headers=chunk_headers, content=chunk)
                if chunk_resp.status_code in (200, 201):
                    web_url = chunk_resp.json().get("webUrl")
                elif chunk_resp.status_code != 202:
                    chunk_resp.raise_for_status()
                offset = end

            return web_url

    except httpx.HTTPStatusError as exc:
        logger.error(f"OneDrive upload HTTP error {exc.response.status_code}: {exc.response.text[:200]}")
    except Exception as exc:
        logger.error(f"OneDrive upload failed: {exc}")

    return None


# ── Google Drive ──────────────────────────────────────────────────────────────

async def _refresh_google_token(token_data: dict) -> Optional[dict]:
    """Exchange refresh_token for a new access_token. Returns updated token_data or None."""
    from shared.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(_GDRIVE_TOKEN_URL, data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            })
        resp.raise_for_status()
        new_data = resp.json()
        return {
            **token_data,
            "access_token": new_data["access_token"],
            "expires_at": int(time.time()) + new_data.get("expires_in", 3600),
        }
    except Exception as exc:
        logger.error(f"Google token refresh failed: {exc}")
        return None


async def _get_or_create_gdrive_folder(access_token: str, folder_id_hint: Optional[str]) -> Optional[str]:
    """Return the Drive folder ID for XMeet AI Recordings, creating it if needed."""
    headers = {"Authorization": f"Bearer {access_token}"}

    # Try cached folder_id first
    if folder_id_hint:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"{_GDRIVE_FILES_URL}/{folder_id_hint}",
                    headers=headers,
                    params={"fields": "id,trashed"},
                )
            if r.status_code == 200 and not r.json().get("trashed"):
                return folder_id_hint
        except Exception:
            pass

    # Search for existing folder
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            q = f"name='{_GDRIVE_FOLDER_NAME}' and mimeType='{_GDRIVE_FOLDER_MIME}' and trashed=false"
            r = await client.get(
                _GDRIVE_FILES_URL,
                headers=headers,
                params={"q": q, "fields": "files(id)", "spaces": "drive"},
            )
        r.raise_for_status()
        files = r.json().get("files", [])
        if files:
            return files[0]["id"]
    except Exception as exc:
        logger.error(f"GDrive folder search failed: {exc}")
        return None

    # Create folder
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                _GDRIVE_FILES_URL,
                headers={**headers, "Content-Type": "application/json"},
                json={"name": _GDRIVE_FOLDER_NAME, "mimeType": _GDRIVE_FOLDER_MIME},
            )
        r.raise_for_status()
        return r.json().get("id")
    except Exception as exc:
        logger.error(f"GDrive folder creation failed: {exc}")
        return None


async def upload_to_gdrive(
    file_bytes: bytes,
    filename: str,
    token_data: dict,
) -> tuple[Optional[str], Optional[dict]]:
    """Upload file to Google Drive using resumable upload.

    Returns (web_url_or_None, possibly_updated_token_data).
    token_data may be refreshed; caller should persist the updated version.
    """
    access_token: str = token_data.get("access_token", "")
    expires_at: int   = token_data.get("expires_at", 0)

    # Refresh token if expired or about to expire
    if int(time.time()) >= expires_at - 60:
        refreshed = await _refresh_google_token(token_data)
        if refreshed:
            token_data = refreshed
            access_token = refreshed["access_token"]
        else:
            logger.error("Cannot refresh Google token — upload aborted")
            return None, None

    headers = {"Authorization": f"Bearer {access_token}"}

    folder_id = await _get_or_create_gdrive_folder(access_token, token_data.get("folder_id"))
    if folder_id:
        token_data = {**token_data, "folder_id": folder_id}

    safe_name = filename.replace("/", "_")
    metadata: dict = {"name": safe_name}
    if folder_id:
        metadata["parents"] = [folder_id]

    try:
        # Initiate resumable upload
        async with httpx.AsyncClient(timeout=30) as client:
            init_resp = await client.post(
                _GDRIVE_UPLOAD_URL,
                headers={
                    **headers,
                    "Content-Type": "application/json",
                    "X-Upload-Content-Type": "application/octet-stream",
                    "X-Upload-Content-Length": str(len(file_bytes)),
                },
                params={"uploadType": "resumable"},
                json=metadata,
            )
        init_resp.raise_for_status()
        upload_location: str = init_resp.headers["Location"]

        # Upload bytes
        async with httpx.AsyncClient(timeout=300) as client:
            up_resp = await client.put(
                upload_location,
                headers={
                    "Content-Length": str(len(file_bytes)),
                    "Content-Type": "application/octet-stream",
                },
                content=file_bytes,
                params={"fields": "id,webViewLink"},
            )
        up_resp.raise_for_status()
        web_url: Optional[str] = up_resp.json().get("webViewLink")
        return web_url, token_data

    except httpx.HTTPStatusError as exc:
        logger.error(f"GDrive upload HTTP error {exc.response.status_code}: {exc.response.text[:200]}")
    except Exception as exc:
        logger.error(f"GDrive upload failed: {exc}")

    return None, token_data
