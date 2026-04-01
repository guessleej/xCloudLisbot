"""JWT authentication and user management."""

import json
import logging
from datetime import datetime, timedelta, timezone

import jwt
import azure.functions as func

from shared.config import JWT_SECRET, FRONTEND_URL, get_container

logger = logging.getLogger(__name__)


def create_jwt(user_id: str, provider: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "provider": provider,
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_jwt(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        logger.warning("JWT expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT: {e}")
        return None


def get_current_user(req: func.HttpRequest) -> dict | None:
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    return verify_jwt(token)


def upsert_user(provider: str, provider_user_id: str, email: str, name: str, avatar: str = None) -> dict:
    user_id = f"{provider}_{provider_user_id}"
    user = {
        "id": user_id,
        "email": email,
        "name": name,
        "avatar": avatar or "",
        "provider": provider,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    get_container("users").upsert_item(user)
    return user


def build_oauth_success_html(token: str, user: dict) -> str:
    return f"""<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><title>登入成功</title></head>
<body>
<script>
  if (window.opener) {{
    window.opener.postMessage({{
      type: 'oauth_callback',
      token: {json.dumps(token)},
      user: {json.dumps(user)}
    }}, {json.dumps(FRONTEND_URL)});
  }}
  window.close();
</script>
<p>登入成功，請關閉此視窗。</p>
</body>
</html>"""
