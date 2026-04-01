"""Google OAuth endpoints."""

import os
import uuid
import logging
import requests
import azure.functions as func
from shared.auth import create_jwt, upsert_user, build_oauth_success_html
from shared.responses import cors_headers, error_response

logger = logging.getLogger(__name__)
bp = func.Blueprint()


@bp.route(route="api/auth/login/google", methods=["GET"])
def auth_google_login(req: func.HttpRequest) -> func.HttpResponse:
    client_id = os.environ["GOOGLE_CLIENT_ID"]
    redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/google"
    state = str(uuid.uuid4())
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        f"&state={state}"
        "&access_type=offline"
    )
    return func.HttpResponse(status_code=302, headers={"Location": url, **cors_headers(req)})


@bp.route(route="api/auth/callback/google", methods=["GET"])
def auth_google_callback(req: func.HttpRequest) -> func.HttpResponse:
    try:
        code = req.params.get("code")
        if not code:
            return error_response("Missing code", 400, req)

        redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/google"
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
        user = upsert_user(
            provider="google",
            provider_user_id=g_user["sub"],
            email=g_user.get("email", ""),
            name=g_user.get("name", ""),
            avatar=g_user.get("picture"),
        )
        app_token = create_jwt(user["id"], "google", user["email"])
        html = build_oauth_success_html(app_token, user)
        return func.HttpResponse(html, mimetype="text/html", headers=cors_headers(req))

    except Exception as e:
        logger.error(f"Google auth error: {e}")
        return func.HttpResponse(f"Auth error: {e}", status_code=500)
