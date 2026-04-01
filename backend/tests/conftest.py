"""Test fixtures for backend tests."""

import os
import sys
import pytest

# Ensure the backend directory is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set required env vars before importing any modules
os.environ.setdefault("JWT_SECRET", "test-secret-key-at-least-32-characters-long")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SPEECH_TIMEOUT", "15")


@pytest.fixture
def jwt_secret():
    return os.environ["JWT_SECRET"]


@pytest.fixture
def sample_user():
    return {
        "id": "local_test-user",
        "email": "test@example.com",
        "name": "Test User",
        "provider": "local",
    }
