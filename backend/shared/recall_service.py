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

import asyncio
import base64
import hashlib
import hmac
import logging
import time
from typing import Any, Optional

import httpx

from shared.config import (
    RECALL_API_BASE,
    RECALL_API_BASE_V2,
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


# Map our SpeechLanguage codes to Recall.ai transcription language codes.
# Recall's providers do NOT support Taiwanese (nan-TW) or Hakka (hak-TW) — those
# stay on the Azure Speech track and must never be dispatched to a bot.
_RECALL_LANGUAGE = {
    "zh-TW": "zh",
    "zh-CN": "zh",
    "en-US": "en",
    "ja-JP": "ja",
    "auto": "auto",
}

# Languages that recall.ai cannot transcribe — caller must use the Azure track.
UNSUPPORTED_LANGUAGES = {"nan-TW", "hak-TW"}


def recall_language_code(language: str) -> str:
    return _RECALL_LANGUAGE.get(language, "zh")


async def create_bot(
    meeting_url: str,
    *,
    bot_name: str = "xCloud Lisbot Notetaker",
    language: str = "zh-TW",
    join_at: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict:
    """Dispatch a bot to join `meeting_url` and transcribe the call.

    Returns the Recall.ai bot object (contains `id` and `status_changes`).
    Works for Zoom, Google Meet and Microsoft Teams — Recall infers the platform
    from the meeting URL. `language` is one of our SpeechLanguage codes;
    nan-TW / hak-TW are rejected (use the Azure Speech track instead).
    `join_at` (ISO datetime) schedules the bot to join later instead of now.
    """
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    if language in UNSUPPORTED_LANGUAGES:
        raise RecallError(f"Recall.ai cannot transcribe {language}; use the Azure Speech track")

    payload: dict[str, Any] = {
        "meeting_url": meeting_url,
        "bot_name": bot_name,
        # Recall.ai's own streaming transcription. language_code "auto" lets Recall
        # detect the spoken language (incl. Mandarin). The transcript artifact is
        # produced during/after the call and retrieved on the transcript.done webhook.
        # (recallai_async is NOT a valid provider key — recallai_streaming is.)
        "recording_config": {
            "transcript": {
                "provider": {"recallai_streaming": {"language_code": "auto"}}
            },
        },
    }
    if join_at:
        payload["join_at"] = join_at
    if metadata:
        payload["metadata"] = metadata

    # Ad-hoc bots (immediate join, no join_at) draw from Recall's warm pool, which
    # can briefly deplete and return 507 — retry a few times before giving up.
    # Scheduled bots (join_at > 10 min) don't hit this.
    attempts = 1 if join_at else 4
    for attempt in range(attempts):
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(f"{RECALL_API_BASE}/bot/", json=payload, headers=_headers())
        if resp.status_code == 507 and attempt < attempts - 1:
            logger.warning("Recall ad-hoc bot pool depleted (507), retry %d/%d", attempt + 1, attempts - 1)
            await asyncio.sleep(6)
            continue
        break
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


async def get_recording_media(bot_id: str) -> Optional[dict]:
    """Return a FRESH signed playback URL for the bot's recording.

    Recall's download URLs expire, so this fetches the current bot object and pulls
    the latest signed URL on demand (video preferred, falling back to audio).
    Returns {"url": str, "kind": "video"|"audio"} or None if not ready.
    """
    bot = await get_bot(bot_id)
    for rec in (bot.get("recordings") or []):
        shortcuts = rec.get("media_shortcuts") or {}
        for key, kind in (("video_mixed", "video"), ("audio_mixed", "audio")):
            media = shortcuts.get(key) or {}
            url = media.get("download_url")
            if url:
                return {"url": url, "kind": kind}
    return None


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

    # Reject stale/future timestamps (±5 min) to prevent replay of a captured
    # webhook — the timestamp is part of the Svix-style signing scheme for exactly
    # this reason.
    try:
        if abs(time.time() - int(ts)) > 300:
            logger.warning("Recall webhook timestamp outside tolerance — rejecting")
            return False
    except (TypeError, ValueError):
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


# ── Calendar V2 ───────────────────────────────────────────────────────────────
# recall.ai hosts calendar sync + token refresh, but NOT the OAuth consent: we run
# the OAuth 2.0 authorization-code flow ourselves, obtain a refresh_token, and hand
# it (plus our oauth client id/secret) to Recall. Recall then keeps the calendar in
# sync and emits calendar.update / calendar.sync_events webhooks.
#   POST   /api/v2/calendars/                       create a calendar connection
#   GET    /api/v2/calendars/{id}/                   retrieve connection state
#   DELETE /api/v2/calendars/{id}/                   disconnect
#   GET    /api/v2/calendar-events/?calendar_id=     list events (cursor-paginated)
#   POST   /api/v2/calendar-events/{id}/bot/         schedule a bot for an event
#   DELETE /api/v2/calendar-events/{id}/bot/         remove the scheduled bot


async def create_calendar(
    *,
    platform: str,
    oauth_client_id: str,
    oauth_client_secret: str,
    oauth_refresh_token: str,
    oauth_email: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict:
    """Register a calendar connection with Recall (Calendar V2). `platform` is
    'microsoft_outlook' or 'google_calendar'. Returns the Calendar object
    (`id`, `status`, `platform_email`)."""
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    payload: dict[str, Any] = {
        "platform": platform,
        "oauth_client_id": oauth_client_id,
        "oauth_client_secret": oauth_client_secret,
        "oauth_refresh_token": oauth_refresh_token,
    }
    if oauth_email:
        payload["oauth_email"] = oauth_email
    if metadata:
        payload["metadata"] = metadata
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{RECALL_API_BASE_V2}/calendars/", json=payload, headers=_headers())
    _raise_for_status(resp)
    return resp.json()


async def retrieve_calendar(calendar_id: str) -> dict:
    """Fetch a calendar connection's current state (status, platform_email)."""
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{RECALL_API_BASE_V2}/calendars/{calendar_id}/", headers=_headers())
    _raise_for_status(resp)
    return resp.json()


async def destroy_calendar(calendar_id: str) -> None:
    """Disconnect a calendar connection."""
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.delete(f"{RECALL_API_BASE_V2}/calendars/{calendar_id}/", headers=_headers())
    # 404 means already gone — treat as success.
    if resp.status_code != 404:
        _raise_for_status(resp)


async def list_calendar_events(
    calendar_id: str,
    *,
    updated_at__gte: Optional[str] = None,
    start_time__gte: Optional[str] = None,
    start_time__lte: Optional[str] = None,
    max_pages: int = 10,
) -> list[dict]:
    """List a calendar's events (cursor-paginated). Returns the flattened list of
    CalendarEvent objects across pages. `updated_at__gte` enables incremental sync
    after a calendar.sync_events webhook (Recall sends `last_updated_ts`)."""
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    params: dict[str, Any] = {"calendar_id": calendar_id}
    if updated_at__gte:
        params["updated_at__gte"] = updated_at__gte
    if start_time__gte:
        params["start_time__gte"] = start_time__gte
    if start_time__lte:
        params["start_time__lte"] = start_time__lte

    events: list[dict] = []
    url = f"{RECALL_API_BASE_V2}/calendar-events/"
    nxt = None
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for _ in range(max_pages):
            resp = await client.get(url, params=params, headers=_headers())
            _raise_for_status(resp)
            body = resp.json()
            events.extend(body.get("results") or [])
            nxt = body.get("next")
            if not nxt:
                break
            # `next` is an absolute URL already carrying the cursor + filters.
            url = nxt
            params = None
        else:
            # Loop exhausted max_pages with more pages remaining — surface the
            # truncation instead of silently dropping the rest.
            if nxt:
                logger.warning(
                    "list_calendar_events hit max_pages=%d for calendar %s; "
                    "%d events fetched, more were truncated", max_pages, calendar_id, len(events),
                )
    return events


async def retrieve_calendar_event(event_id: str) -> dict:
    """Fetch a single CalendarEvent (start_time, meeting_url, raw, bots, ...)."""
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{RECALL_API_BASE_V2}/calendar-events/{event_id}/", headers=_headers()
        )
    _raise_for_status(resp)
    return resp.json()


async def schedule_event_bot(
    event_id: str,
    *,
    deduplication_key: str,
    bot_name: str = "xCloud Lisbot Notetaker",
    language: str = "zh-TW",
    join_at: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict:
    """Schedule a bot to record a calendar event. `recording_config` is nested
    inside `bot_config` (Calendar V2 contract). nan-TW/hak-TW are rejected (Azure
    track only). `join_at` MUST be re-sent when an event's start time changes —
    Recall only auto-populates it on the initial schedule, so a reschedule that
    omits it leaves the bot joining at the old time. Returns the updated
    CalendarEvent (with `bots`)."""
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    if language in UNSUPPORTED_LANGUAGES:
        raise RecallError(f"Recall.ai cannot transcribe {language}; use the Azure Speech track")

    bot_config: dict[str, Any] = {
        "bot_name": bot_name,
        "recording_config": {
            "transcript": {
                "provider": {"recallai_streaming": {"language_code": "auto"}}
            },
        },
    }
    if join_at:
        bot_config["join_at"] = join_at
    if metadata:
        bot_config["metadata"] = metadata
    payload = {"deduplication_key": deduplication_key, "bot_config": bot_config}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            f"{RECALL_API_BASE_V2}/calendar-events/{event_id}/bot/",
            json=payload,
            headers=_headers(),
        )
    _raise_for_status(resp)
    return resp.json()


async def remove_event_bot(event_id: str) -> None:
    """Remove the scheduled bot from a calendar event (no body)."""
    if not is_configured():
        raise RecallNotConfigured("RECALL_API_KEY is not set")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.delete(
            f"{RECALL_API_BASE_V2}/calendar-events/{event_id}/bot/", headers=_headers()
        )
    if resp.status_code != 404:
        _raise_for_status(resp)
