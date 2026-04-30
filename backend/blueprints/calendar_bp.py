"""Calendar integration endpoints (Microsoft Outlook only)."""

import os
import logging
from datetime import datetime, timezone, timedelta

import requests as http_requests
from fastapi import APIRouter, Request, Depends, HTTPException

from shared.auth import get_current_user
from shared.database import get_session, CalendarToken

logger = logging.getLogger(__name__)
router = APIRouter()

# Asia/Taipei = UTC+8
TW_OFFSET = timedelta(hours=8)
TW_TZ = timezone(TW_OFFSET)


def _get_cal_token(user_id: str, provider: str):
    session = get_session()
    try:
        ct = session.get(CalendarToken, f"{user_id}_{provider}")
        return ct.token_data if ct else None
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _save_cal_token(user_id: str, provider: str, token_data: dict):
    session = get_session()
    try:
        ct_id = f"{user_id}_{provider}"
        existing = session.get(CalendarToken, ct_id)
        if existing:
            existing.token_data = token_data
            existing.updated_at = datetime.now(timezone.utc)
        else:
            session.add(CalendarToken(id=ct_id, user_id=user_id, provider=provider,
                token_data=token_data, updated_at=datetime.now(timezone.utc)))
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _refresh_microsoft_token(user_id: str, token_data: dict) -> str | None:
    """Try to get a fresh Microsoft access token. Returns access_token or None."""
    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        return None
    try:
        resp = http_requests.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", data={
            "client_id": os.environ.get("MICROSOFT_CLIENT_ID", ""),
            "client_secret": os.environ.get("MICROSOFT_CLIENT_SECRET", ""),
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
            "scope": "Calendars.Read",
        }, timeout=10)
        if resp.ok:
            new_tokens = resp.json()
            updated = {
                "access_token": new_tokens["access_token"],
                "refresh_token": new_tokens.get("refresh_token", refresh_token),
                "expires_in": new_tokens.get("expires_in", 3600),
                "stored_at": datetime.now(timezone.utc).isoformat(),
            }
            _save_cal_token(user_id, "microsoft", updated)
            return new_tokens["access_token"]
    except Exception as e:
        logger.warning(f"Microsoft token refresh failed: {e}")
    return None


def _get_ms_access_token(user_id: str) -> str | None:
    """Get a valid Microsoft access token, refreshing if needed."""
    td = _get_cal_token(user_id, "microsoft")
    if not td:
        return None

    # Check if token is likely expired (stored_at + expires_in)
    stored_at = td.get("stored_at")
    expires_in = td.get("expires_in", 3600)
    if stored_at:
        try:
            stored_time = datetime.fromisoformat(stored_at)
            if datetime.now(timezone.utc) > stored_time + timedelta(seconds=expires_in - 60):
                # Token expired or about to expire, try refresh
                refreshed = _refresh_microsoft_token(user_id, td)
                if refreshed:
                    return refreshed
                # If refresh failed, try using the old token anyway
        except (ValueError, TypeError):
            pass

    return td.get("access_token")


def _norm_ms(e):
    s, en, om = e.get("start", {}), e.get("end", {}), e.get("onlineMeeting") or {}
    # Microsoft Graph returns dateTime without timezone + separate timeZone field
    tz_name = s.get("timeZone", "UTC")
    start_dt = s.get("dateTime", "")
    end_dt = en.get("dateTime", "")
    # Append timezone info for frontend parsing
    if start_dt and "Z" not in start_dt and "+" not in start_dt:
        if tz_name == "UTC":
            start_dt += "Z"
            end_dt += "Z"
        elif "Taipei" in tz_name or "China" in tz_name:
            start_dt += "+08:00"
            end_dt += "+08:00"

    return {"id": e.get("id", ""), "title": e.get("subject", "（無標題）"),
        "startTime": start_dt, "endTime": end_dt,
        "location": e.get("location", {}).get("displayName", ""),
        "attendees": [{"name": a.get("emailAddress", {}).get("name", ""), "email": a.get("emailAddress", {}).get("address", "")} for a in e.get("attendees", [])],
        "isOnline": bool(e.get("onlineMeeting")), "isAllDay": e.get("isAllDay", False),
        "meetingUrl": om.get("joinUrl", ""), "provider": "microsoft"}


@router.get("/api/calendar/connections")
async def get_calendar_connections(user: dict = Depends(get_current_user)):
    return {
        "microsoft": {"connected": _get_cal_token(user["sub"], "microsoft") is not None},
    }


@router.get("/api/calendar/events")
async def get_calendar_events(request: Request, user: dict = Depends(get_current_user)):
    provider = request.query_params.get("provider", "microsoft")
    ds = request.query_params.get("date", datetime.now(TW_TZ).strftime("%Y-%m-%d"))

    # Parse date in Taiwan timezone (UTC+8) for correct day boundary
    try:
        qd = datetime.strptime(ds, "%Y-%m-%d")
    except ValueError:
        qd = datetime.now(TW_TZ).replace(hour=0, minute=0, second=0, microsecond=0)

    # Day boundaries in UTC (for API queries)
    day_start_tw = qd.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=TW_TZ)
    day_end_tw = qd.replace(hour=23, minute=59, second=59, microsecond=0, tzinfo=TW_TZ)
    tmin_utc = day_start_tw.astimezone(timezone.utc)
    tmax_utc = day_end_tw.astimezone(timezone.utc)

    if provider == "microsoft":
        access_token = _get_ms_access_token(user["sub"])
        if not access_token:
            return {"events": [], "connected": False}

        # Microsoft Graph calendarView expects ISO 8601 datetime
        er = http_requests.get("https://graph.microsoft.com/v1.0/me/calendarView",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Prefer": 'outlook.timezone="Asia/Taipei"',
            },
            params={
                "startDateTime": tmin_utc.strftime("%Y-%m-%dT%H:%M:%S.0000000"),
                "endDateTime": tmax_utc.strftime("%Y-%m-%dT%H:%M:%S.0000000"),
                "$select": "subject,start,end,attendees,onlineMeeting,bodyPreview,isAllDay",
                "$orderby": "start/dateTime",
                "$top": 20,
            }, timeout=10)

        if er.ok:
            events = [_norm_ms(e) for e in er.json().get("value", [])]
        else:
            logger.warning(f"Microsoft calendar API error: {er.status_code} {er.text[:200]}")
            # Token might be expired and refresh failed
            if er.status_code == 401:
                return {"events": [], "connected": False, "error": "token_expired"}
            events = []
    else:
        events = []

    return {"events": events, "connected": True}


@router.post("/api/auth/calendar/microsoft")
async def calendar_microsoft_connect(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    at = body.get("accessToken")
    if not at:
        raise HTTPException(400, "Missing accessToken")
    _save_cal_token(user["sub"], "microsoft", {
        "access_token": at,
        "expires_in": 3600,
        "stored_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "connected": True}
