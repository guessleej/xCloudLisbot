"""Calendar integration endpoints (Google Calendar + Microsoft Outlook)."""

import os
import json
import uuid
import logging
from datetime import datetime, timezone

import requests
import azure.functions as func
from shared.auth import get_current_user
from shared.config import calendar_tokens_container, FRONTEND_URL
from shared.responses import cors_headers, json_response, error_response

logger = logging.getLogger(__name__)
bp = func.Blueprint()


def _get_calendar_token(user_id: str, provider: str) -> dict | None:
    try:
        item = calendar_tokens_container().read_item(
            item=f"{user_id}_{provider}", partition_key=f"{user_id}_{provider}"
        )
        return item.get("tokenData")
    except Exception:
        return None


def _save_calendar_token(user_id: str, provider: str, token_data: dict) -> None:
    calendar_tokens_container().upsert_item({
        "id": f"{user_id}_{provider}",
        "userId": user_id,
        "provider": provider,
        "tokenData": token_data,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    })


def _normalize_google_event(e: dict) -> dict:
    start = e.get("start", {})
    end = e.get("end", {})
    attendees = e.get("attendees", [])
    return {
        "id": e.get("id", ""),
        "title": e.get("summary", "（無標題）"),
        "startTime": start.get("dateTime", start.get("date", "")),
        "endTime": end.get("dateTime", end.get("date", "")),
        "location": e.get("location", ""),
        "description": e.get("description", ""),
        "attendees": [
            {"name": a.get("displayName", a.get("email", "")), "email": a.get("email", "")}
            for a in attendees
        ],
        "isOnline": bool(e.get("hangoutLink") or e.get("conferenceData")),
        "isAllDay": "date" in start and "dateTime" not in start,
        "meetingUrl": e.get("hangoutLink", ""),
        "provider": "google",
    }


def _normalize_microsoft_event(e: dict) -> dict:
    start = e.get("start", {})
    end = e.get("end", {})
    attendees = e.get("attendees", [])
    online_meeting = e.get("onlineMeeting") or {}
    return {
        "id": e.get("id", ""),
        "title": e.get("subject", "（無標題）"),
        "startTime": start.get("dateTime", ""),
        "endTime": end.get("dateTime", ""),
        "location": e.get("location", {}).get("displayName", ""),
        "description": e.get("bodyPreview", ""),
        "attendees": [
            {
                "name": a.get("emailAddress", {}).get("name", ""),
                "email": a.get("emailAddress", {}).get("address", ""),
            }
            for a in attendees
        ],
        "isOnline": bool(e.get("onlineMeeting")),
        "isAllDay": e.get("isAllDay", False),
        "meetingUrl": online_meeting.get("joinUrl", ""),
        "provider": "microsoft",
    }


@bp.route(route="api/calendar/connections", methods=["GET"])
def get_calendar_connections(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        google_token = _get_calendar_token(user["sub"], "google")
        microsoft_token = _get_calendar_token(user["sub"], "microsoft")
        return json_response({
            "google": {"connected": google_token is not None},
            "microsoft": {"connected": microsoft_token is not None},
        }, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/auth/calendar/google", methods=["GET"])
def calendar_google_login(req: func.HttpRequest) -> func.HttpResponse:
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/calendar/google"
    state = req.params.get("state", str(uuid.uuid4()))
    scopes = "openid email profile https://www.googleapis.com/auth/calendar.readonly"
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        f"&scope={requests.utils.quote(scopes)}"
        f"&state={state}"
        "&access_type=offline"
        "&prompt=consent"
    )
    return func.HttpResponse(status_code=302, headers={"Location": url, **cors_headers(req)})


@bp.route(route="api/auth/callback/calendar/google", methods=["GET"])
def calendar_google_callback(req: func.HttpRequest) -> func.HttpResponse:
    try:
        code = req.params.get("code")
        if not code:
            return error_response("Missing code", 400, req)

        redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/calendar/google"
        token_res = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": os.environ["GOOGLE_CLIENT_ID"],
                "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        tokens = token_res.json()
        user_res = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            timeout=10,
        )
        g_user = user_res.json()
        user_id = f"google_{g_user['sub']}"

        _save_calendar_token(user_id, "google", {
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "expires_in": tokens.get("expires_in", 3600),
            "stored_at": datetime.now(timezone.utc).isoformat(),
        })

        html = f"""<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"></head><body>
<script>
  if (window.opener) {{
    window.opener.postMessage({{type:'calendar_connected',provider:'google'}}, {json.dumps(FRONTEND_URL)});
  }}
  window.close();
</script><p>行事曆已連結，請關閉此視窗。</p></body></html>"""
        return func.HttpResponse(html, mimetype="text/html")
    except Exception as e:
        logger.error(f"Google calendar callback error: {e}")
        return func.HttpResponse(f"Error: {e}", status_code=500)


@bp.route(route="api/calendar/events", methods=["GET"])
def get_calendar_events(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        provider = req.params.get("provider", "google")
        date_str = req.params.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))

        try:
            query_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            query_date = datetime.now(timezone.utc)

        time_min = query_date.replace(hour=0, minute=0, second=0).isoformat()
        time_max = query_date.replace(hour=23, minute=59, second=59).isoformat()

        if provider == "google":
            token_data = _get_calendar_token(user["sub"], "google")
            if not token_data:
                return json_response({"events": [], "connected": False}, req=req)

            events_res = requests.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
                params={
                    "timeMin": time_min,
                    "timeMax": time_max,
                    "singleEvents": True,
                    "orderBy": "startTime",
                    "maxResults": 20,
                },
                timeout=10,
            )
            if not events_res.ok:
                return json_response({"events": [], "connected": True, "error": "無法取得事件"}, req=req)
            events = [_normalize_google_event(e) for e in events_res.json().get("items", [])]

        elif provider == "microsoft":
            token_data = _get_calendar_token(user["sub"], "microsoft")
            if not token_data:
                return json_response({"events": [], "connected": False}, req=req)

            events_res = requests.get(
                "https://graph.microsoft.com/v1.0/me/calendarView",
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
                params={
                    "startDateTime": time_min,
                    "endDateTime": time_max,
                    "$select": "subject,start,end,attendees,onlineMeeting,bodyPreview",
                    "$orderby": "start/dateTime",
                    "$top": 20,
                },
                timeout=10,
            )
            if not events_res.ok:
                return json_response({"events": [], "connected": True, "error": "無法取得事件"}, req=req)
            events = [_normalize_microsoft_event(e) for e in events_res.json().get("value", [])]

        else:
            events = []

        return json_response({"events": events, "connected": True}, req=req)

    except Exception as e:
        logger.error(f"Calendar events error: {e}")
        return error_response(str(e), 500, req)


@bp.route(route="api/auth/calendar/microsoft", methods=["POST"])
def calendar_microsoft_connect(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        body = req.get_json()
        access_token = body.get("accessToken")
        if not access_token:
            return error_response("Missing accessToken", 400, req)

        _save_calendar_token(user["sub"], "microsoft", {
            "access_token": access_token,
            "stored_at": datetime.now(timezone.utc).isoformat(),
        })
        return json_response({"ok": True, "connected": True}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)
