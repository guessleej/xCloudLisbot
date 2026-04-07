"""Speech token endpoint — frontend connects to Azure Speech directly."""

import os
import logging

import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException

from shared.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/speech-token")
async def get_speech_token(user: dict = Depends(get_current_user)):
    """Issue a short-lived Azure Speech token for browser-side recognition.
    Frontend uses microsoft-cognitiveservices-speech-sdk to connect directly.
    Token expires in 10 minutes."""
    speech_key = os.environ.get("SPEECH_KEY", "")
    speech_region = os.environ.get("SPEECH_REGION", "eastasia")

    token_url = f"https://{speech_region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    resp = http_requests.post(token_url, headers={
        "Ocp-Apim-Subscription-Key": speech_key,
        "Content-Type": "application/x-www-form-urlencoded",
    }, timeout=10)

    if not resp.ok:
        logger.error(f"Speech token error: {resp.status_code} {resp.text}")
        raise HTTPException(502, "Failed to get speech token")

    return {"token": resp.text, "region": speech_region}
