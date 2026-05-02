"""XMeet AI — Microsoft OAuth authentication."""

import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import create_token
from shared.database import User, get_async_session
from shared.limiter import limiter
from shared.responses import error, ok

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me"


async def _upsert_microsoft_user(profile: dict, session: AsyncSession) -> User:
    email = (
        profile.get("mail")
        or profile.get("userPrincipalName")
        or ""
    ).lower()
    if not email:
        raise ValueError("No email in Microsoft profile")

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    display_name = profile.get("displayName") or email
    if user is None:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            name=display_name,
            provider="microsoft",
        )
        session.add(user)
    else:
        user.name = display_name
        user.provider = "microsoft"

    await session.commit()
    await session.refresh(user)
    return user


@router.get("/microsoft/callback")
@router.post("/microsoft/callback")
@limiter.limit("5/minute")
async def microsoft_callback(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    """Accept an access token from the frontend MSAL flow and return a JWT."""
    # Support both query param and JSON body
    access_token: str | None = None
    if request.method == "POST":
        try:
            body = await request.json()
            access_token = body.get("accessToken") or body.get("access_token")
        except Exception:
            pass
    else:
        access_token = request.query_params.get("accessToken") or request.query_params.get("access_token")

    if not access_token:
        return error("Missing accessToken", 400)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                GRAPH_ME_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if not resp.is_success:
            logger.warning(f"Microsoft Graph error: {resp.status_code} {resp.text[:200]}")
            return error("Failed to fetch Microsoft profile", 401)

        profile = resp.json()
        user = await _upsert_microsoft_user(profile, session)
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
    except Exception as exc:
        logger.error(f"Microsoft auth error: {exc}")
        return error("Authentication failed", 500)
