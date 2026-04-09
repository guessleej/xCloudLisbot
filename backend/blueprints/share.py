"""Meeting sharing and collaboration endpoints."""

import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException, BackgroundTasks

from shared.auth import get_current_user
from shared.database import get_session, Meeting, Share, Transcript, Summary
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

        # Get meeting and ensure public share is enabled
        meeting = session.get(Meeting, meeting_id)
        meeting_title = meeting.title if meeting else "會議記錄"
        share_token = None
        if meeting:
            if not meeting.share_token:
                meeting.share_token = secrets.token_urlsafe(48)
            meeting.is_public = True
            share_token = meeting.share_token
        session.commit()

        # Send email notification in background (non-blocking)
        # Email uses public link (/shared/{token}) — no login required for recipient
        background_tasks.add_task(
            send_share_notification,
            to_email=email,
            meeting_title=meeting_title,
            meeting_id=meeting_id,
            owner_name=user.get("email", ""),
            permission=permission,
            invite_message=invite_message,
            share_token=share_token,
        )

        return {"ok": True, "shareId": share_id, "emailSent": True, "shareToken": share_token}
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


# ── Public sharing (token-based, no login required) ──


@router.post("/api/meetings/{meeting_id}/share/public")
async def enable_public_share(meeting_id: str, user: dict = Depends(get_current_user)):
    """Enable public sharing — generate a share token."""
    if not _is_meeting_owner(meeting_id, user["sub"]):
        raise HTTPException(403, "只有會議擁有者可以設定公開分享")
    session = get_session()
    try:
        m = session.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(404, "Meeting not found")
        if not m.share_token:
            m.share_token = secrets.token_urlsafe(48)
        m.is_public = True
        session.commit()
        return {"ok": True, "shareToken": m.share_token, "isPublic": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.delete("/api/meetings/{meeting_id}/share/public")
async def disable_public_share(meeting_id: str, user: dict = Depends(get_current_user)):
    """Disable public sharing."""
    if not _is_meeting_owner(meeting_id, user["sub"]):
        raise HTTPException(403, "只有會議擁有者可以設定公開分享")
    session = get_session()
    try:
        m = session.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(404, "Meeting not found")
        m.is_public = False
        session.commit()
        return {"ok": True, "isPublic": False}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/api/shared/{token}")
async def get_shared_meeting(token: str):
    """Public endpoint — no login required. View meeting by share token."""
    session = get_session()
    try:
        m = session.query(Meeting).filter(
            Meeting.share_token == token,
            Meeting.is_public == True,
        ).first()
        if not m:
            raise HTTPException(404, "此分享連結無效或已被關閉")

        # Load transcripts
        transcripts = [
            {"id": t.id, "speaker": t.speaker or "說話者",
             "speakerId": (t.speaker or "").replace("說話者 ", "") or "1",
             "text": t.text, "timestamp": t.created_at.isoformat() if t.created_at else None,
             "offset": t.offset, "duration": t.duration, "confidence": t.confidence or 0.95}
            for t in session.query(Transcript).filter(Transcript.meeting_id == m.id)
                .order_by(Transcript.offset, Transcript.created_at).all()
        ]

        # Load summary
        summary_row = session.query(Summary).filter(Summary.meeting_id == m.id).first()
        summary_data = None
        if summary_row:
            summary_data = {
                "markdown": summary_row.summary or "",
                "actionItems": summary_row.action_items or [],
                "keyDecisions": summary_row.key_decisions or [],
                "nextMeetingTopics": summary_row.next_meeting_topics or [],
                "generatedAt": summary_row.generated_at.isoformat() if summary_row.generated_at else None,
            }

        return {
            "id": m.id, "title": m.title, "mode": m.mode, "language": m.language,
            "startTime": m.start_time.isoformat() if m.start_time else None,
            "endTime": m.end_time.isoformat() if m.end_time else None,
            "status": m.status,
            "transcripts": transcripts,
            "summary": summary_data,
        }
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/api/meetings/{meeting_id}/share/public")
async def get_public_share_status(meeting_id: str, user: dict = Depends(get_current_user)):
    """Check if public sharing is enabled and get the token."""
    session = get_session()
    try:
        m = session.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(404, "Meeting not found")
        if m.user_id != user["sub"]:
            raise HTTPException(403, "Forbidden")
        return {"isPublic": m.is_public or False, "shareToken": m.share_token if m.is_public else None}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
