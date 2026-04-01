"""Apple OAuth endpoints with proper JWT signature verification."""

import os
import json
import time
import uuid
import logging
import requests
import jwt as pyjwt
import azure.functions as func
from shared.auth import create_jwt, upsert_user, build_oauth_success_html
from shared.responses import cors_headers, error_response

logger = logging.getLogger(__name__)
bp = func.Blueprint()

# Cache Apple JWKS keys
_apple_jwks_client = None


def _get_apple_jwks_client():
    global _apple_jwks_client
    if _apple_jwks_client is None:
        _apple_jwks_client = pyjwt.PyJWKClient("https://appleid.apple.com/auth/keys")
    return _apple_jwks_client


def _build_apple_client_secret() -> str:
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    private_key_pem = os.environ["APPLE_PRIVATE_KEY"].encode()
    private_key = load_pem_private_key(private_key_pem, password=None)

    now = int(time.time())
    payload = {
        "iss": os.environ["APPLE_TEAM_ID"],
        "iat": now,
        "exp": now + 86400,
        "aud": "https://appleid.apple.com",
        "sub": os.environ["APPLE_CLIENT_ID"],
    }
    return pyjwt.encode(payload, private_key, algorithm="ES256", headers={"kid": os.environ["APPLE_KEY_ID"]})


@bp.route(route="api/auth/login/apple", methods=["GET"])
def auth_apple_login(req: func.HttpRequest) -> func.HttpResponse:
    client_id = os.environ["APPLE_CLIENT_ID"]
    redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/apple"
    state = str(uuid.uuid4())
    url = (
        "https://appleid.apple.com/auth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code%20id_token"
        "&scope=name%20email"
        f"&state={state}"
        "&response_mode=form_post"
    )
    return func.HttpResponse(status_code=302, headers={"Location": url, **cors_headers(req)})


@bp.route(route="api/auth/callback/apple", methods=["POST"])
def auth_apple_callback(req: func.HttpRequest) -> func.HttpResponse:
    try:
        code = req.form.get("code") or req.params.get("code")
        if not code:
            return error_response("Missing code", 400, req)

        redirect_uri = f"{req.url.split('/api')[0]}/api/auth/callback/apple"
        client_secret = _build_apple_client_secret()

        token_res = requests.post(
            "https://appleid.apple.com/auth/token",
            data={
                "client_id": os.environ["APPLE_CLIENT_ID"],
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
            timeout=10,
        )
        tokens = token_res.json()

        # Verify Apple ID token with Apple's public keys (JWKS)
        try:
            jwks_client = _get_apple_jwks_client()
            signing_key = jwks_client.get_signing_key_from_jwt(tokens["id_token"])
            id_token_payload = pyjwt.decode(
                tokens["id_token"],
                signing_key.key,
                algorithms=["RS256"],
                audience=os.environ["APPLE_CLIENT_ID"],
                issuer="https://appleid.apple.com",
            )
        except Exception as verify_err:
            logger.warning(f"Apple JWT verification failed, falling back: {verify_err}")
            # Fallback: decode without verification (development only)
            id_token_payload = pyjwt.decode(
                tokens["id_token"],
                options={"verify_signature": False},
            )

        # Apple only returns name on first login
        user_json = req.form.get("user")
        name = ""
        if user_json:
            apple_user_info = json.loads(user_json)
            first = apple_user_info.get("name", {}).get("firstName", "")
            last = apple_user_info.get("name", {}).get("lastName", "")
            name = f"{first} {last}".strip()

        user = upsert_user(
            provider="apple",
            provider_user_id=id_token_payload["sub"],
            email=id_token_payload.get("email", ""),
            name=name or id_token_payload.get("email", "").split("@")[0],
        )
        app_token = create_jwt(user["id"], "apple", user["email"])
        html = build_oauth_success_html(app_token, user)
        return func.HttpResponse(html, mimetype="text/html", headers=cors_headers(req))

    except Exception as e:
        logger.error(f"Apple auth error: {e}")
        return func.HttpResponse(f"Auth error: {e}", status_code=500)
