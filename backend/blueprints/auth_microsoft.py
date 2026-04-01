"""Microsoft OAuth endpoint."""

import logging
import requests
import azure.functions as func
from shared.auth import create_jwt, get_current_user, upsert_user
from shared.responses import json_response, error_response

logger = logging.getLogger(__name__)
bp = func.Blueprint()


@bp.route(route="api/auth/callback/microsoft", methods=["POST"])
def auth_microsoft(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
        access_token = body.get("accessToken")
        if not access_token:
            return error_response("Missing accessToken", req=req)

        graph_res = requests.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if not graph_res.ok:
            return error_response("Failed to fetch Microsoft user info", 401, req)

        graph_user = graph_res.json()
        user = upsert_user(
            provider="microsoft",
            provider_user_id=graph_user["id"],
            email=graph_user.get("mail") or graph_user.get("userPrincipalName", ""),
            name=graph_user.get("displayName", ""),
        )
        token = create_jwt(user["id"], "microsoft", user["email"])
        return json_response({"token": token, "user": user}, req=req)

    except Exception as e:
        logger.error(f"Microsoft auth error: {e}")
        return error_response(str(e), 500, req)
