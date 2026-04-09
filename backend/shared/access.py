"""Shared meeting access control helper."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from shared.database import Share


def check_meeting_access(session: Session, meeting, user: dict, require_permission: str = None) -> dict:
    """Check if user has access to a meeting.

    Returns {"role": "owner"|"view"|"edit", "share": Share|None}
    Raises HTTPException(403) if no access.
    """
    if meeting.user_id == user["sub"]:
        return {"role": "owner", "share": None}

    # Check Share table
    share = session.query(Share).filter(
        Share.meeting_id == meeting.id,
        Share.member_email == user.get("email", ""),
    ).first()

    if not share:
        raise HTTPException(403, "Forbidden")

    if require_permission == "edit" and share.permission != "edit":
        raise HTTPException(403, "需要編輯權限才能執行此操作")

    return {"role": share.permission, "share": share}
