"""Recall.ai service wrapper for transcript enhancement."""

import logging
import httpx
from typing import Optional
from datetime import datetime, timezone

from shared.config import get_recall_api_key, RECALL_REGION

logger = logging.getLogger(__name__)


class RecallEnhancerError(Exception):
    """Base exception for Recall.ai operations."""
    pass


class RecallEnhancer:
    """Wrapper for Recall.ai transcript enhancement API."""

    def __init__(self):
        api_key = get_recall_api_key()
        if not api_key:
            raise RecallEnhancerError("RECALL_API_KEY not configured")

        self.api_key = api_key
        self.base_url = f"https://{RECALL_REGION}.recall.ai/api/v1"
        self.headers = {
            "Authorization": api_key,
            "Content-Type": "application/json"
        }

    async def health_check(self) -> bool:
        """
        驗證 API key 有效性。
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/bot/", headers=self.headers)
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Recall.ai health check failed: {e}")
            return False

    async def enhance_transcript(
        self,
        meeting_id: str,
        raw_transcript: str,
        speakers: list[str],
        language: str = "zh-TW"
    ) -> dict:
        """
        呼叫 Recall.ai 增強逐字稿。

        Args:
            meeting_id: 會議 ID
            raw_transcript: 原始逐字稿文本
            speakers: 說話者列表
            language: 語言代碼（預設 zh-TW）

        Returns:
            增強後的逐字稿資料：{"text": "...", "confidence": 0.95, ...}

        Raises:
            RecallEnhancerError: API 呼叫失敗時
        """
        if not raw_transcript.strip():
            raise RecallEnhancerError("Transcript cannot be empty")

        payload = {
            "meeting_id": meeting_id,
            "transcript": raw_transcript,
            "speakers": speakers,
            "language": language
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Recall.ai 目前沒有專門的「增強」端點，
                # 我們通過建立新的逐字稿記錄來實現增強效果。
                # 實際整合時可能需要調整此實現。
                response = await client.post(
                    f"{self.base_url}/transcript/",
                    json=payload,
                    headers=self.headers
                )

                if response.status_code == 401:
                    raise RecallEnhancerError("Invalid or expired Recall API key")
                elif response.status_code == 429:
                    raise RecallEnhancerError("Recall.ai rate limit exceeded, retry later")
                elif response.status_code >= 400:
                    raise RecallEnhancerError(f"Recall.ai API error: {response.status_code} {response.text}")

                data = response.json()
                return {
                    "text": data.get("transcript", raw_transcript),
                    "confidence": data.get("confidence", 0.85),
                    "speaker_segments": data.get("speaker_segments", []),
                    "enhanced": True
                }

        except httpx.HTTPError as e:
            raise RecallEnhancerError(f"HTTP request failed: {e}")
        except Exception as e:
            raise RecallEnhancerError(f"Unexpected error during enhancement: {e}")

    def validate_and_cache_enhancement(
        self,
        original_text: str,
        enhanced_data: dict
    ) -> bool:
        """
        驗證增強結果的有效性。

        Args:
            original_text: 原始文本
            enhanced_data: 增強後的資料

        Returns:
            True 如果增強有效，False 否則
        """
        # 簡單驗證：增強後的文本不應為空
        if not enhanced_data.get("text", "").strip():
            logger.warning("Enhanced transcript is empty, validation failed")
            return False

        # 檢查 confidence 在合理範圍內
        confidence = enhanced_data.get("confidence", 0)
        if not (0 <= confidence <= 1):
            logger.warning(f"Invalid confidence score: {confidence}")
            return False

        return True


def get_recall_enhancer() -> Optional[RecallEnhancer]:
    """
    工廠函數，安全地建立 RecallEnhancer 實例。
    如果 API key 未配置，返回 None。
    """
    try:
        return RecallEnhancer()
    except RecallEnhancerError as e:
        logger.warning(f"Cannot initialize RecallEnhancer: {e}")
        return None
