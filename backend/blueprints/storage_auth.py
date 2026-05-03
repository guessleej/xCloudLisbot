"""XMeet AI — Cloud storage OAuth endpoints.

Handles Google Drive authorization for users who signed in with Google.
Microsoft / OneDrive users get storage automatically via their MSAL token —
no separate OAuth flow is needed.

Endpoints
---------
GET  /api/storage/status           → current cloud storage connection state
GET  /api/storage/google/authorize → redirect to Google OAuth consent screen
GET  /api/storage/google/callback  → exchange code, store token, close popup
DELETE /api/storage/google/disconnect → revoke + remove stored token
"""

import base64
import hashlib
import hmac
import logging
import time
import uuid
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.config import (
    BACKEND_URL, FRONTEND_URL,
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
    JWT_SECRET,
)
from shared.crypto import decrypt_json, encrypt_json
from shared.database import CalendarToken, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/storage", tags=["storage"])

_GOOGLE_AUTH_URL   = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL  = "https://oauth2.googleapis.com/token"
_GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
_GDRIVE_SCOPE      = "https://www.googleapis.com/auth/drive.file"
_PROVIDER_KEY      = "google_drive"


# ── State signing helpers ─────────────────────────────────────────────────────

def _sign_state(user_id: str) -> str:
    """Return a base64-encoded 'user_id:sig' state parameter."""
    sig = hmac.new(
        JWT_SECRET.encode(),
        user_id.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    raw = f"{user_id}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _verify_state(state: str) -> str | None:
    """Return user_id if state HMAC is valid, else None."""
    try:
        raw = base64.urlsafe_b64decode(state.encode()).decode()
        user_id, sig = raw.rsplit(":", 1)
        expected = hmac.new(
            JWT_SECRET.encode(),
            user_id.encode(),
            hashlib.sha256,
        ).hexdigest()[:16]
        if hmac.compare_digest(sig, expected):
            return user_id
    except Exception:
        pass
    return None


# ── Token helpers ─────────────────────────────────────────────────────────────

def _token_id(user_id: str) -> str:
    return f"{user_id}_{_PROVIDER_KEY}"


async def _get_gdrive_token(user_id: str, session: AsyncSession) -> dict | None:
    result = await session.execute(
        select(CalendarToken).where(CalendarToken.id == _token_id(user_id))
    )
    record = result.scalar_one_or_none()
    if record is None:
        return None
    return decrypt_json(record.token_data)


async def _save_gdrive_token(user: User, token_data: dict, session: AsyncSession) -> None:
    tid = _token_id(user.id)
    result = await session.execute(select(CalendarToken).where(CalendarToken.id == tid))
    record = result.scalar_one_or_none()
    encrypted = encrypt_json(token_data)

    if record is None:
        record = CalendarToken(
            id=tid,
            user_id=user.id,
            provider=_PROVIDER_KEY,
            token_data=encrypted,
        )
        session.add(record)
    else:
        record.token_data = encrypted

    await session.commit()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
@limiter.limit("60/minute")
async def storage_status(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    if user.provider in ("microsoft", "dev"):
        return ok({
            "provider": "onedrive",
            "connected": True,
            "auto": True,
            "description": "OneDrive for Business（自動，無需授權）",
        })

    if user.provider == "google":
        token = await _get_gdrive_token(user.id, session)
        connected = token is not None
        return ok({
            "provider": "google_drive",
            "connected": connected,
            "auto": False,
            "description": "Google Drive" if connected else None,
        })

    return ok({"provider": "azure_blob", "connected": True, "auto": True,
               "description": "Azure Blob Storage（預設）"})


@router.get("/google/authorize")
@limiter.limit("10/minute")
async def google_drive_authorize(
    request: Request,
    user: User = Depends(get_current_user),
):
    if user.provider != "google":
        return error("只有 Google 帳號才能連接 Google Drive", 400)

    state = _sign_state(user.id)
    redirect_uri = f"{BACKEND_URL}/api/storage/google/callback"
    params = urlencode({
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         _GDRIVE_SCOPE,
        "access_type":   "offline",
        "prompt":        "consent",
        "state":         state,
    })
    return ok({"url": f"{_GOOGLE_AUTH_URL}?{params}"})


@router.get("/google/callback", response_class=HTMLResponse)
async def google_drive_callback(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    """Receives Google OAuth callback, stores token, closes popup."""
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    err   = request.query_params.get("error")

    # Build an HTML page that sends a postMessage back to the opener
    def _close_page(event: str, payload: dict | None = None) -> HTMLResponse:
        msg = {"type": event, **(payload or {})}
        import json
        msg_json = json.dumps(msg)
        html = f"""<!DOCTYPE html><html><body><script>
if (window.opener) {{
  window.opener.postMessage({msg_json}, '*');
}}
setTimeout(() => window.close(), 500);
</script></body></html>"""
        return HTMLResponse(content=html)

    if err:
        return _close_page("gdrive_error", {"error": err})

    if not code or not state:
        return _close_page("gdrive_error", {"error": "missing_params"})

    user_id = _verify_state(state)
    if not user_id:
        return _close_page("gdrive_error", {"error": "invalid_state"})

    redirect_uri = f"{BACKEND_URL}/api/storage/google/callback"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(_GOOGLE_TOKEN_URL, data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            })
        resp.raise_for_status()
        tokens = resp.json()
    except Exception as exc:
        logger.error(f"GDrive token exchange failed: {exc}")
        return _close_page("gdrive_error", {"error": "token_exchange_failed"})

    # Fetch the user record
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return _close_page("gdrive_error", {"error": "user_not_found"})

    token_data = {
        "access_token":  tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_at":    int(time.time()) + tokens.get("expires_in", 3600),
        "folder_id":     None,
    }
    await _save_gdrive_token(user, token_data, session)
    logger.info(f"Google Drive token stored for user {user.id}")

    return _close_page("gdrive_connected")


@router.delete("/google/disconnect")
@limiter.limit("10/minute")
async def google_drive_disconnect(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    if user.provider != "google":
        return error("只有 Google 帳號才能操作此功能", 400)

    tid = _token_id(user.id)
    result = await session.execute(select(CalendarToken).where(CalendarToken.id == tid))
    record = result.scalar_one_or_none()

    if record:
        # Best-effort token revocation
        token_data = decrypt_json(record.token_data) or {}
        access_token = token_data.get("access_token")
        if access_token:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(_GOOGLE_REVOKE_URL, params={"token": access_token})
            except Exception:
                pass

        await session.delete(record)
        await session.commit()

    logger.info(f"Google Drive disconnected for user {user.id}")
    return ok({"message": "已中斷 Google Drive 連線"})
