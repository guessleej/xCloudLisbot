"""xCloud Lisbot — Access control helpers."""

import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.database import Meeting

logger = logging.getLogger(__name__)


async def require_meeting_owner(
    meeting_id: str,
    user: Any,  # accepts User ORM or UserProxy
    session: AsyncSession,
) -> Meeting:
    """Return meeting if it belongs to user, otherwise raise 403."""
    result = await session.execute(
        select(Meeting).where(Meeting.id == meeting_id)
    )
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.user_id != user.id:
        logger.warning("Access denied: user %s attempted to access meeting %s (owner: %s)",
                       user.id, meeting_id, meeting.user_id)
        raise HTTPException(status_code=403, detail="Access denied")
    return meeting


async def get_shared_meeting(token: str, session: AsyncSession) -> Meeting:
    """Return meeting by share_token (public, no auth required)."""
    result = await session.execute(
        select(Meeting).where(Meeting.share_token == token)
    )
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=404, detail="Shared meeting not found")
    return meeting
