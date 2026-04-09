"""Test fixtures for backend tests."""

import os
import sys
import pytest

# Ensure the backend directory is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set required env vars BEFORE importing any modules
os.environ["JWT_SECRET"] = "test-secret-key-at-least-32-characters-long!!"
os.environ["FRONTEND_URL"] = "http://localhost:3000"
os.environ["BACKEND_URL"] = "http://localhost:8000"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000"
os.environ["ENVIRONMENT"] = "development"
os.environ["SPEECH_TIMEOUT"] = "15"
os.environ["SPEECH_KEY"] = "fake-speech-key"
os.environ["SPEECH_REGION"] = "eastasia"
os.environ["AZURE_OPENAI_ENDPOINT"] = "https://fake.openai.azure.com"
os.environ["AZURE_OPENAI_KEY"] = "fake-openai-key"
os.environ["AZURE_STORAGE_CONNECTION_STRING"] = "DefaultEndpointsProtocol=https;AccountName=fake;AccountKey=ZmFrZQ==;EndpointSuffix=core.windows.net"

# Override DB engine BEFORE any app imports
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import shared.database as db_mod

# StaticPool ensures all connections share the same in-memory database
_test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
db_mod._engine = _test_engine
db_mod._SessionLocal = sessionmaker(bind=_test_engine)
db_mod.Base.metadata.create_all(bind=_test_engine)

from fastapi.testclient import TestClient
from shared.auth import create_jwt


@pytest.fixture(autouse=True)
def reset_db():
    """Reset all tables before each test for isolation."""
    db_mod.Base.metadata.drop_all(bind=_test_engine)
    db_mod.Base.metadata.create_all(bind=_test_engine)
    yield


@pytest.fixture
def app():
    from main import app as fastapi_app
    return fastapi_app


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth_header():
    token = create_jwt("local_test-user", "local", "test@example.com")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_header_other():
    token = create_jwt("local_other-user", "local", "other@example.com")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_user():
    return {
        "id": "local_test-user",
        "email": "test@example.com",
        "name": "Test User",
        "provider": "local",
    }
