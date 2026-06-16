"""xCloud Lisbot — JWT authentication helpers."""

import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.config import JWT_SECRET
from shared.database import User, get_async_session

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"
_TOKEN_EXPIRE_DAYS = 7


# ── User wrapper ──────────────────────────────────────────────────────────────

class UserProxy:
    """Wraps a User ORM object and also supports dict-like access.

    calendar_bp.py (existing code, not to be modified) accesses ``user["sub"]``
    while newer blueprints use attribute access (``user.id``).  This proxy
    bridges both styles transparently.
    """

    def __init__(self, user: User) -> None:
        self._user = user
        # Expose all User attributes directly
        self.id = user.id
        self.email = user.email
        self.name = user.name
        self.avatar = user.avatar
        self.provider = user.provider
        self.created_at = user.created_at

    # Dict-like access used by calendar_bp: user["sub"] → user.id
    def __getitem__(self, key: str):
        mapping = {
            "sub": self._user.id,
            "id": self._user.id,
            "email": self._user.email,
            "name": self._user.name,
            "avatar": self._user.avatar,
            "provider": self._user.provider,
        }
        if key not in mapping:
            raise KeyError(key)
        return mapping[key]

    def get(self, key: str, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def __repr__(self) -> str:
        return f"<UserProxy id={self.id} email={self.email}>"


# ── Token helpers ─────────────────────────────────────────────────────────────

def create_token(user_id: str) -> str:
    """Create a signed HS256 JWT with 7-day expiry."""
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=_TOKEN_EXPIRE_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=_ALGORITHM)


def verify_token(token: str) -> str:
    """Verify token and return user_id (sub claim). Raises HTTPException 401 on failure."""
    from fastapi import HTTPException
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[_ALGORITHM])
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise ValueError("Missing sub claim")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
) -> UserProxy:
    """FastAPI dependency — extract JWT from Authorization header and return UserProxy.

    Returns a UserProxy that supports both attribute access (user.id) and
    dict-style access (user["sub"]) for backward compatibility with calendar_bp.py.
    """
    from fastapi import HTTPException
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.removeprefix("Bearer ").strip()
    user_id = verify_token(token)

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    return UserProxy(user)
