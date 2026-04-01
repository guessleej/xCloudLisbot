"""Summary template CRUD endpoints."""

import uuid
from datetime import datetime, timezone
import azure.functions as func
from azure.cosmos import exceptions as cosmos_exc
from shared.auth import get_current_user
from shared.config import templates_container
from shared.responses import json_response, error_response

bp = func.Blueprint()


@bp.route(route="api/templates", methods=["GET"])
def list_templates(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        items = list(templates_container().query_items(
            query="SELECT * FROM c WHERE c.userId = @uid ORDER BY c.createdAt DESC",
            parameters=[{"name": "@uid", "value": user["sub"]}],
            enable_cross_partition_query=True,
        ))
        return json_response({"templates": items}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/templates", methods=["POST"])
def create_template(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        body = req.get_json()
        if not body.get("name", "").strip():
            return error_response("範本名稱不可為空", 400, req)
        item = {
            "id": str(uuid.uuid4()),
            "userId": user["sub"],
            "name": body["name"].strip(),
            "description": body.get("description", ""),
            "icon": body.get("icon", "📋"),
            "systemPromptOverride": body.get("systemPromptOverride", ""),
            "isBuiltIn": False,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        templates_container().create_item(item)
        return json_response(item, 201, req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/templates/{template_id}", methods=["PUT"])
def update_template(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        template_id = req.route_params.get("template_id")
        existing = templates_container().read_item(item=template_id, partition_key=user["sub"])
        if existing.get("userId") != user["sub"]:
            return error_response("Forbidden", 403, req)
        body = req.get_json()
        existing.update({
            "name": body.get("name", existing["name"]),
            "description": body.get("description", existing.get("description", "")),
            "icon": body.get("icon", existing.get("icon", "📋")),
            "systemPromptOverride": body.get("systemPromptOverride", existing.get("systemPromptOverride", "")),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        templates_container().replace_item(item=template_id, body=existing)
        return json_response(existing, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/templates/{template_id}", methods=["DELETE"])
def delete_template(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        template_id = req.route_params.get("template_id")
        existing = templates_container().read_item(item=template_id, partition_key=user["sub"])
        if existing.get("userId") != user["sub"]:
            return error_response("Forbidden", 403, req)
        templates_container().delete_item(item=template_id, partition_key=user["sub"])
        return json_response({"ok": True}, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)
