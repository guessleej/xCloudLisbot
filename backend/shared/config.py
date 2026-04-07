"""Lazy-init service clients and app configuration."""

import os
import logging

logger = logging.getLogger(__name__)

# ── Azure OpenAI ──────────────────────────────────────
_openai_client = None


def get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import AzureOpenAI
        _openai_client = AzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_KEY"],
            api_version="2024-02-01",
        )
    return _openai_client


# ── Web PubSub ────────────────────────────────────────
_pubsub_client = None


def get_pubsub_client():
    global _pubsub_client
    if _pubsub_client is None:
        from azure.messaging.webpubsubservice import WebPubSubServiceClient
        from azure.core.credentials import AzureKeyCredential
        _pubsub_client = WebPubSubServiceClient(
            endpoint=os.environ["WEB_PUBSUB_ENDPOINT"],
            hub=os.environ.get("WEB_PUBSUB_HUB", "speech_hub"),
            credential=AzureKeyCredential(os.environ["WEB_PUBSUB_KEY"]),
        )
    return _pubsub_client


# ── Constants ─────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", FRONTEND_URL).split(",")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SPEECH_TIMEOUT = int(os.environ.get("SPEECH_TIMEOUT", "15"))
