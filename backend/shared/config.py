"""
Lazy-init Azure service clients.
Each client is created on first use so missing env vars only fail
when the related endpoint is actually called.
"""

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


# ── Cosmos DB ─────────────────────────────────────────
_cosmos_db = None


def _get_db():
    global _cosmos_db
    if _cosmos_db is None:
        from azure.cosmos import CosmosClient
        client = CosmosClient(
            url=os.environ["COSMOS_ENDPOINT"],
            credential=os.environ["COSMOS_KEY"],
        )
        _cosmos_db = client.get_database_client(os.environ.get("COSMOS_DATABASE", "lisbot"))
    return _cosmos_db


def get_container(name: str):
    return _get_db().get_container_client(name)


# Convenience accessors
def users_container():
    return get_container("users")

def meetings_container():
    return get_container("meetings")

def transcripts_container():
    return get_container("transcripts")

def summaries_container():
    return get_container("summaries")

def terminology_container():
    return get_container("terminology")

def templates_container():
    return get_container("templates")

def shares_container():
    return get_container("shares")

def calendar_tokens_container():
    return get_container("calendar_tokens")


# ── Web PubSub ────────────────────────────────────────
def get_pubsub_client():
    from azure.messaging.webpubsubservice import WebPubSubServiceClient
    return WebPubSubServiceClient(
        endpoint=os.environ["WEB_PUBSUB_ENDPOINT"],
        hub=os.environ.get("WEB_PUBSUB_HUB", "speech_hub"),
        credential=os.environ["WEB_PUBSUB_KEY"],
    )


# ── Constants ─────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
SPEECH_TIMEOUT = int(os.environ.get("SPEECH_TIMEOUT", "15"))
