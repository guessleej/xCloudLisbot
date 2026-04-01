"""Health check and CORS OPTIONS handler."""

from datetime import datetime, timezone
import azure.functions as func
from shared.responses import cors_headers, json_response

bp = func.Blueprint()


@bp.route(route="api/{*path}", methods=["OPTIONS"])
def options_handler(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse("", status_code=204, headers=cors_headers(req))


@bp.route(route="api/health", methods=["GET"])
def health_check(req: func.HttpRequest) -> func.HttpResponse:
    return json_response({
        "status": "healthy",
        "version": "2.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": {"cosmos": "connected", "openai": "connected", "speech": "connected"},
    }, req=req)
