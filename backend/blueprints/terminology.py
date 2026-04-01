"""Terminology dictionary CRUD endpoints."""

import uuid
from datetime import datetime, timezone
import azure.functions as func
from azure.cosmos import exceptions as cosmos_exc
from shared.auth import get_current_user
from shared.config import terminology_container
from shared.responses import json_response, error_response

bp = func.Blueprint()


@bp.route(route="api/terminology", methods=["GET"])
def list_terminology(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        items = list(terminology_container().query_items(
            query="SELECT * FROM c WHERE c.userId = @uid ORDER BY c.createdAt DESC",
            parameters=[{"name": "@uid", "value": user["sub"]}],
            enable_cross_partition_query=True,
        ))
        return json_response({"dicts": items}, req=req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/terminology", methods=["POST"])
def create_terminology(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        body = req.get_json()
        if not body.get("name", "").strip():
            return error_response("辭典名稱不可為空", 400, req)
        item = {
            "id": str(uuid.uuid4()),
            "userId": user["sub"],
            "name": body["name"].strip(),
            "description": body.get("description", ""),
            "isActive": body.get("isActive", True),
            "terms": body.get("terms", []),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        terminology_container().create_item(item)
        return json_response(item, 201, req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/terminology/{dict_id}", methods=["PUT"])
def update_terminology(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        dict_id = req.route_params.get("dict_id")
        existing = terminology_container().read_item(item=dict_id, partition_key=dict_id)
        if existing.get("userId") != user["sub"]:
            return error_response("Forbidden", 403, req)
        body = req.get_json()
        existing.update({
            "name": body.get("name", existing["name"]),
            "description": body.get("description", existing.get("description", "")),
            "isActive": body.get("isActive", existing.get("isActive", True)),
            "terms": body.get("terms", existing.get("terms", [])),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        terminology_container().replace_item(item=dict_id, body=existing)
        return json_response(existing, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)


@bp.route(route="api/terminology/{dict_id}", methods=["DELETE"])
def delete_terminology(req: func.HttpRequest) -> func.HttpResponse:
    user = get_current_user(req)
    if not user:
        return error_response("Unauthorized", 401, req)
    try:
        dict_id = req.route_params.get("dict_id")
        existing = terminology_container().read_item(item=dict_id, partition_key=dict_id)
        if existing.get("userId") != user["sub"]:
            return error_response("Forbidden", 403, req)
        terminology_container().delete_item(item=dict_id, partition_key=dict_id)
        return json_response({"ok": True}, req=req)
    except cosmos_exc.CosmosResourceNotFoundError:
        return error_response("Not found", 404, req)
    except Exception as e:
        return error_response(str(e), 500, req)
