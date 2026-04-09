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


# ── Blob Storage ─────────────────────────────────────
_blob_container_client = None


def get_blob_container_client():
    global _blob_container_client
    if _blob_container_client is None:
        from azure.storage.blob import BlobServiceClient
        svc = BlobServiceClient.from_connection_string(os.environ["AZURE_STORAGE_CONNECTION_STRING"])
        _blob_container_client = svc.get_container_client(
            os.environ.get("STORAGE_CONTAINER", "audio-recordings")
        )
    return _blob_container_client


# ── Constants ─────────────────────────────────────────
ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", FRONTEND_URL).split(",")

# JWT secret validation — refuse to start in production with weak/default secret
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
if ENVIRONMENT not in ("development", "local", "dev"):
    if JWT_SECRET == "dev-secret-change-me":
        raise RuntimeError("FATAL: JWT_SECRET is using the default value in non-dev environment. Set a strong secret (>= 32 chars).")
    if len(JWT_SECRET) < 32:
        raise RuntimeError(f"FATAL: JWT_SECRET is too short ({len(JWT_SECRET)} chars). Minimum 32 characters required.")
SPEECH_TIMEOUT = int(os.environ.get("SPEECH_TIMEOUT", "15"))
