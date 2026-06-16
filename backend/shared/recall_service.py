"""Recall.ai meeting-bot integration.

Recall.ai dispatches a bot to join a meeting (Zoom / Google Meet / Microsoft
Teams), records it, and transcribes it. This wrapper talks to the real Recall.ai
REST API:

    POST /api/v1/bot/                create a bot for a meeting URL
    GET  /api/v1/bot/{id}/           bot status + recordings
    GET  /api/v1/transcript/{id}/    transcript metadata (data.download_url)

Inbound webhooks (bot.* lifecycle events) are signed with HMAC-SHA256 using the
workspace webhook secret (whsec_...). See verify_webhook().

Docs: https://docs.recall.ai/reference/bot_create , /docs/webhooks
"""

import base64
import hashlib
import hmac
import logging
from typing import Any, Optional

import httpx

from shared.config import (
    RECALL_API_BASE,
    RECALL_API_KEY,
    RECALL_WEBHOOK_SECRET,
)

logger = logging.getLogger(__name__)

_TIMEOUT = 30.0


class RecallError(Exception):
    """Base error for Recall.ai operations."""


class RecallNotConfigured(RecallError):
    """RECALL_API_KEY is not set."""


class RecallAuthError(RecallError):
    """Recall.ai rejected the API key (401/403)."""


def is_configured() -> bool:
    return bool(RECALL_API_KEY)


def _headers() -> dict[str, str]:
    # Recall.ai expects the raw API key in the Authorization header (no "Bearer").
    return {"Authorization": RECALL_API_KEY, "Content-Type": "application/json"}


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.status_code in (401, 403):
        raise RecallAuthError(f"Recall.ai auth failed: {resp.status_code} {resp.text[:200]}")
    if resp.status_code >= 400:
        raise RecallError(f"Recall.ai API error {resp.status_code}: {resp.text[:300]}")


async def create_bot(
    meeting_url: str,
    *,
    bot_name: str = "xCloud Lisbot Notetaker",
    metadata: Optional[dict[str, Any]] = None,
) -> dict:
    """Dispatch a bot to join `meeting_url` and transcribe the call.

    Returns the Recall.ai bot object (contains `id` and `status_changes`).
    Works for Zoom, Google Meet and Microsoft Teams — Recall infers the platform
    from the meeting URL.
    """
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")

    payload: dict[str, Any] = {
        "meeting_url": meeting_url,
        "bot_name": bot_name,
        # Enable Recall.ai's own transcription so a transcript artifact is produced.
        "recording_config": {
            "transcript": {"provider": {"recallai_streaming": {}}},
        },
    }
    if metadata:
        payload["metadata"] = metadata

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{RECALL_API_BASE}/bot/", json=payload, headers=_headers())
    _raise_for_status(resp)
    return resp.json()


async def get_bot(bot_id: str) -> dict:
    """Fetch a bot's current state, including recordings and status_changes."""
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{RECALL_API_BASE}/bot/{bot_id}/", headers=_headers())
    _raise_for_status(resp)
    return resp.json()


async def get_transcript_download_url(transcript_id: str) -> Optional[str]:
    """Resolve a transcript id to its signed download URL (data.download_url)."""
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{RECALL_API_BASE}/transcript/{transcript_id}/", headers=_headers())
    _raise_for_status(resp)
    body = resp.json()
    data = body.get("data") or {}
    return data.get("download_url")


async def fetch_transcript_json(download_url: str) -> Any:
    """Download the transcript payload from its signed URL (no auth header)."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(download_url)
    _raise_for_status(resp)
    return resp.json()


def verify_webhook(headers: dict[str, str], raw_body: bytes) -> bool:
    """Verify an inbound Recall.ai webhook signature (HMAC-SHA256).

    Recall signs `{webhook-id}.{webhook-timestamp}.{raw_body}` with the base64
    secret embedded in RECALL_WEBHOOK_SECRET (`whsec_<base64>`). The signature
    header may carry several space-separated `v1,<sig>` values during rotation.
    Header lookups are case-insensitive.
    """
    if not RECALL_WEBHOOK_SECRET:
        logger.warning("RECALL_WEBHOOK_SECRET not set — cannot verify webhook signature")
        return False

    lower = {k.lower(): v for k, v in headers.items()}
    wid = lower.get("webhook-id") or lower.get("svix-id")
    ts = lower.get("webhook-timestamp") or lower.get("svix-timestamp")
    sig_header = lower.get("webhook-signature") or lower.get("svix-signature")
    if not (wid and ts and sig_header):
        return False

    secret = RECALL_WEBHOOK_SECRET
    b64 = secret.split("_", 1)[1] if secret.startswith("whsec_") else secret
    try:
        key = base64.b64decode(b64)
    except Exception:
        logger.error("RECALL_WEBHOOK_SECRET is not valid base64")
        return False

    signed = f"{wid}.{ts}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()

    for token in sig_header.split(" "):
        # each token is "v1,<signature>"
        _, _, sig = token.partition(",")
        if sig and hmac.compare_digest(sig, expected):
            return True
    return False
