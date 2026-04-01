"""GitHub OAuth endpoints."""

import os
import uuid
import logging
import requests as http_requests
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse

from shared.auth import create_jwt, upsert_user, build_oauth_success_html

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/auth/login/github")
async def auth_github_login(request: Request):
    client_id = os.environ.get("GITHUB_CLIENT_ID", "")
    base = str(request.base_url).rstrip("/")
    redirect_uri = f"{base}/api/auth/callback/github"
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={client_id}&redirect_uri={redirect_uri}"
        f"&scope=read:user%20user:email&state={uuid.uuid4()}"
    )
    return RedirectResponse(url)


@router.get("/api/auth/callback/github")
async def auth_github_callback(request: Request):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(400, "Missing code")

    base = str(request.base_url).rstrip("/")
    redirect_uri = f"{base}/api/auth/callback/github"
    tr = http_requests.post("https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        data={"client_id": os.environ["GITHUB_CLIENT_ID"],
              "client_secret": os.environ["GITHUB_CLIENT_SECRET"],
              "code": code, "redirect_uri": redirect_uri}, timeout=10)
    gh_token = tr.json().get("access_token")
    if not gh_token:
        raise HTTPException(401, "GitHub OAuth failed: no access token")
    ur = http_requests.get("https://api.github.com/user",
        headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/vnd.github+json"}, timeout=10)
    g = ur.json()

    email = g.get("email") or ""
    if not email:
        er = http_requests.get("https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {gh_token}"}, timeout=10)
        email = next((e["email"] for e in er.json() if e.get("primary")), "")

    user = upsert_user("github", str(g["id"]), email,
        g.get("name") or g.get("login", ""), g.get("avatar_url"))
    html = build_oauth_success_html(create_jwt(user["id"], "github", user["email"]), user)
    return HTMLResponse(html)
