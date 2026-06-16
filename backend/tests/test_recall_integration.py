"""Tests for Recall.ai integration."""

import pytest
import os
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from shared.database import get_session, Meeting, Transcript, User
from shared.auth import create_jwt
import uuid
from datetime import datetime, timezone


@pytest.fixture(autouse=True)
def clean_env():
    """Clean up environment variables before each test."""
    old_recall_key = os.environ.pop("RECALL_API_KEY", None)
    old_recall_region = os.environ.pop("RECALL_REGION", None)
    yield
    # Restore
    if old_recall_key is not None:
        os.environ["RECALL_API_KEY"] = old_recall_key
    if old_recall_region is not None:
        os.environ["RECALL_REGION"] = old_recall_region


@pytest.fixture
def sample_meeting(sample_user):
    """Create a sample meeting with transcripts for testing."""
    session = get_session()

    # Create user if not exists
    user = session.query(User).filter(User.id == sample_user["id"]).first()
    if not user:
        user = User(
            id=sample_user["id"],
            email=sample_user["email"],
            name=sample_user["name"],
            provider=sample_user["provider"]
        )
        session.add(user)

    # Create meeting
    meeting_id = str(uuid.uuid4())
    meeting = Meeting(
        id=meeting_id,
        user_id=sample_user["id"],
        title="Test Meeting",
        mode="teams",
        language="zh-TW",
        status="completed"
    )
    session.add(meeting)

    # Create transcripts
    for i in range(3):
        transcript = Transcript(
            id=str(uuid.uuid4()),
            meeting_id=meeting_id,
            speaker=f"Speaker {i % 2}",
            text=f"This is transcript segment {i}.",
            offset=i * 10,
            duration=10,
            confidence=0.95
        )
        session.add(transcript)

    session.commit()
    session.close()

    return meeting_id


class TestRecallEnhancer:
    """Tests for RecallEnhancer service class."""

    @pytest.mark.asyncio
    async def test_health_check_success(self):
        """Test successful health check with valid API key."""
        os.environ["RECALL_API_KEY"] = "test-api-key"
        os.environ["RECALL_REGION"] = "us-west-2"

        from shared.recall_service import RecallEnhancer

        enhancer = RecallEnhancer()

        with patch("shared.recall_service.httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.status_code = 200
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

            result = await enhancer.health_check()
            assert result is True

    @pytest.mark.asyncio
    async def test_enhance_transcript_success(self):
        """Test successful transcript enhancement."""
        os.environ["RECALL_API_KEY"] = "test-api-key"
        os.environ["RECALL_REGION"] = "us-west-2"

        from shared.recall_service import RecallEnhancer

        enhancer = RecallEnhancer()

        with patch("shared.recall_service.httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.status_code = 200
            mock_response.json = AsyncMock(return_value={
                "transcript": "Enhanced: This is a corrected transcript.",
                "confidence": 0.92,
                "speaker_segments": []
            })
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

            result = await enhancer.enhance_transcript(
                "meeting-123",
                "Original transcript",
                ["Speaker 1", "Speaker 2"]
            )

            assert result["text"] == "Enhanced: This is a corrected transcript."
            assert result["confidence"] == 0.92
            assert result["enhanced"] is True

    def test_validate_enhancement_success(self):
        """Test enhancement validation with valid data."""
        os.environ["RECALL_API_KEY"] = "test-api-key"

        from shared.recall_service import RecallEnhancer

        enhancer = RecallEnhancer()

        enhanced_data = {
            "text": "Valid enhanced text",
            "confidence": 0.85,
            "speaker_segments": []
        }

        result = enhancer.validate_and_cache_enhancement("original text", enhanced_data)
        assert result is True

    def test_validate_enhancement_empty_text(self):
        """Test enhancement validation fails with empty text."""
        os.environ["RECALL_API_KEY"] = "test-api-key"

        from shared.recall_service import RecallEnhancer

        enhancer = RecallEnhancer()

        enhanced_data = {
            "text": "",
            "confidence": 0.85
        }

        result = enhancer.validate_and_cache_enhancement("original text", enhanced_data)
        assert result is False


class TestRecallEndpoints:
    """Tests for Recall.ai API endpoints."""

    def test_enhance_endpoint_no_api_key(self, client, auth_header, sample_meeting):
        """Test enhance endpoint when API key is not configured."""
        # Ensure no API key
        os.environ.pop("RECALL_API_KEY", None)

        response = client.post(
            f"/api/transcripts/{sample_meeting}/enhance",
            headers=auth_header
        )

        assert response.status_code == 503
        assert "not configured" in response.json()["detail"].lower()

    def test_enhance_endpoint_unauthorized(self, client, auth_header_other, sample_meeting):
        """Test enhance endpoint with unauthorized user."""
        os.environ["RECALL_API_KEY"] = "test-api-key"

        # Try to enhance meeting owned by another user
        response = client.post(
            f"/api/transcripts/{sample_meeting}/enhance",
            headers=auth_header_other
        )

        assert response.status_code == 403

    def test_recall_status_endpoint(self, client, auth_header, sample_meeting):
        """Test recall status endpoint returns correct structure."""
        response = client.get(
            f"/api/transcripts/{sample_meeting}/recall-status",
            headers=auth_header
        )

        assert response.status_code == 200
        data = response.json()
        assert "meeting_id" in data
        assert "total_segments" in data
        assert "enhanced_segments" in data
        assert "enhancement_progress" in data
        assert "average_confidence" in data
        assert data["meeting_id"] == sample_meeting
        assert data["total_segments"] == 3
        assert data["enhanced_segments"] == 0

    def test_batch_enhance_endpoint_structure(self, client, auth_header, sample_meeting):
        """Test batch enhance endpoint returns correct structure."""
        os.environ["RECALL_API_KEY"] = "test-api-key"

        response = client.post(
            "/api/transcripts/batch-enhance",
            headers=auth_header,
            json={"meeting_ids": [sample_meeting]}
        )

        # Batch endpoint returns 200 even with failures, includes summary
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "succeeded" in data
        assert "failed" in data
        assert "skipped" in data
        assert "results" in data

    def test_enhance_endpoint_no_transcripts(self, client, auth_header):
        """Test enhance endpoint with meeting that has no transcripts."""
        os.environ["RECALL_API_KEY"] = "test-api-key"

        # Create a meeting without transcripts
        session = get_session()
        user_id = "local_test-user"
        meeting_id = str(uuid.uuid4())
        meeting = Meeting(
            id=meeting_id,
            user_id=user_id,
            title="Empty Meeting"
        )
        session.add(meeting)
        session.commit()
        session.close()

        response = client.post(
            f"/api/transcripts/{meeting_id}/enhance",
            headers=auth_header
        )

        assert response.status_code == 400
        assert "No transcripts" in response.json()["detail"]


class TestRecallErrorHandling:
    """Tests for Recall.ai error handling."""

    @pytest.mark.asyncio
    async def test_enhance_with_invalid_api_key(self):
        """Test enhancement with invalid API key."""
        os.environ["RECALL_API_KEY"] = "invalid-key"

        from shared.recall_service import RecallEnhancer, RecallEnhancerError

        enhancer = RecallEnhancer()

        with patch("shared.recall_service.httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.status_code = 401
            mock_response.json = AsyncMock(return_value={"detail": "Invalid API token"})
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

            with pytest.raises(RecallEnhancerError, match="Invalid or expired"):
                await enhancer.enhance_transcript(
                    "meeting-123",
                    "transcript",
                    ["Speaker 1"]
                )

    @pytest.mark.asyncio
    async def test_enhance_with_rate_limit(self):
        """Test enhancement when rate limited."""
        os.environ["RECALL_API_KEY"] = "test-key"

        from shared.recall_service import RecallEnhancer, RecallRateLimitError

        enhancer = RecallEnhancer()

        with patch("shared.recall_service.httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.status_code = 429
            mock_response.headers = {"Retry-After": "1"}
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

            with patch("shared.recall_service.asyncio.sleep", new_callable=AsyncMock):
                with pytest.raises(RecallRateLimitError):
                    await enhancer.enhance_transcript(
                        "meeting-123",
                        "transcript",
                        ["Speaker 1"]
                    )

    @pytest.mark.asyncio
    async def test_enhance_with_retry_on_503(self):
        """Test enhancement retries on 503 service unavailable."""
        os.environ["RECALL_API_KEY"] = "test-key"

        from shared.recall_service import RecallEnhancer

        enhancer = RecallEnhancer()

        with patch("shared.recall_service.httpx.AsyncClient") as mock_client:
            # 第一次返回 503，第二次成功
            mock_response_503 = AsyncMock()
            mock_response_503.status_code = 503
            mock_response_200 = AsyncMock()
            mock_response_200.status_code = 200
            mock_response_200.json = AsyncMock(return_value={
                "transcript": "Enhanced text",
                "confidence": 0.90
            })

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                side_effect=[mock_response_503, mock_response_200]
            )

            with patch("shared.recall_service.asyncio.sleep", new_callable=AsyncMock):
                result = await enhancer.enhance_transcript(
                    "meeting-123",
                    "transcript",
                    ["Speaker 1"]
                )

                assert result["text"] == "Enhanced text"
                assert result["confidence"] == 0.90

    def test_batch_enhance_error_handling(self, client, auth_header, sample_meeting):
        """Test batch enhance handles per-meeting errors gracefully."""
        os.environ["RECALL_API_KEY"] = "test-key"

        response = client.post(
            "/api/transcripts/batch-enhance",
            headers=auth_header,
            json={"meeting_ids": [sample_meeting, "nonexistent-id"]}
        )

        # Batch endpoint returns 200 with partial results
        assert response.status_code == 200
        data = response.json()
        # one exists, one fails
        assert data["total"] == 2
        assert data["failed"] > 0 or data["succeeded"] > 0

    def test_get_recall_enhancer_no_key(self):
        """Test get_recall_enhancer returns None when API key not configured."""
        os.environ.pop("RECALL_API_KEY", None)

        from shared.recall_service import get_recall_enhancer

        result = get_recall_enhancer()
        assert result is None
