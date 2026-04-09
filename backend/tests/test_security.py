"""Security tests — verify all fixes from v3.1 audit."""

import os
import pytest


class TestJWTSecurity:
    """JWT_SECRET validation at startup."""

    def test_weak_secret_rejected_in_production(self):
        """S3: Production should refuse to start with default JWT_SECRET."""
        original_env = os.environ.get("ENVIRONMENT")
        original_secret = os.environ.get("JWT_SECRET")
        try:
            os.environ["ENVIRONMENT"] = "production"
            os.environ["JWT_SECRET"] = "dev-secret-change-me"
            # Re-import should raise
            import importlib
            import shared.config as cfg
            with pytest.raises(RuntimeError, match="default value"):
                importlib.reload(cfg)
        finally:
            os.environ["ENVIRONMENT"] = original_env or "development"
            os.environ["JWT_SECRET"] = original_secret or "test-secret-key-at-least-32-characters-long!!"
            import importlib
            import shared.config as cfg
            importlib.reload(cfg)

    def test_short_secret_rejected_in_production(self):
        """S3: Production should refuse JWT_SECRET shorter than 32 chars."""
        original_env = os.environ.get("ENVIRONMENT")
        original_secret = os.environ.get("JWT_SECRET")
        try:
            os.environ["ENVIRONMENT"] = "production"
            os.environ["JWT_SECRET"] = "too-short"
            import importlib
            import shared.config as cfg
            with pytest.raises(RuntimeError, match="too short"):
                importlib.reload(cfg)
        finally:
            os.environ["ENVIRONMENT"] = original_env or "development"
            os.environ["JWT_SECRET"] = original_secret or "test-secret-key-at-least-32-characters-long!!"
            import importlib
            import shared.config as cfg
            importlib.reload(cfg)


class TestAuthEndpoints:
    """Authentication and authorization."""

    def test_no_token_returns_401(self, client):
        endpoints = [
            ("GET", "/api/meetings"),
            ("POST", "/api/meetings"),
            ("GET", "/api/templates"),
            ("GET", "/api/terminology"),
            ("GET", "/api/speech-token"),
            ("GET", "/api/calendar/connections"),
        ]
        for method, path in endpoints:
            res = getattr(client, method.lower())(path)
            assert res.status_code == 401, f"{method} {path} should require auth but got {res.status_code}"

    def test_invalid_token_returns_401(self, client):
        res = client.get("/api/meetings", headers={"Authorization": "Bearer invalid.jwt.token"})
        assert res.status_code == 401

    def test_resource_isolation(self, client, auth_header, auth_header_other):
        """Every resource access must verify ownership."""
        mid = client.post("/api/meetings", json={"title": "Private"}, headers=auth_header).json()["id"]
        # GET
        assert client.get(f"/api/meetings/{mid}", headers=auth_header_other).status_code == 403
        # PATCH
        assert client.patch(f"/api/meetings/{mid}", json={"title": "Hack"}, headers=auth_header_other).status_code == 403
        # DELETE
        assert client.delete(f"/api/meetings/{mid}", headers=auth_header_other).status_code == 403
        # Transcripts
        assert client.post(f"/api/meetings/{mid}/transcripts",
                           json={"segments": [{"text": "x"}]},
                           headers=auth_header_other).status_code == 403


class TestUploadLimits:
    """S6: Upload size limits."""

    def test_upload_rejects_oversized_content_length(self, client, auth_header):
        """Backend must reject uploads > 200MB even if frontend doesn't check."""
        mid = client.post("/api/meetings", json={"title": "Upload Test"}, headers=auth_header).json()["id"]
        res = client.post(
            f"/api/meetings/{mid}/upload?language=zh-TW",
            content=b"small-body",
            headers={**auth_header, "Content-Length": str(300 * 1024 * 1024), "Content-Type": "audio/wav"},
        )
        assert res.status_code == 413


class TestHealthEndpoint:
    """Public endpoints."""

    def test_health_no_auth_needed(self, client):
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
