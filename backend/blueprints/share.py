"""Meeting sharing and collaboration endpoints."""

from datetime import datetime, timezone
import azure.functions as func
from azure.cosmos import exceptions as cosmos_exc
from shared.auth import get_current_user
from shared.config import meetings_container, shares_container
from shared.responses import json_response, error_response

bp = func.Blueprint()


def _is_meeting_owner(meeting_id: str, user_id: str) -> bool:
    try:
        meeting = meetings_container().read_item(item=meeting_id, partition_key=meeting_id)
        return meeting.get("userId") == user_id
    except Exception:
        return False


@bp.route(route="api/meetings/{meeting_id}/share", methods=["GET"])
def get_meeting_shares(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        meeting_id = req.route_params.get("meeting_id")
        items = list(shares_container().query_items(
            query="SELECT * FROM c WHERE c.meetingId = @mid",
            parameters=[{"name": "@mid", "value": meeting_id}],
            enable_cross_partition_query=True,
        ))
        is_owner = any(i.get("ownerId") == user["sub"] for i in items) or _is_meeting_owner(meeting_id, user["sub"])
        is_member = any(i.get("memberEmail") == user.get("email") for i in items)
        if not is_owner and not is_member:
            return error_response("Forbidden", 403, req)

        members = [
            {
                "email": i["memberEmail"],
                "name": i.get("memberName", ""),
                "permission": i.get("permission", "view"),
                "sharedAt": i.get("createdAt", ""),
            }
            for i in items
        ]
        return json_response({"members": members}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/meetings/{meeting_id}/share", methods=["POST"])
def add_meeting_share(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        meeting_id = req.route_params.get("meeting_id")
        if not _is_meeting_owner(meeting_id, user["sub"]):
            return error_response("只有會議擁有者可以分享", 403, req)

        body = req.get_json()
        email = body.get("email", "").strip().lower()
        if not email:
            return error_response("Email 不可為空", 400, req)
        permission = body.get("permission", "view")
        invite_message = body.get("message", "")

        share_id = f"{meeting_id}_{email}"
        share_item = {
            "id": share_id,
            "meetingId": meeting_id,
            "ownerId": user["sub"],
            "ownerName": user.get("email", ""),
            "memberEmail": email,
            "memberName": "",
            "permission": permission,
            "inviteMessage": invite_message,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        shares_container().upsert_item(share_item)
        return json_response({"ok": True, "shareId": share_id}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/meetings/{meeting_id}/share/{email}", methods=["DELETE"])
def revoke_meeting_share(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        meeting_id = req.route_params.get("meeting_id")
        email = req.route_params.get("email")
        if not _is_meeting_owner(meeting_id, user["sub"]):
            return error_response("只有會議擁有者可以撤銷分享", 403, req)

        share_id = f"{meeting_id}_{email.lower()}"
        shares_container().delete_item(item=share_id, partition_key=share_id)
        return json_response({"ok": True}, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Share not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)
