"""Development-only login endpoint (no OAuth required)."""

import logging
import azure.functions as func
from shared.config import ENVIRONMENT
from shared.auth import create_jwt, upsert_user
from shared.responses import json_response, error_response

logger = logging.getLogger(__name__)
bp = func.Blueprint()


@bp.route(route="api/auth/dev-login", methods=["POST"])
def dev_login(req: func.HttpRequest) -> func.HttpResponse:
    if ENVIRONMENT not in ("development", "local"):
        return error_response("Not available in production", 403, req)

    try:
        body = req.get_json()
        email = body.get("email", "dev@localhost")
        name = body.get("name", "Dev User")
        user = upsert_user("local", "dev-user", email, name)
        token = create_jwt(user["id"], "local", user["email"])
        return json_response({"token": token, "user": user}, req=req)
    except Exception as e:
        logger.error(f"Dev login error: {e}")
        return error_response(str(e), 500, req)
