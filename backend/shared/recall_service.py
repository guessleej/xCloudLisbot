"""Recall.ai service wrapper for transcript enhancement."""

import logging
import asyncio
import httpx
from typing import Optional
from datetime import datetime, timezone

from shared.config import get_recall_api_key, RECALL_REGION

logger = logging.getLogger(__name__)


class RecallEnhancerError(Exception):
    """Base exception for Recall.ai operations."""
    pass


class RecallRateLimitError(RecallEnhancerError):
    """Raised when rate limited by Recall.ai."""
    pass


class RecallAuthError(RecallEnhancerError):
    """Raised when authentication fails."""
    pass


class RecallEnhancer:
    """Wrapper for Recall.ai transcript enhancement API."""

    # 重試配置
    MAX_RETRIES = 3
    INITIAL_BACKOFF = 1  # seconds
    MAX_BACKOFF = 32  # seconds

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

    async def _exponential_backoff(self, attempt: int, retry_after: int = 0) -> None:
        """
        計算指數退避時間並等待。

        Args:
            attempt: 當前重試次數（0-based）
            retry_after: 伺服器指定的等待秒數（來自 Retry-After header）
        """
        if retry_after > 0:
            wait_time = retry_after
        else:
            wait_time = min(
                self.INITIAL_BACKOFF * (2 ** attempt),
                self.MAX_BACKOFF
            )

        logger.warning(f"Backing off for {wait_time}s before retry attempt {attempt + 1}")
        await asyncio.sleep(wait_time)

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
        呼叫 Recall.ai 增強逐字稿，支持重試和指數退避。

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

        last_error = None
        for attempt in range(self.MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{self.base_url}/transcript/",
                        json=payload,
                        headers=self.headers
                    )

                    # 成功
                    if response.status_code == 200:
                        data = response.json()
                        return {
                            "text": data.get("transcript", raw_transcript),
                            "confidence": data.get("confidence", 0.85),
                            "speaker_segments": data.get("speaker_segments", []),
                            "enhanced": True
                        }

                    # 認證失敗 — 不重試
                    if response.status_code == 401:
                        raise RecallAuthError("Invalid or expired Recall API key")

                    # 限速 — 重試
                    if response.status_code == 429:
                        retry_after = int(response.headers.get("Retry-After", 0))
                        if attempt < self.MAX_RETRIES - 1:
                            await self._exponential_backoff(attempt, retry_after)
                            continue
                        else:
                            raise RecallRateLimitError("Rate limit exceeded, max retries reached")

                    # 臨時服務不可用（503, 507） — 重試
                    if response.status_code in (503, 507):
                        if attempt < self.MAX_RETRIES - 1:
                            await self._exponential_backoff(attempt)
                            continue
                        else:
                            raise RecallEnhancerError(f"Service unavailable after {self.MAX_RETRIES} retries")

                    # 其他 4xx/5xx 錯誤 — 不重試
                    if response.status_code >= 400:
                        raise RecallEnhancerError(f"API error: {response.status_code} {response.text}")

            except RecallAuthError:
                raise  # 認證失敗，不重試
            except RecallRateLimitError:
                raise  # 限速已充分重試
            except httpx.HTTPError as e:
                last_error = e
                if attempt < self.MAX_RETRIES - 1:
                    await self._exponential_backoff(attempt)
                    continue
                else:
                    raise RecallEnhancerError(f"HTTP request failed after {self.MAX_RETRIES} retries: {e}")
            except Exception as e:
                last_error = e
                raise RecallEnhancerError(f"Unexpected error during enhancement: {e}")

        raise RecallEnhancerError(f"Enhancement failed after {self.MAX_RETRIES} retries: {last_error}")

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
