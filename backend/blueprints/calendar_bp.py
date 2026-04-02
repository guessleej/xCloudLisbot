"""Calendar integration endpoints (Google Calendar + Microsoft Outlook)."""

import os
import json
import uuid
import logging
from datetime import datetime, timezone

import requests as http_requests
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse

from shared.auth import get_current_user
from shared.config import FRONTEND_URL, BACKEND_URL
from shared.database import get_session, CalendarToken

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_cal_token(user_id: str, provider: str):
    session = get_session()
    try:
        ct = session.get(CalendarToken, f"{user_id}_{provider}")
        return ct.token_data if ct else None
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
    finally:
        session.close()


def _norm_google(e):
    s, en = e.get("start", {}), e.get("end", {})
    return {"id": e.get("id", ""), "title": e.get("summary", "（無標題）"),
        "startTime": s.get("dateTime", s.get("date", "")), "endTime": en.get("dateTime", en.get("date", "")),
        "location": e.get("location", ""),
        "attendees": [{"name": a.get("displayName", a.get("email", "")), "email": a.get("email", "")} for a in e.get("attendees", [])],
        "isOnline": bool(e.get("hangoutLink") or e.get("conferenceData")),
        "isAllDay": "date" in s and "dateTime" not in s,
        "meetingUrl": e.get("hangoutLink", ""), "provider": "google"}


def _norm_ms(e):
    s, en, om = e.get("start", {}), e.get("end", {}), e.get("onlineMeeting") or {}
    return {"id": e.get("id", ""), "title": e.get("subject", "（無標題）"),
        "startTime": s.get("dateTime", ""), "endTime": en.get("dateTime", ""),
        "location": e.get("location", {}).get("displayName", ""),
        "attendees": [{"name": a.get("emailAddress", {}).get("name", ""), "email": a.get("emailAddress", {}).get("address", "")} for a in e.get("attendees", [])],
        "isOnline": bool(e.get("onlineMeeting")), "isAllDay": e.get("isAllDay", False),
        "meetingUrl": om.get("joinUrl", ""), "provider": "microsoft"}


@router.get("/api/calendar/connections")
async def get_calendar_connections(user: dict = Depends(get_current_user)):
    return {
        "google": {"connected": _get_cal_token(user["sub"], "google") is not None},
        "microsoft": {"connected": _get_cal_token(user["sub"], "microsoft") is not None},
    }


@router.get("/api/auth/calendar/google")
async def calendar_google_login(request: Request):
    cid = os.environ.get("GOOGLE_CLIENT_ID", "")
    redir = f"{BACKEND_URL}/api/auth/callback/calendar/google"
    scopes = "openid email profile https://www.googleapis.com/auth/calendar.readonly"
    url = (f"https://accounts.google.com/o/oauth2/v2/auth?client_id={cid}&redirect_uri={redir}"
           f"&response_type=code&scope={http_requests.utils.quote(scopes)}&state={uuid.uuid4()}"
           f"&access_type=offline&prompt=consent")
    return RedirectResponse(url)


@router.get("/api/auth/callback/calendar/google")
async def calendar_google_callback(request: Request):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(400, "Missing code")
    redir = f"{BACKEND_URL}/api/auth/callback/calendar/google"
    tr = http_requests.post("https://oauth2.googleapis.com/token", data={
        "code": code, "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": redir, "grant_type": "authorization_code"}, timeout=10).json()
    gu = http_requests.get("https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {tr['access_token']}"}, timeout=10).json()
    # Use the same user_id format as auth system: google_{sub}
    cal_user_id = f"google_{gu['sub']}"
    _save_cal_token(cal_user_id, "google", {
        "access_token": tr.get("access_token"), "refresh_token": tr.get("refresh_token"),
        "expires_in": tr.get("expires_in", 3600), "stored_at": datetime.now(timezone.utc).isoformat()})
    html = f"""<!DOCTYPE html><html><body><script>
if(window.opener){{window.opener.postMessage({{type:'calendar_connected',provider:'google'}},{json.dumps(FRONTEND_URL)});}}
window.close();</script><p>已連結</p></body></html>"""
    return HTMLResponse(html)


@router.get("/api/calendar/events")
async def get_calendar_events(request: Request, user: dict = Depends(get_current_user)):
    provider = request.query_params.get("provider", "google")
    ds = request.query_params.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    try:
        qd = datetime.strptime(ds, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        qd = datetime.now(timezone.utc)
    tmin = qd.replace(hour=0, minute=0, second=0).isoformat()
    tmax = qd.replace(hour=23, minute=59, second=59).isoformat()

    if provider == "google":
        td = _get_cal_token(user["sub"], "google")
        if not td:
            return {"events": [], "connected": False}
        er = http_requests.get("https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {td['access_token']}"},
            params={"timeMin": tmin, "timeMax": tmax, "singleEvents": True, "orderBy": "startTime", "maxResults": 20}, timeout=10)
        events = [_norm_google(e) for e in er.json().get("items", [])] if er.ok else []
    elif provider == "microsoft":
        td = _get_cal_token(user["sub"], "microsoft")
        if not td:
            return {"events": [], "connected": False}
        er = http_requests.get("https://graph.microsoft.com/v1.0/me/calendarView",
            headers={"Authorization": f"Bearer {td['access_token']}"},
            params={"startDateTime": tmin, "endDateTime": tmax, "$select": "subject,start,end,attendees,onlineMeeting,bodyPreview", "$orderby": "start/dateTime", "$top": 20}, timeout=10)
        events = [_norm_ms(e) for e in er.json().get("value", [])] if er.ok else []
    else:
        events = []
    return {"events": events, "connected": True}


@router.post("/api/auth/calendar/microsoft")
async def calendar_microsoft_connect(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    at = body.get("accessToken")
    if not at:
        raise HTTPException(400, "Missing accessToken")
    _save_cal_token(user["sub"], "microsoft", {"access_token": at, "stored_at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "connected": True}
