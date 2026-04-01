"""HTTP response helpers with CORS."""

import json
import azure.functions as func
from shared.config import ALLOWED_ORIGINS


def cors_headers(req: func.HttpRequest) -> dict:
    origin = req.headers.get("Origin", "")
    allowed = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Credentials": "true",
    }


def json_response(data: dict, status: int = 200, req: func.HttpRequest = None) -> func.HttpResponse:
    headers = cors_headers(req) if req else {}
    return func.HttpResponse(
        json.dumps(data, ensure_ascii=False),
        mimetype="application/json",
        status_code=status,
        headers=headers,
    )


def error_response(message: str, status: int = 400, req: func.HttpRequest = None) -> func.HttpResponse:
    return json_response({"error": message}, status, req)
