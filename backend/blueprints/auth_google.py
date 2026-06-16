"""xCloud Lisbot — Google OAuth authentication."""

import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import create_token
from shared.config import FRONTEND_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
from shared.database import User, get_async_session
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


async def _exchange_code(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
    resp.raise_for_status()
    return resp.json()


async def _get_userinfo(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def _upsert_google_user(profile: dict, session: AsyncSession) -> User:
    email = (profile.get("email") or "").lower()
    if not email:
        raise ValueError("No email in Google profile")

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    name = profile.get("name") or email
    avatar = profile.get("picture")

    if user is None:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            name=name,
            avatar=avatar,
            provider="google",
        )
        session.add(user)
    else:
        user.name = name
        user.avatar = avatar
        user.provider = "google"

    await session.commit()
    await session.refresh(user)
    return user


@router.get("/google/callback")
async def google_callback(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    """Exchange Google authorization code for tokens and return a JWT."""
    code = request.query_params.get("code")
    if not code:
        return error("Missing code parameter", 400)

    redirect_uri = f"{FRONTEND_URL}/auth/callback"

    try:
        tokens = await _exchange_code(code, redirect_uri)
        access_token = tokens.get("access_token")
        if not access_token:
            return error("No access token from Google", 401)

        profile = await _get_userinfo(access_token)
        user = await _upsert_google_user(profile, session)
        token = create_token(user.id)
        return ok({
            "token": token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "avatar": user.avatar,
                "provider": user.provider,
            },
        })
    except ValueError as exc:
        return error(str(exc), 400)
    except httpx.HTTPError as exc:
        logger.error(f"Google auth HTTP error: {exc}")
        return error("Failed to authenticate with Google", 502)
    except Exception as exc:
        logger.error(f"Google auth error: {exc}")
        return error("Authentication failed", 500)
