"""xCloud Lisbot — Configuration (reads from environment variables)."""

import os

# ── General ──────────────────────────────────────────────────────────────────
ENVIRONMENT: str = os.environ.get("ENVIRONMENT", "development")

# Dev-login (POST /api/auth/dev/login) is a credential-free login for LOCAL dev.
# Gate it behind its OWN flag, NOT ENVIRONMENT — a cloud test environment that runs
# ENVIRONMENT=development must NOT expose this account-takeover endpoint. Off unless
# explicitly enabled (local devs set ENABLE_DEV_LOGIN=true in their .env).
ENABLE_DEV_LOGIN: bool = os.environ.get("ENABLE_DEV_LOGIN", "false").lower() == "true"

JWT_SECRET: str = os.environ.get(
    "JWT_SECRET", "dev-secret-change-in-production-32ch"
)

# Validate secret length in production
if ENVIRONMENT == "production" and len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET must be at least 32 characters in production environment"
    )

# ── Database ─────────────────────────────────────────────────────────────────
PG_HOST: str = os.environ.get("PG_HOST", "localhost")
PG_PORT: int = int(os.environ.get("PG_PORT", "5432"))
PG_DATABASE: str = os.environ.get("PG_DATABASE", "lisbot")
PG_USER: str = os.environ.get("PG_USER", "lisbot")
PG_PASSWORD: str = os.environ.get("PG_PASSWORD", "lisbot")
PG_SSL: str = os.environ.get("PG_SSL", "disable")

# ── Azure OpenAI ──────────────────────────────────────────────────────────────
AZURE_OPENAI_ENDPOINT: str = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_KEY: str = os.environ.get("AZURE_OPENAI_KEY", "")
AZURE_OPENAI_DEPLOYMENT: str = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4")

# ── Azure Speech ──────────────────────────────────────────────────────────────
SPEECH_KEY: str = os.environ.get("SPEECH_KEY", "")
SPEECH_REGION: str = os.environ.get("SPEECH_REGION", "eastasia")

# ── Azure Storage ─────────────────────────────────────────────────────────────
AZURE_STORAGE_CONNECTION_STRING: str = os.environ.get(
    "AZURE_STORAGE_CONNECTION_STRING", ""
)
STORAGE_CONTAINER: str = os.environ.get("STORAGE_CONTAINER", "audio-recordings")

# ── Azure Web PubSub ──────────────────────────────────────────────────────────
WEB_PUBSUB_ENDPOINT: str = os.environ.get("WEB_PUBSUB_ENDPOINT", "")
WEB_PUBSUB_KEY: str = os.environ.get("WEB_PUBSUB_KEY", "")
WEB_PUBSUB_HUB: str = os.environ.get("WEB_PUBSUB_HUB", "speech_hub")

# ── OAuth providers ───────────────────────────────────────────────────────────
MICROSOFT_CLIENT_ID: str = os.environ.get("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET: str = os.environ.get("MICROSOFT_CLIENT_SECRET", "")

GOOGLE_CLIENT_ID: str = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = os.environ.get("GOOGLE_CLIENT_SECRET", "")

GITHUB_CLIENT_ID: str = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET: str = os.environ.get("GITHUB_CLIENT_SECRET", "")

# ── Microsoft Graph (Email / ACS) ────────────────────────────────────────────
# Used by shared/email.py for sending meeting invitations via MS Graph or ACS.
GRAPH_TENANT_ID:     str = os.environ.get("GRAPH_TENANT_ID", "")
GRAPH_CLIENT_ID:     str = os.environ.get("GRAPH_CLIENT_ID", "")
GRAPH_CLIENT_SECRET: str = os.environ.get("GRAPH_CLIENT_SECRET", "")

ACS_CONNECTION_STRING: str = os.environ.get("ACS_CONNECTION_STRING", "")
ACS_SENDER_EMAIL:      str = os.environ.get("ACS_SENDER_EMAIL", "")

# ── Calendar token encryption ────────────────────────────────────────────────
# Set to a Fernet key (base64, 44 chars).  Generate with:
#   python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Leave blank in development — tokens stored as plaintext with a warning.
CALENDAR_TOKEN_ENCRYPTION_KEY: str = os.environ.get("CALENDAR_TOKEN_ENCRYPTION_KEY", "")

if ENVIRONMENT == "production" and not CALENDAR_TOKEN_ENCRYPTION_KEY:
    raise RuntimeError(
        "CALENDAR_TOKEN_ENCRYPTION_KEY must be set in production. "
        "Generate with: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    )

# ── Recall.ai (meeting-bot recording + transcription) ────────────────────────
# Recall.ai sends a bot to join Zoom / Google Meet / Microsoft Teams calls,
# records them, and returns transcripts. The API key authenticates REST calls;
# the webhook secret (whsec_...) verifies inbound bot.* event signatures.
RECALL_API_KEY: str = os.environ.get("RECALL_API_KEY", "")
RECALL_REGION: str = os.environ.get("RECALL_REGION", "us-west-2")
RECALL_WEBHOOK_SECRET: str = os.environ.get("RECALL_WEBHOOK_SECRET", "")
RECALL_API_BASE: str = f"https://{RECALL_REGION}.recall.ai/api/v1"
# Calendar V2 lives under /api/v2 (calendars, calendar-events, scheduled bots).
RECALL_API_BASE_V2: str = f"https://{RECALL_REGION}.recall.ai/api/v2"

# ── Backend public URL (used for OAuth callbacks) ────────────────────────────
BACKEND_URL: str = os.environ.get("BACKEND_URL", "http://localhost:8000")

if ENVIRONMENT == "production" and BACKEND_URL.startswith("http://localhost"):
    raise RuntimeError(
        "BACKEND_URL must be set to the public HTTPS URL in production "
        "(e.g. https://api.xcloud-lisbot). Current value points to localhost."
    )

# ── CORS / Frontend ───────────────────────────────────────────────────────────
FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:3000")

_raw_origins: str = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]
