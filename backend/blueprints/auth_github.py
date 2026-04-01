"""GitHub OAuth endpoints."""

import os
import uuid
import logging
import requests
import azure.functions as func
from shared.auth import create_jwt, upsert_user, build_oauth_success_html
from shared.responses import cors_headers, error_response

logger = logging.getLogger(__name__)
bp = func.Blueprint()


@bp.route(route="api/auth/login/github", methods=["GET"])
def auth_github_login(req: func.HttpRequest) -> func.HttpResponse:
    client_id = os.environ["GITHUB_CLIENT_ID"]
    redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/github"
    state = str(uuid.uuid4())
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&scope=read:user%20user:email"
        f"&state={state}"
    )
    return func.HttpResponse(status_code=302, headers={"Location": url, **cors_headers(req)})


@bp.route(route="api/auth/callback/github", methods=["GET"])
def auth_github_callback(req: func.HttpRequest) -> func.HttpResponse:
    try:
        code = req.params.get("code")
        if not code:
            return error_response("Missing code", 400, req)

        redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/github"
        token_res = requests.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": os.environ["GITHUB_CLIENT_ID"],
                "client_secret": os.environ["GITHUB_CLIENT_SECRET"],
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=10,
        )
        gh_token = token_res.json().get("access_token")
        user_res = requests.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/vnd.github+json"},
            timeout=10,
        )
        gh_user = user_res.json()

        email = gh_user.get("email") or ""
        if not email:
            email_res = requests.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {gh_token}"},
                timeout=10,
            )
            emails = email_res.json()
            primary = next((e["email"] for e in emails if e.get("primary")), "")
            email = primary

        user = upsert_user(
            provider="github",
            provider_user_id=str(gh_user["id"]),
            email=email,
            name=gh_user.get("name") or gh_user.get("login", ""),
            avatar=gh_user.get("avatar_url"),
        )
        app_token = create_jwt(user["id"], "github", user["email"])
        html = build_oauth_success_html(app_token, user)
        return func.HttpResponse(html, mimetype="text/html", headers=cors_headers(req))

    except Exception as e:
        logger.error(f"GitHub auth error: {e}")
        return func.HttpResponse(f"Auth error: {e}", status_code=500)
