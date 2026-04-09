"""Apple OAuth endpoints with proper JWT signature verification."""

import os
import json
import time
import uuid
import logging
import requests as http_requests
import jwt as pyjwt
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse

from shared.auth import create_jwt, upsert_user, build_oauth_success_html

logger = logging.getLogger(__name__)
router = APIRouter()

_apple_jwks_client = None


def _get_apple_jwks_client():
    global _apple_jwks_client
    if _apple_jwks_client is None:
        _apple_jwks_client = pyjwt.PyJWKClient("https://appleid.apple.com/auth/keys")
    return _apple_jwks_client


def _build_apple_client_secret() -> str:
    from cryptography.hazmat.primitives.serialization import load_pem_private_key
    pk = load_pem_private_key(os.environ["APPLE_PRIVATE_KEY"].encode(), password=None)
    now = int(time.time())
    return pyjwt.encode(
        {"iss": os.environ["APPLE_TEAM_ID"], "iat": now, "exp": now + 86400,
         "aud": "https://appleid.apple.com", "sub": os.environ["APPLE_CLIENT_ID"]},
        pk, algorithm="ES256", headers={"kid": os.environ["APPLE_KEY_ID"]})


@router.get("/api/auth/login/apple")
async def auth_apple_login(request: Request):
    client_id = os.environ.get("APPLE_CLIENT_ID", "")
    base = str(request.base_url).rstrip("/")
    redirect_uri = f"{base}/api/auth/callback/apple"
    url = (
        "https://appleid.apple.com/auth/authorize"
        f"?client_id={client_id}&redirect_uri={redirect_uri}"
        f"&response_type=code%20id_token&scope=name%20email"
        f"&state={uuid.uuid4()}&response_mode=form_post"
    )
    return RedirectResponse(url)


@router.post("/api/auth/callback/apple")
async def auth_apple_callback(request: Request):
    form = await request.form()
    code = form.get("code") or request.query_params.get("code")
    if not code:
        raise HTTPException(400, "Missing code")

    base = str(request.base_url).rstrip("/")
    redirect_uri = f"{base}/api/auth/callback/apple"
    client_secret = _build_apple_client_secret()

    tr = http_requests.post("https://appleid.apple.com/auth/token", data={
        "client_id": os.environ["APPLE_CLIENT_ID"], "client_secret": client_secret,
        "code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri}, timeout=10)
    tokens = tr.json()

    try:
        jwks_client = _get_apple_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(tokens["id_token"])
        id_payload = pyjwt.decode(tokens["id_token"], signing_key.key, algorithms=["RS256"],
            audience=os.environ["APPLE_CLIENT_ID"], issuer="https://appleid.apple.com")
    except (ConnectionError, TimeoutError, OSError) as net_err:
        logger.error(f"Apple JWKS network error — refusing to skip signature verification: {net_err}")
        raise HTTPException(503, "Apple 登入服務暫時無法連線，請稍後再試")
    except Exception as verify_err:
        logger.error(f"Apple JWT verification failed: {verify_err}")
        raise HTTPException(401, "Apple 登入驗證失敗")

    user_json = form.get("user")
    name = ""
    if user_json:
        ai = json.loads(user_json)
        name = f"{ai.get('name', {}).get('firstName', '')} {ai.get('name', {}).get('lastName', '')}".strip()

    user = upsert_user("apple", id_payload["sub"], id_payload.get("email", ""),
        name or id_payload.get("email", "").split("@")[0])
    html = build_oauth_success_html(create_jwt(user["id"], "apple", user["email"]), user)
    return HTMLResponse(html)
