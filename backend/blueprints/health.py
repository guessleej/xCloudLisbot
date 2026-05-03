"""XMeet AI — Health check and frontend error reporting."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from sqlalchemy import text

from shared.config import (
    AZURE_OPENAI_ENDPOINT,
    AZURE_STORAGE_CONNECTION_STRING,
    ENVIRONMENT,
    SPEECH_KEY,
    WEB_PUBSUB_ENDPOINT,
)
from shared.database import AsyncSessionLocal
from shared.responses import ok

router = APIRouter(prefix="/api", tags=["health"])
_log = logging.getLogger(__name__)


async def _probe_db() -> dict:
    import time
    try:
        t0 = time.perf_counter()
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        return {"status": "ok", "latency_ms": latency_ms}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:120]}


@router.get("/health")
async def health_check():
    db = await _probe_db()

    deps = {
        "database":    db,
        "azure_speech":   {"status": "ok" if SPEECH_KEY else "not_configured"},
        "azure_openai":   {"status": "ok" if AZURE_OPENAI_ENDPOINT else "not_configured"},
        "azure_storage":  {"status": "ok" if AZURE_STORAGE_CONNECTION_STRING else "not_configured"},
        "azure_pubsub":   {"status": "ok" if WEB_PUBSUB_ENDPOINT else "not_configured"},
    }

    overall = "ok" if db["status"] == "ok" else "degraded"

    return ok({
        "status":      overall,
        "environment": ENVIRONMENT,
        "timestamp":   datetime.now(timezone.utc).isoformat(),
        "dependencies": deps,
    })


@router.post("/errors")
async def report_frontend_error(request: Request):
    """Receive structured error reports from the frontend ErrorBoundary."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    _log.warning(
        "[FrontendError] type=%s message=%s ts=%s stack=%s",
        body.get("type", "unknown"),
        body.get("message", ""),
        body.get("ts", ""),
        (body.get("stack") or "")[:300],
    )
    return ok({"received": True})
