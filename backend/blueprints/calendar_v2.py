"""xCloud Lisbot — Recall.ai Calendar V2 integration (Microsoft Outlook).

Replaces the Microsoft Graph direct path for the calendar feature. We run the
OAuth 2.0 authorization-code flow ourselves to obtain a refresh_token, hand it to
Recall (which then keeps the calendar synced and emits calendar.* webhooks), and
schedule recording bots per event with deduplication.

Routes (prefix /api/calendar/v2):
    GET    /connect              → Microsoft authorize URL (frontend redirects to it)
    GET    /callback             → OAuth callback: exchange code, create Recall calendar
    GET    /status               → connection status
    DELETE /disconnect           → disconnect the calendar
    GET    /events?start=&end=   → list calendar events (mapped)
    POST   /events/{id}/bot      → schedule a recording bot for an event
    DELETE /events/{id}/bot      → remove the scheduled bot
    PUT    /preferences          → save auto-join preference (enabled + scope)

calendar.update / calendar.sync_events webhooks arrive on /api/recall/webhook and
are delegated here via handle_calendar_webhook().
"""

import logging
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
import jwt
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.config import (
    BACKEND_URL,
    FRONTEND_URL,
    JWT_SECRET,
    MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET,
)
from shared.database import Meeting, User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok
from shared import recall_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/calendar/v2", tags=["calendar-v2"])

_MS_AUTHORIZE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
_MS_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
# offline_access → refresh_token; openid/email → id_token (to read the mailbox);
# Calendars.Read → what Recall needs to sync the calendar.
_MS_SCOPE = "offline_access openid email Calendars.Read"
_REDIRECT_URI = f"{BACKEND_URL}/api/calendar/v2/callback"

TW_TZ = timezone(timedelta(hours=8))


# ── OAuth state signing (CSRF + identifies the user on the callback) ───────────

_RETURN_TO_ALLOWED = {"calendar", "settings"}


def _sign_state(user_id: str, return_to: str = "settings") -> str:
    return jwt.encode(
        {"sub": user_id, "rt": return_to, "purpose": "calendar_v2_oauth",
         "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
        JWT_SECRET, algorithm="HS256",
    )


def _verify_state(state: str) -> Optional[dict]:
    try:
        payload = jwt.decode(state, JWT_SECRET, algorithms=["HS256"])
        if payload.get("purpose") != "calendar_v2_oauth":
            return None
        return payload
    except jwt.InvalidTokenError:
        return None


async def _load_user(user_id: str, session: AsyncSession) -> Optional[User]:
    result = await session.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def _cleanup_pending_calendar_meetings(db_user: User, session: AsyncSession) -> None:
    """Drop bot-less placeholder meetings for this user's calendar events (used on
    disconnect) so the dashboard doesn't keep pending rows whose bot will never run."""
    await session.execute(
        delete(Meeting).where(
            Meeting.user_id == db_user.id,
            Meeting.calendar_event_id.isnot(None),
            Meeting.status == "pending",
        )
    )


# ── Event mapping ──────────────────────────────────────────────────────────────

def _norm_recall_event(ev: dict) -> dict:
    """Map a Recall CalendarEvent to the frontend's CalendarEvent shape.

    Attendees/organizer/title live in the platform-native `raw` blob (Microsoft
    Graph event), not as first-class Recall fields."""
    raw = ev.get("raw") or {}
    meeting_url = ev.get("meeting_url") or ""
    attendees = []
    for a in raw.get("attendees", []) or []:
        ea = a.get("emailAddress", {}) if isinstance(a, dict) else {}
        attendees.append({"name": ea.get("name", ""), "email": ea.get("address", "")})
    return {
        "id": ev.get("id", ""),
        "recallEventId": ev.get("id", ""),
        "title": raw.get("subject") or raw.get("summary") or "（無標題）",
        "startTime": ev.get("start_time", ""),
        "endTime": ev.get("end_time", ""),
        "location": (raw.get("location") or {}).get("displayName", "") if isinstance(raw.get("location"), dict) else (raw.get("location") or ""),
        "attendees": attendees,
        "isOnline": bool(meeting_url),
        "isAllDay": bool(raw.get("isAllDay", False)),
        "meetingUrl": meeting_url,
        "provider": "microsoft",
        "botScheduled": _event_has_active_bot(ev),
    }


def _event_has_active_bot(ev: dict) -> bool:
    """True only if a bot for THIS occurrence is scheduled. Recall never prunes
    bots[] (perpetual/recurring events accumulate historical entries), so plain
    non-emptiness shows stale 'scheduled' state — match on the dedup key instead."""
    dedup_key = _dedup_key(ev)
    return any(
        isinstance(b, dict) and b.get("deduplication_key") == dedup_key
        for b in (ev.get("bots") or [])
    )


def _is_user_organizer(ev: dict, email: Optional[str]) -> bool:
    """Best-effort: is the connected user the organizer? Used by 'hosted' scope.
    Conservative — returns False when undeterminable, so we never auto-join a
    meeting the user only attends."""
    if not email:
        return False
    raw = ev.get("raw") or {}
    if isinstance(raw.get("isOrganizer"), bool):
        return raw["isOrganizer"]
    organizer = raw.get("organizer") or {}
    addr = (organizer.get("emailAddress", {}) or {}).get("address") or organizer.get("email")
    return bool(addr) and addr.lower() == email.lower()


def _dedup_key(ev: dict) -> str:
    # Recommended Recall pattern: one bot across all calendars for the same meeting.
    return f"{ev.get('start_time', '')}-{ev.get('meeting_url', '')}"


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


# ── Shared scheduling helper (used by manual endpoint + webhook reconcile) ─────

def _extract_scheduled_bot_id(scheduled_event: dict, dedup_key: str) -> Optional[str]:
    """Pull this occurrence's bot id out of the CalendarEvent returned by Schedule
    Bot. Match by dedup key; fall back to a sole bot only when unambiguous — never
    blindly pick the last entry (perpetual events list several bots)."""
    bots = [b for b in (scheduled_event.get("bots") or []) if isinstance(b, dict)]
    matches = [b for b in bots if b.get("deduplication_key") == dedup_key]
    chosen = matches[-1] if matches else (bots[0] if len(bots) == 1 else None)
    if not chosen:
        logger.warning("Could not match scheduled bot for dedup_key=%s among %d bots", dedup_key, len(bots))
        return None
    return chosen.get("bot_id") or chosen.get("id")


async def schedule_bot_for_event(ev: dict, db_user: User, session: AsyncSession) -> Optional[Meeting]:
    """Schedule a recording bot for a calendar event and create/return the local
    Meeting. Idempotent: if a Meeting already exists for this calendar event it is
    returned unchanged. Returns None if the event has no meeting URL."""
    meeting_url = ev.get("meeting_url")
    event_id = ev.get("id")
    if not meeting_url or not event_id:
        return None

    existing = (await session.execute(
        select(Meeting).where(
            Meeting.calendar_event_id == event_id,
            Meeting.user_id == db_user.id,
        )
    )).scalar_one_or_none()
    if existing is not None and existing.recall_bot_id:
        return existing

    raw = ev.get("raw") or {}
    dedup_key = _dedup_key(ev)
    meeting_id = existing.id if existing is not None else str(uuid.uuid4())
    # Schedule on Recall BEFORE touching the session — if this raises, no row is
    # added, so a transient failure can't persist a bot-less placeholder meeting.
    scheduled = await recall_service.schedule_event_bot(
        event_id,
        deduplication_key=dedup_key,
        bot_name="xCloud Lisbot Notetaker",
        join_at=ev.get("start_time"),
        metadata={"meeting_id": meeting_id, "user_id": db_user.id},
    )
    bot_id = _extract_scheduled_bot_id(scheduled, dedup_key)

    meeting = existing or Meeting(
        id=meeting_id,
        user_id=db_user.id,
        title=raw.get("subject") or raw.get("summary") or "線上會議錄音",
        language="zh-TW",
        status="pending",
        source="recall",
        calendar_event_id=event_id,
        start_time=_parse_dt(ev.get("start_time")),
        created_at=datetime.now(timezone.utc),
    )
    meeting.recall_bot_id = bot_id
    meeting.recall_status = "scheduled"
    if existing is None:
        session.add(meeting)
    return meeting


# ── OAuth flow ─────────────────────────────────────────────────────────────────

@router.get("/connect")
@limiter.limit("10/minute")
async def connect(request: Request, user=Depends(get_current_user)):
    """Return the Microsoft authorize URL; the frontend redirects the browser to it."""
    if not (MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET):
        return error("Microsoft OAuth is not configured", 503)
    if not recall_service.is_configured():
        return error("Recall.ai is not configured", 503)
    return_to = request.query_params.get("returnTo", "settings")
    if return_to not in _RETURN_TO_ALLOWED:
        return_to = "settings"
    params = {
        "client_id": MICROSOFT_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": _REDIRECT_URI,
        "response_mode": "query",
        "scope": _MS_SCOPE,
        "state": _sign_state(user.id, return_to),
        "prompt": "select_account",
    }
    return ok({"url": f"{_MS_AUTHORIZE}?{urllib.parse.urlencode(params)}"})


@router.get("/callback")
@limiter.limit("15/minute")
async def callback(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    """OAuth callback: exchange code → refresh_token, register the calendar with Recall."""
    code = request.query_params.get("code")
    state = request.query_params.get("state", "")
    fail = RedirectResponse(f"{FRONTEND_URL}/settings?calendar=error", status_code=302)
    if not code:
        return fail
    payload = _verify_state(state)
    if not payload or not payload.get("sub"):
        logger.warning("Calendar V2 callback: invalid state")
        return fail
    user_id = payload["sub"]
    return_to = payload.get("rt", "settings")
    if return_to not in _RETURN_TO_ALLOWED:
        return_to = "settings"
    # Now that the origin is known (whitelisted), land failures back there too.
    fail = RedirectResponse(f"{FRONTEND_URL}/{return_to}?calendar=error", status_code=302)
    db_user = await _load_user(user_id, session)
    if db_user is None:
        return fail

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(_MS_TOKEN, data={
                "client_id": MICROSOFT_CLIENT_ID,
                "client_secret": MICROSOFT_CLIENT_SECRET,
                "code": code,
                "redirect_uri": _REDIRECT_URI,
                "grant_type": "authorization_code",
                "scope": _MS_SCOPE,
            })
        if not resp.is_success:
            logger.warning("Calendar V2 token exchange failed: %s %s", resp.status_code, resp.text[:200])
            return fail
        tokens = resp.json()
        refresh_token = tokens.get("refresh_token")
        if not refresh_token:
            logger.warning("Calendar V2: no refresh_token in token response")
            return fail
        oauth_email = _email_from_id_token(tokens.get("id_token"))

        calendar = await recall_service.create_calendar(
            platform="microsoft_outlook",
            oauth_client_id=MICROSOFT_CLIENT_ID,
            oauth_client_secret=MICROSOFT_CLIENT_SECRET,
            oauth_refresh_token=refresh_token,
            oauth_email=oauth_email,
            metadata={"user_id": db_user.id},
        )
        db_user.recall_calendar_id = calendar.get("id")
        await session.commit()
    except recall_service.RecallError as exc:
        logger.error("Calendar V2 create_calendar failed: %s", exc)
        return fail
    except Exception as exc:  # noqa: BLE001 — never leak a stack to the browser redirect
        logger.error("Calendar V2 callback error: %s", exc)
        return fail

    return RedirectResponse(f"{FRONTEND_URL}/{return_to}?calendar=connected", status_code=302)


def _email_from_id_token(id_token: Optional[str]) -> Optional[str]:
    if not id_token:
        return None
    try:
        claims = jwt.decode(id_token, options={"verify_signature": False})
        return claims.get("email") or claims.get("preferred_username")
    except jwt.InvalidTokenError:
        return None


@router.get("/status")
async def status(
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    db_user = await _load_user(user.id, session)
    if db_user is None or not db_user.recall_calendar_id:
        return ok({"connected": False, "autoJoinEnabled": False, "autoJoinScope": "hosted"})

    cal_status, email = "connected", None
    try:
        cal = await recall_service.retrieve_calendar(db_user.recall_calendar_id)
        cal_status = cal.get("status", "connected")
        email = cal.get("platform_email")
    except recall_service.RecallError as exc:
        logger.warning("retrieve_calendar failed: %s", exc)

    return ok({
        "connected": cal_status != "disconnected",
        "status": cal_status,
        "email": email,
        "autoJoinEnabled": bool(db_user.auto_join_enabled),
        "autoJoinScope": db_user.auto_join_scope or "hosted",
    })


@router.delete("/disconnect")
async def disconnect(
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    db_user = await _load_user(user.id, session)
    if db_user and db_user.recall_calendar_id:
        try:
            await recall_service.destroy_calendar(db_user.recall_calendar_id)
        except recall_service.RecallError as exc:
            # Don't drop the local link if Recall still holds the connection — that
            # would orphan the calendar (Recall keeps syncing with our token).
            logger.warning("destroy_calendar failed: %s", exc)
            return error("中斷連線失敗,請稍後再試", 502)
        db_user.recall_calendar_id = None
        db_user.auto_join_enabled = False
        await _cleanup_pending_calendar_meetings(db_user, session)
        await session.commit()
    return ok({"connected": False})


# ── Events ─────────────────────────────────────────────────────────────────────

@router.get("/events")
async def list_events(
    request: Request,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    db_user = await _load_user(user.id, session)
    if db_user is None or not db_user.recall_calendar_id:
        return ok({"events": [], "connected": False})

    start = request.query_params.get("start")
    end = request.query_params.get("end")
    if not start or not end:
        # Default to the queried day (or today) in Taipei time.
        ds = request.query_params.get("date", datetime.now(TW_TZ).strftime("%Y-%m-%d"))
        try:
            qd = datetime.strptime(ds, "%Y-%m-%d")
        except ValueError:
            qd = datetime.now(TW_TZ)
        start = qd.replace(hour=0, minute=0, second=0, tzinfo=TW_TZ).astimezone(timezone.utc).isoformat()
        end = qd.replace(hour=23, minute=59, second=59, tzinfo=TW_TZ).astimezone(timezone.utc).isoformat()

    try:
        raw_events = await recall_service.list_calendar_events(
            db_user.recall_calendar_id, start_time__gte=start, start_time__lte=end,
        )
    except recall_service.RecallError as exc:
        logger.warning("list_calendar_events failed: %s", exc)
        return error("行事曆同步失敗,請稍後再試", 502)

    events = [_norm_recall_event(e) for e in raw_events if not e.get("is_deleted")]
    events.sort(key=lambda e: e["startTime"])
    return ok({"events": events, "connected": True})


@router.post("/events/{event_id}/bot")
async def schedule_event(
    event_id: str,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    if not recall_service.is_configured():
        return error("Recall.ai is not configured", 503)
    db_user = await _load_user(user.id, session)
    if db_user is None or not db_user.recall_calendar_id:
        return error("行事曆尚未連接", 400)

    try:
        ev = await recall_service.retrieve_calendar_event(event_id)
    except recall_service.RecallError as exc:
        logger.warning("retrieve_calendar_event failed: %s", exc)
        return error("找不到行事曆事件", 404)

    # The event must belong to the caller's connected calendar (all calendars in
    # the Recall workspace share one API key — never let a user target another's).
    if ev.get("calendar_id") != db_user.recall_calendar_id:
        return error("無權限操作此行事曆事件", 403)
    if not ev.get("meeting_url"):
        return error("此事件沒有線上會議連結", 400)

    try:
        meeting = await schedule_bot_for_event(ev, db_user, session)
    except recall_service.RecallError as exc:
        logger.error("schedule_event_bot failed: %s", exc)
        return error("派遣 bot 失敗", 502)

    if meeting is None:
        return error("此事件無法排程", 400)
    await session.commit()
    return ok({"meetingId": meeting.id, "botId": meeting.recall_bot_id, "botScheduled": True})


@router.delete("/events/{event_id}/bot")
async def remove_event(
    event_id: str,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    if not recall_service.is_configured():
        return error("Recall.ai is not configured", 503)
    db_user = await _load_user(user.id, session)
    if db_user is None or not db_user.recall_calendar_id:
        return error("行事曆尚未連接", 400)

    # Verify the event belongs to the caller's calendar before removing its bot.
    try:
        ev = await recall_service.retrieve_calendar_event(event_id)
    except recall_service.RecallError as exc:
        logger.warning("retrieve_calendar_event failed: %s", exc)
        return error("找不到行事曆事件", 404)
    if ev.get("calendar_id") != db_user.recall_calendar_id:
        return error("無權限操作此行事曆事件", 403)

    try:
        await recall_service.remove_event_bot(event_id)
    except recall_service.RecallError as exc:
        logger.error("remove_event_bot failed: %s", exc)
        return error("移除 bot 失敗", 502)

    meeting = (await session.execute(
        select(Meeting).where(
            Meeting.calendar_event_id == event_id,
            Meeting.user_id == db_user.id,
        )
    )).scalar_one_or_none()
    # Only delete the placeholder if the bot never started recording.
    if meeting is not None and meeting.status == "pending":
        await session.delete(meeting)
    await session.commit()
    return ok({"botScheduled": False})


# ── Preferences ────────────────────────────────────────────────────────────────

class PreferencesBody(BaseModel):
    autoJoinEnabled: bool
    autoJoinScope: str = "hosted"


@router.put("/preferences")
async def save_preferences(
    body: PreferencesBody,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    if body.autoJoinScope not in ("all", "hosted"):
        return error("autoJoinScope 必須是 'all' 或 'hosted'", 400)
    db_user = await _load_user(user.id, session)
    if db_user is None:
        return error("使用者不存在", 401)
    db_user.auto_join_enabled = body.autoJoinEnabled
    db_user.auto_join_scope = body.autoJoinScope
    await session.commit()
    return ok({"autoJoinEnabled": body.autoJoinEnabled, "autoJoinScope": body.autoJoinScope})


# ── Webhook handler (delegated from /api/recall/webhook for calendar.* events) ──

async def handle_calendar_webhook(event: str, payload: dict, session: AsyncSession) -> dict:
    """Process calendar.update / calendar.sync_events events.

    calendar.update     → re-fetch connection state; clear it locally if disconnected.
    calendar.sync_events → incrementally re-fetch events and reconcile scheduled bots
                           against the user's auto-join preference.
    """
    data = payload.get("data") or {}
    calendar_id = data.get("calendar_id")
    if not calendar_id:
        return {"ignored": True}

    db_user = (await session.execute(
        select(User).where(User.recall_calendar_id == calendar_id)
    )).scalar_one_or_none()
    if db_user is None:
        logger.info("Calendar webhook for unknown calendar %s (%s)", calendar_id, event)
        return {"ignored": True}

    if event == "calendar.update":
        try:
            cal = await recall_service.retrieve_calendar(calendar_id)
            if cal.get("status") == "disconnected":
                db_user.recall_calendar_id = None
                db_user.auto_join_enabled = False
                await _cleanup_pending_calendar_meetings(db_user, session)
                await session.commit()
        except recall_service.RecallError as exc:
            logger.warning("calendar.update retrieve failed: %s", exc)
        return {"received": True}

    if event == "calendar.sync_events":
        last_ts = data.get("last_updated_ts")
        try:
            events = await recall_service.list_calendar_events(
                calendar_id, updated_at__gte=last_ts
            )
        except recall_service.RecallError as exc:
            logger.warning("calendar.sync_events list failed: %s", exc)
            return {"received": True}
        await _reconcile_events(events, db_user, session)
        await session.commit()
        return {"received": True, "count": len(events)}

    return {"ignored": True}


async def _reconcile_events(events: list[dict], db_user: User, session: AsyncSession) -> None:
    """Add/remove scheduled bots to match the user's auto-join preference."""
    event_ids = [ev.get("id") for ev in events if ev.get("id")]
    if not event_ids:
        return
    # Preload existing meetings in one query (avoid N+1 in the webhook path).
    rows = (await session.execute(
        select(Meeting).where(
            Meeting.calendar_event_id.in_(event_ids),
            Meeting.user_id == db_user.id,
        )
    )).scalars().all()
    by_event = {m.calendar_event_id: m for m in rows}

    for ev in events:
        event_id = ev.get("id")
        if not event_id:
            continue
        existing = by_event.get(event_id)

        if ev.get("is_deleted"):
            # Recall auto-removes the bot; drop the local placeholder if unused.
            if existing is not None and existing.status == "pending":
                await session.delete(existing)
            continue

        if not ev.get("meeting_url"):
            continue

        should = bool(db_user.auto_join_enabled) and (
            db_user.auto_join_scope == "all" or _is_user_organizer(ev, db_user.email)
        )

        if existing is None:
            if should:
                try:
                    m = await schedule_bot_for_event(ev, db_user, session)
                    if m is not None:
                        by_event[event_id] = m
                except recall_service.RecallError as exc:
                    logger.warning("auto-schedule failed for event %s: %s", event_id, exc)
        elif existing.status == "pending":
            # Event changed (time/url) before the bot joined → resubmit to override.
            new_start = _parse_dt(ev.get("start_time"))
            if new_start and existing.start_time != new_start:
                try:
                    dedup_key = _dedup_key(ev)
                    scheduled = await recall_service.schedule_event_bot(
                        event_id, deduplication_key=dedup_key,
                        language="zh-TW",
                        join_at=ev.get("start_time"),
                        metadata={"meeting_id": existing.id, "user_id": db_user.id},
                    )
                    # Only overwrite the bot id if we positively matched one — a None
                    # (ambiguous multi-bot perpetual event) must not wipe the known id.
                    new_bot_id = _extract_scheduled_bot_id(scheduled, dedup_key)
                    if new_bot_id:
                        existing.recall_bot_id = new_bot_id
                    existing.start_time = new_start
                except recall_service.RecallError as exc:
                    logger.warning("reschedule failed for event %s: %s", event_id, exc)
