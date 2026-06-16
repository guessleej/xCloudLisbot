"""xCloud Lisbot — Unified response format."""

from fastapi.responses import JSONResponse


def ok(data=None) -> dict:
    """Success response: {"success": True, "data": data}."""
    return {"success": True, "data": data}


def error(msg: str, status: int = 400) -> JSONResponse:
    """Error response as JSONResponse: {"success": False, "error": msg}."""
    return JSONResponse(
        status_code=status,
        content={"success": False, "error": msg},
    )
