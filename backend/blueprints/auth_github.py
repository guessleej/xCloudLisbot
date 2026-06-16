"""xCloud Lisbot — GitHub OAuth authentication."""

import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import create_token
from shared.config import GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
from shared.database import User, get_async_session
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"


async def _exchange_code(code: str) -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            GITHUB_TOKEN_URL,
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
    resp.raise_for_status()
    data = resp.json()
    access_token = data.get("access_token")
    if not access_token:
        raise ValueError(f"No access_token: {data.get('error_description', data)}")
    return access_token


async def _get_github_user(access_token: str) -> dict:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        user_resp = await client.get(GITHUB_USER_URL, headers=headers)
        user_resp.raise_for_status()
        profile = user_resp.json()

        # GitHub may not expose email on profile; fetch primary email separately
        if not profile.get("email"):
            emails_resp = await client.get(GITHUB_EMAILS_URL, headers=headers)
            if emails_resp.is_success:
                for em in emails_resp.json():
                    if em.get("primary") and em.get("verified"):
                        profile["email"] = em["email"]
                        break

    return profile


async def _upsert_github_user(profile: dict, session: AsyncSession) -> User:
    email = (profile.get("email") or "").lower()
    if not email:
        # Fallback: use GitHub username as pseudo-email
        login = profile.get("login", "")
        email = f"{login}@github.noemail"

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    name = profile.get("name") or profile.get("login") or email
    avatar = profile.get("avatar_url")

    if user is None:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            name=name,
            avatar=avatar,
            provider="github",
        )
        session.add(user)
    else:
        user.name = name
        user.avatar = avatar
        user.provider = "github"

    await session.commit()
    await session.refresh(user)
    return user


@router.get("/github/callback")
async def github_callback(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    """Exchange GitHub authorization code for tokens and return a JWT."""
    code = request.query_params.get("code")
    if not code:
        return error("Missing code parameter", 400)

    try:
        access_token = await _exchange_code(code)
        profile = await _get_github_user(access_token)
        user = await _upsert_github_user(profile, session)
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
        logger.error(f"GitHub auth HTTP error: {exc}")
        return error("Failed to authenticate with GitHub", 502)
    except Exception as exc:
        logger.error(f"GitHub auth error: {exc}")
        return error("Authentication failed", 500)
