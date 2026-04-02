"""xCloudLisbot — FastAPI Backend"""

import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from shared.config import ALLOWED_ORIGINS
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

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logging.info("Database initialized")
    yield


app = FastAPI(title="xCloudLisbot API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"Unhandled: {exc}\n{traceback.format_exc()}")
    return JSONResponse(status_code=500, content={"error": str(exc)})


app.include_router(health_router)
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
