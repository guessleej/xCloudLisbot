"""XMeet AI — Azure Speech token and Web PubSub client URL endpoints."""

import hashlib
import hmac
import base64
import logging
import time
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Request

from shared.auth import get_current_user
from shared.limiter import limiter
from shared.config import (
    SPEECH_KEY, SPEECH_REGION,
    WEB_PUBSUB_ENDPOINT, WEB_PUBSUB_HUB, WEB_PUBSUB_KEY,
)
from shared.database import User
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["speech"])


# ── Speech token ──────────────────────────────────────────────────────────────

@router.get("/speech-token")
@limiter.limit("10/minute")
async def get_speech_token(request: Request, user: User = Depends(get_current_user)):
    """Return a short-lived Azure Speech token (10 min TTL)."""
    if not SPEECH_KEY:
        return ok({
            "token": None,
            "region": SPEECH_REGION,
            "error": "not_configured",
        })

    token_url = f"https://{SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                token_url,
                headers={
                    "Ocp-Apim-Subscription-Key": SPEECH_KEY,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
        if resp.is_success:
            return ok({"token": resp.text, "region": SPEECH_REGION})
        logger.warning(f"Speech token fetch failed: {resp.status_code}")
        return ok({"token": None, "region": SPEECH_REGION, "error": "fetch_failed"})
    except Exception as exc:
        logger.error(f"Speech token error: {exc}")
        return ok({"token": None, "region": SPEECH_REGION, "error": "not_configured"})


# ── Web PubSub client URL ─────────────────────────────────────────────────────

def _generate_pubsub_client_url(user_id: str) -> str:
    """Generate a Web PubSub client WebSocket URL with HMAC-SHA256 signature."""
    hub = WEB_PUBSUB_HUB
    endpoint = WEB_PUBSUB_ENDPOINT.rstrip("/")

    # Derive endpoint host
    if endpoint.startswith("https://"):
        host = endpoint.removeprefix("https://")
    else:
        host = endpoint

    # Build client URL
    expire_ts = int(time.time()) + 3600  # 1 hour
    audience = f"https://{host}/client/hubs/{hub}"
    payload = f"{audience}\n{expire_ts}"

    key_bytes = WEB_PUBSUB_KEY.encode("utf-8")
    sig = hmac.new(key_bytes, payload.encode("utf-8"), hashlib.sha256).digest()
    token = base64.urlsafe_b64encode(sig).decode("utf-8")

    client_url = (
        f"wss://{host}/client/hubs/{hub}"
        f"?access_token={token}"
    )
    return client_url


@router.get("/ws/token")
@limiter.limit("10/minute")
async def get_ws_token(request: Request, user: User = Depends(get_current_user)):
    """Return a Web PubSub client WebSocket URL."""
    if not WEB_PUBSUB_ENDPOINT or not WEB_PUBSUB_KEY:
        return ok({
            "url": None,
            "hub": WEB_PUBSUB_HUB,
            "error": "not_configured",
        })

    try:
        client_url = _generate_pubsub_client_url(user.id)
        return ok({
            "url": client_url,
            "hub": WEB_PUBSUB_HUB,
        })
    except Exception as exc:
        logger.error(f"PubSub token error: {exc}")
        return ok({"url": None, "hub": WEB_PUBSUB_HUB, "error": "generation_failed"})
