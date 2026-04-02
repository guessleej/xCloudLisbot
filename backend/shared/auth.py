"""JWT authentication and user management."""

import json
import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Request, HTTPException

from shared.config import JWT_SECRET, FRONTEND_URL
from shared.database import get_session, User

logger = logging.getLogger(__name__)


def create_jwt(user_id: str, provider: str, email: str) -> str:
    return jwt.encode({
        "sub": user_id, "provider": provider, "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }, JWT_SECRET, algorithm="HS256")


def verify_jwt(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    payload = verify_jwt(auth_header[7:])
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    return payload


def upsert_user(provider: str, provider_user_id: str, email: str, name: str, avatar: str = None) -> dict:
    user_id = f"{provider}_{provider_user_id}"
    session = get_session()
    try:
        user = session.get(User, user_id)
        if user:
            user.email = email
            user.name = name
            user.avatar = avatar or ""
        else:
            user = User(id=user_id, email=email, name=name, avatar=avatar or "",
                        provider=provider, created_at=datetime.now(timezone.utc))
            session.add(user)
        session.commit()
        return {"id": user.id, "email": user.email, "name": user.name,
                "avatar": user.avatar, "provider": user.provider,
                "createdAt": user.created_at.isoformat() if user.created_at else ""}
    finally:
        session.close()


def build_oauth_redirect_url(token: str, user: dict) -> str:
    """Build a frontend redirect URL with auth token in fragment (not query params for security)."""
    import urllib.parse
    user_json = json.dumps(user)
    params = urllib.parse.urlencode({"token": token, "user": user_json})
    return f"{FRONTEND_URL}/auth/callback#{params}"


def build_oauth_success_html(token: str, user: dict) -> str:
    """Legacy popup callback — tries postMessage first, falls back to redirect."""
    redirect_url = build_oauth_redirect_url(token, user)
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
    window.close();
  }} else {{
    window.location.href = {json.dumps(redirect_url)};
  }}
</script>
<p>登入中...</p>
</body>
</html>"""
