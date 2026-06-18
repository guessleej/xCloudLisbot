"""xCloud Lisbot — FastAPI Backend"""

import logging
import traceback
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from shared.limiter import limiter

from shared.config import ALLOWED_ORIGINS, ENVIRONMENT
from shared.database import init_db

from blueprints.health import router as health_router
from blueprints.auth_dev import router as auth_dev_router
from blueprints.auth_microsoft import router as auth_microsoft_router
from blueprints.auth_google import router as auth_google_router
from blueprints.auth_github import router as auth_github_router
from blueprints.auth_apple import router as auth_apple_router
from blueprints.meetings import router as meetings_router
from blueprints.speech import router as speech_router
from blueprints.summarize import router as summarize_router
from blueprints.terminology import router as terminology_router
from blueprints.templates import router as templates_router
from blueprints.upload import router as upload_router
from blueprints.share import router as share_router
from blueprints.calendar_bp import router as calendar_router
from blueprints.calendar_v2 import router as calendar_v2_router
from blueprints.for_you import router as for_you_router
from blueprints.coaching import router as coaching_router
from blueprints.analytics import router as analytics_router
from blueprints.recommendations import router as recommendations_router
from blueprints.users import router as users_router
from blueprints.copilot import router as copilot_router
from blueprints.billing import router as billing_router
from blueprints.storage_auth import router as storage_auth_router
from blueprints.recall import router as recall_router

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _log.info("Database initialized")
    yield


app = FastAPI(title="xCloud Lisbot API", version="2.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── TrustedHostMiddleware (production only) ───────────────────────────────────
import os as _os
_allowed_hosts = [h.strip() for h in _os.environ.get("ALLOWED_HOSTS", "").split(",") if h.strip()]
if ENVIRONMENT == "production" and _allowed_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=_allowed_hosts)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request ID middleware ─────────────────────────────────────────────────────
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# ── Security headers middleware ───────────────────────────────────────────────
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "-")
    _log.error(
        "Unhandled %s %s (request_id=%s client=%s): %s\n%s",
        request.method, request.url.path, request_id,
        getattr(request.client, "host", "unknown"),
        exc, traceback.format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
        headers={"X-Request-ID": request_id},
    )


app.include_router(health_router)
if ENVIRONMENT in ("development", "local", "dev"):
    app.include_router(auth_dev_router)
app.include_router(auth_microsoft_router)
app.include_router(auth_google_router)
app.include_router(auth_github_router)
app.include_router(auth_apple_router)
app.include_router(meetings_router)
app.include_router(speech_router)
app.include_router(summarize_router)
app.include_router(terminology_router)
app.include_router(templates_router)
app.include_router(upload_router)
app.include_router(share_router)
app.include_router(calendar_router)
app.include_router(calendar_v2_router)
app.include_router(for_you_router)
app.include_router(coaching_router)
app.include_router(analytics_router)
app.include_router(recommendations_router)
app.include_router(users_router)
app.include_router(copilot_router)
app.include_router(billing_router)
app.include_router(storage_auth_router)
app.include_router(recall_router)
