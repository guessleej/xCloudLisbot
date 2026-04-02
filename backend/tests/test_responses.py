"""Tests for FastAPI app loading and health endpoint."""

from fastapi.testclient import TestClient


def test_health_endpoint():
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from main import app
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["version"] == "2.0.0"


def test_dev_login():
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    os.environ["ENVIRONMENT"] = "development"
    from main import app
    client = TestClient(app)
    resp = client.post("/api/auth/dev-login", json={"email": "test@dev.com", "name": "Tester"})
    # Will fail on Cosmos connection, but should not be 404 or 405
    assert resp.status_code != 404
    assert resp.status_code != 405
