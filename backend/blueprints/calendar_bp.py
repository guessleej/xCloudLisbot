"""Calendar integration endpoints (Microsoft Outlook only)."""

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_user
from shared.database import CalendarToken, User, get_async_session

logger = logging.getLogger(__name__)
router = APIRouter()

TW_TZ = timezone(timedelta(hours=8))


# ── Token helpers (async) ──────────────────────────────────────────────────────

async def _get_cal_token(user_id: str, provider: str, session: AsyncSession) -> dict | None:
    ct_id = f"{user_id}_{provider}"
    result = await session.execute(select(CalendarToken).where(CalendarToken.id == ct_id))
    ct = result.scalar_one_or_none()
    return ct.token_data if ct else None


async def _save_cal_token(user_id: str, provider: str, token_data: dict, session: AsyncSession) -> None:
    ct_id = f"{user_id}_{provider}"
    result = await session.execute(select(CalendarToken).where(CalendarToken.id == ct_id))
    existing = result.scalar_one_or_none()
    if existing:
        existing.token_data = token_data
        existing.updated_at = datetime.now(timezone.utc)
    else:
        session.add(CalendarToken(
            id=ct_id,
            user_id=user_id,
            provider=provider,
            token_data=token_data,
            updated_at=datetime.now(timezone.utc),
        ))
    await session.commit()


async def _refresh_microsoft_token(user_id: str, token_data: dict, session: AsyncSession) -> str | None:
    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                data={
                    "client_id": os.environ.get("MICROSOFT_CLIENT_ID", ""),
                    "client_secret": os.environ.get("MICROSOFT_CLIENT_SECRET", ""),
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                    "scope": "Calendars.Read",
                },
            )
        if resp.is_success:
            new_tokens = resp.json()
            updated = {
                "access_token": new_tokens["access_token"],
                "refresh_token": new_tokens.get("refresh_token", refresh_token),
                "expires_in": new_tokens.get("expires_in", 3600),
                "stored_at": datetime.now(timezone.utc).isoformat(),
            }
            await _save_cal_token(user_id, "microsoft", updated, session)
            return new_tokens["access_token"]
    except Exception as e:
        logger.warning(f"Microsoft token refresh failed: {e}")
    return None


async def _get_ms_access_token(user_id: str, session: AsyncSession) -> str | None:
    td = await _get_cal_token(user_id, "microsoft", session)
    if not td:
        return None

    stored_at = td.get("stored_at")
    expires_in = td.get("expires_in", 3600)
    if stored_at:
        try:
            stored_time = datetime.fromisoformat(stored_at)
            if datetime.now(timezone.utc) > stored_time + timedelta(seconds=expires_in - 60):
                refreshed = await _refresh_microsoft_token(user_id, td, session)
                if refreshed:
                    return refreshed
        except (ValueError, TypeError):
            pass

    return td.get("access_token")


# ── Event normalizer ───────────────────────────────────────────────────────────

def _norm_ms(e: dict) -> dict:
    s = e.get("start", {})
    en = e.get("end", {})
    om = e.get("onlineMeeting") or {}
    tz_name = s.get("timeZone", "UTC")
    start_dt = s.get("dateTime", "")
    end_dt = en.get("dateTime", "")
    if start_dt and "Z" not in start_dt and "+" not in start_dt:
        if tz_name == "UTC":
            start_dt += "Z"
            end_dt += "Z"
        elif "Taipei" in tz_name or "China" in tz_name:
            start_dt += "+08:00"
            end_dt += "+08:00"
    return {
        "id": e.get("id", ""),
        "title": e.get("subject", "（無標題）"),
        "startTime": start_dt,
        "endTime": end_dt,
        "location": e.get("location", {}).get("displayName", ""),
        "attendees": [
            {
                "name": a.get("emailAddress", {}).get("name", ""),
                "email": a.get("emailAddress", {}).get("address", ""),
            }
            for a in e.get("attendees", [])
        ],
        "isOnline": bool(e.get("onlineMeeting")),
        "isAllDay": e.get("isAllDay", False),
        "meetingUrl": om.get("joinUrl", ""),
        "provider": "microsoft",
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/api/calendar/connections")
async def get_calendar_connections(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    td = await _get_cal_token(str(user.id), "microsoft", session)
    return {"microsoft": {"connected": td is not None}}


@router.get("/api/calendar/events")
async def get_calendar_events(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    provider = request.query_params.get("provider", "microsoft")
    ds = request.query_params.get("date", datetime.now(TW_TZ).strftime("%Y-%m-%d"))

    try:
        qd = datetime.strptime(ds, "%Y-%m-%d")
    except ValueError:
        qd = datetime.now(TW_TZ).replace(hour=0, minute=0, second=0, microsecond=0)

    day_start_tw = qd.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=TW_TZ)
    day_end_tw = qd.replace(hour=23, minute=59, second=59, microsecond=0, tzinfo=TW_TZ)
    tmin_utc = day_start_tw.astimezone(timezone.utc)
    tmax_utc = day_end_tw.astimezone(timezone.utc)

    if provider == "microsoft":
        access_token = await _get_ms_access_token(str(user.id), session)
        if not access_token:
            return {"events": [], "connected": False}

        async with httpx.AsyncClient(timeout=10) as client:
            er = await client.get(
                "https://graph.microsoft.com/v1.0/me/calendarView",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Prefer": 'outlook.timezone="Asia/Taipei"',
                },
                params={
                    "startDateTime": tmin_utc.strftime("%Y-%m-%dT%H:%M:%S.0000000"),
                    "endDateTime": tmax_utc.strftime("%Y-%m-%dT%H:%M:%S.0000000"),
                    "$select": "subject,start,end,attendees,onlineMeeting,bodyPreview,isAllDay",
                    "$orderby": "start/dateTime",
                    "$top": "20",
                },
            )

        if er.is_success:
            events = [_norm_ms(e) for e in er.json().get("value", [])]
        else:
            logger.warning(f"Microsoft calendar API error: {er.status_code} {er.text[:200]}")
            if er.status_code == 401:
                return {"events": [], "connected": False, "error": "token_expired"}
            events = []
    else:
        events = []

    return {"events": events, "connected": True}


@router.post("/api/auth/calendar/microsoft")
async def calendar_microsoft_connect(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    body = await request.json()
    at = body.get("accessToken")
    if not at:
        raise HTTPException(400, "Missing accessToken")
    await _save_cal_token(str(user.id), "microsoft", {
        "access_token": at,
        "expires_in": 3600,
        "stored_at": datetime.now(timezone.utc).isoformat(),
    }, session)
    return {"ok": True, "connected": True}
