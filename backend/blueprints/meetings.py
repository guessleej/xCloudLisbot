"""Meetings CRUD endpoints."""

import uuid
from datetime import datetime, timezone
import azure.functions as func
from azure.cosmos import exceptions as cosmos_exc
from shared.auth import get_current_user
from shared.config import meetings_container
from shared.responses import json_response, error_response

bp = func.Blueprint()


@bp.route(route="api/meetings", methods=["POST"])
def create_meeting(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        body = req.get_json()
        meeting = {
            "id": str(uuid.uuid4()),
            "userId": user["sub"],
            "title": body.get("title", "未命名會議"),
            "mode": body.get("mode", "meeting"),
            "language": body.get("language", "zh-TW"),
            "templateId": body.get("templateId", "standard"),
            "startTime": datetime.now(timezone.utc).isoformat(),
            "endTime": None,
            "status": "recording",
            "audioUrl": None,
        }
        meetings_container().create_item(meeting)
        return json_response(meeting, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/meetings", methods=["GET"])
def list_meetings(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        items = list(meetings_container().query_items(
            query="SELECT * FROM c WHERE c.userId = @uid ORDER BY c.startTime DESC OFFSET 0 LIMIT 20",
            parameters=[{"name": "@uid", "value": user["sub"]}],
            enable_cross_partition_query=True,
        ))
        return json_response({"meetings": items}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/meetings/{meeting_id}", methods=["GET"])
def get_meeting(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        meeting_id = req.route_params.get("meeting_id")
        meeting = meetings_container().read_item(item=meeting_id, partition_key=meeting_id)
        if meeting["userId"] != user["sub"]:
            return error_response("Forbidden", 403, req)
        return json_response(meeting, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Meeting not found", 404, req)
