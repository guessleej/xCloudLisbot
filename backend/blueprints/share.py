"""Meeting sharing and collaboration endpoints."""

from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException, BackgroundTasks

from shared.auth import get_current_user
from shared.database import get_session, Meeting, Share
from shared.email import send_share_notification

router = APIRouter()


def _is_meeting_owner(meeting_id: str, user_id: str) -> bool:
    session = get_session()
    try:
        m = session.get(Meeting, meeting_id)
        return m is not None and m.user_id == user_id
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/api/meetings/{meeting_id}/share")
async def get_meeting_shares(meeting_id: str, user: dict = Depends(get_current_user)):
    # Authorize BEFORE querying share list to avoid leaking member info
    is_owner = _is_meeting_owner(meeting_id, user["sub"])
    session = get_session()
    try:
        if not is_owner:
            # Check if user is a member (targeted query, not full list)
            member_check = session.query(Share).filter(
                Share.meeting_id == meeting_id,
                Share.member_email == user.get("email", "")
            ).first()
            if not member_check:
                raise HTTPException(403, "Forbidden")

        items = session.query(Share).filter(Share.meeting_id == meeting_id).all()
        return {"members": [
            {"email": i.member_email, "name": i.member_name, "permission": i.permission,
             "sharedAt": i.created_at.isoformat() if i.created_at else ""}
            for i in items
        ]}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.post("/api/meetings/{meeting_id}/share")
async def add_meeting_share(
    meeting_id: str, request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    if not _is_meeting_owner(meeting_id, user["sub"]):
        raise HTTPException(403, "只有會議擁有者可以分享")
    body = await request.json()
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(400, "Email 不可為空")
    permission = body.get("permission", "view")
    invite_message = body.get("message", "")
    session = get_session()
    try:
        share_id = f"{meeting_id}_{email}"
        existing = session.get(Share, share_id)
        if existing:
            existing.permission = permission
            existing.invite_message = invite_message
        else:
            session.add(Share(
                id=share_id, meeting_id=meeting_id, owner_id=user["sub"],
                owner_name=user.get("email", ""), member_email=email, member_name="",
                permission=permission, invite_message=invite_message,
                created_at=datetime.now(timezone.utc)))

        # Get meeting title for email
        meeting = session.get(Meeting, meeting_id)
        meeting_title = meeting.title if meeting else "會議記錄"
        session.commit()

        # Send email notification in background (non-blocking)
        background_tasks.add_task(
            send_share_notification,
            to_email=email,
            meeting_title=meeting_title,
            meeting_id=meeting_id,
            owner_name=user.get("email", ""),
            permission=permission,
            invite_message=invite_message,
        )

        return {"ok": True, "shareId": share_id, "emailSent": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.delete("/api/meetings/{meeting_id}/share/{email}")
async def revoke_meeting_share(meeting_id: str, email: str, user: dict = Depends(get_current_user)):
    if not _is_meeting_owner(meeting_id, user["sub"]):
        raise HTTPException(403, "只有會議擁有者可以撤銷分享")
    session = get_session()
    try:
        share = session.get(Share, f"{meeting_id}_{email.lower()}")
        if not share:
            raise HTTPException(404, "Share not found")
        session.delete(share)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
