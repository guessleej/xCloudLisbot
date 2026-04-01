"""Google OAuth endpoints."""

import os
import uuid
import logging
import requests as http_requests
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse

from shared.auth import create_jwt, upsert_user, build_oauth_success_html

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/auth/login/google")
async def auth_google_login(request: Request):
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    base = str(request.base_url).rstrip("/")
    redirect_uri = f"{base}/api/auth/callback/google"
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code&scope=openid%20email%20profile"
        f"&state={uuid.uuid4()}&access_type=offline"
    )
    return RedirectResponse(url)


@router.get("/api/auth/callback/google")
async def auth_google_callback(request: Request):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(400, "Missing code")

    base = str(request.base_url).rstrip("/")
    redirect_uri = f"{base}/api/auth/callback/google"
    tr = http_requests.post("https://oauth2.googleapis.com/token", data={
        "code": code, "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": redirect_uri, "grant_type": "authorization_code"}, timeout=10)
    tokens = tr.json()
    if "error" in tokens or "access_token" not in tokens:
        raise HTTPException(401, tokens.get("error_description", "Google OAuth failed"))
    ur = http_requests.get("https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {tokens['access_token']}"}, timeout=10)
    g = ur.json()
    user = upsert_user("google", g["sub"], g.get("email", ""), g.get("name", ""), g.get("picture"))
    html = build_oauth_success_html(create_jwt(user["id"], "google", user["email"]), user)
    return HTMLResponse(html)
