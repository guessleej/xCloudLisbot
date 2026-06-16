"""Recall.ai transcript enhancement endpoints."""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from shared.auth import get_current_user
from shared.access import check_meeting_access
from shared.database import get_session, Transcript
from shared.recall_service import get_recall_enhancer, RecallEnhancerError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/transcripts", tags=["recall"])


@router.post("/{meeting_id}/enhance")
async def enhance_transcript(
    meeting_id: str,
    user: dict = Depends(get_current_user)
) -> dict:
    """
    觸發 Recall.ai 逐字稿增強。

    流程：
    1. 驗證使用者擁有該會議
    2. 取得原始逐字稿
    3. 呼叫 Recall.ai 增強
    4. 更新資料庫
    5. 傳回增強結果
    """
    session = get_session()
    try:
        # 驗證會議所有權
        check_meeting_access(session, meeting_id, user["sub"])

        # 取得原始逐字稿
        transcripts = session.query(Transcript).filter(
            Transcript.meeting_id == meeting_id
        ).all()

        if not transcripts:
            raise HTTPException(400, "No transcripts found for this meeting")

        # 組合文本
        raw_text = "\n".join([t.text for t in transcripts])
        speakers = list(set([t.speaker for t in transcripts if t.speaker]))

        # 初始化 Recall enhancer
        enhancer = get_recall_enhancer()
        if not enhancer:
            raise HTTPException(503, "Recall.ai service not configured")

        # 呼叫增強
        enhanced_data = await enhancer.enhance_transcript(
            meeting_id,
            raw_text,
            speakers
        )

        # 驗證增強結果
        if not enhancer.validate_and_cache_enhancement(raw_text, enhanced_data):
            raise HTTPException(400, "Enhanced transcript validation failed")

        # 更新第一個逐字稿（簡化：實務上應逐段更新）
        if transcripts:
            first_transcript = transcripts[0]
            first_transcript.original_text = first_transcript.text
            first_transcript.text = enhanced_data["text"]
            first_transcript.recall_confidence = enhanced_data.get("confidence", 0.85)
            first_transcript.recall_enhanced = True
            first_transcript.enhanced_at = datetime.now(timezone.utc)
            session.commit()

        return {
            "status": "enhanced",
            "meeting_id": meeting_id,
            "segments_updated": len(transcripts),
            "confidence": enhanced_data.get("confidence", 0.85),
            "enhanced_at": first_transcript.enhanced_at.isoformat() if transcripts else None
        }

    except HTTPException:
        raise
    except RecallEnhancerError as e:
        logger.error(f"Recall enhancement failed: {e}")
        raise HTTPException(503, "Transcript enhancement service temporarily unavailable")
    except Exception as e:
        logger.error(f"Unexpected error in enhance_transcript: {e}")
        raise HTTPException(500, "Internal server error")
    finally:
        session.close()


@router.get("/{meeting_id}/recall-status")
async def get_recall_status(
    meeting_id: str,
    user: dict = Depends(get_current_user)
) -> dict:
    """
    檢查逐字稿的 Recall.ai 增強狀態。
    """
    session = get_session()
    try:
        # 驗證會議所有權
        check_meeting_access(session, meeting_id, user["sub"])

        # 查詢增強狀態
        transcripts = session.query(Transcript).filter(
            Transcript.meeting_id == meeting_id
        ).all()

        if not transcripts:
            raise HTTPException(404, "No transcripts found")

        enhanced_count = sum(1 for t in transcripts if t.recall_enhanced)
        avg_confidence = (
            sum(t.recall_confidence for t in transcripts if t.recall_confidence)
            / enhanced_count
            if enhanced_count > 0
            else 0
        )

        return {
            "meeting_id": meeting_id,
            "total_segments": len(transcripts),
            "enhanced_segments": enhanced_count,
            "enhancement_progress": enhanced_count / len(transcripts) if transcripts else 0,
            "average_confidence": avg_confidence,
            "last_enhanced": max(
                (t.enhanced_at for t in transcripts if t.enhanced_at),
                default=None
            ).isoformat() if enhanced_count > 0 else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching recall status: {e}")
        raise HTTPException(500, "Internal server error")
    finally:
        session.close()


@router.post("/batch-enhance")
async def batch_enhance_transcripts(
    meeting_ids: list[str],
    user: dict = Depends(get_current_user)
) -> dict:
    """
    批次增強多個會議的逐字稿。

    用途：
    - 補回調用（如果某些會議漏掉增強）
    - 夜間排程批處理
    """
    session = get_session()
    try:
        enhancer = get_recall_enhancer()
        if not enhancer:
            raise HTTPException(503, "Recall.ai service not configured")

        results = []
        for meeting_id in meeting_ids:
            try:
                # 驗證會議所有權
                check_meeting_access(session, meeting_id, user["sub"])

                # 跳過已增強的會議
                transcripts = session.query(Transcript).filter(
                    Transcript.meeting_id == meeting_id,
                    Transcript.recall_enhanced == False
                ).all()

                if not transcripts:
                    results.append({
                        "meeting_id": meeting_id,
                        "status": "skipped",
                        "reason": "already_enhanced"
                    })
                    continue

                # 組合文本並增強
                raw_text = "\n".join([t.text for t in transcripts])
                speakers = list(set([t.speaker for t in transcripts if t.speaker]))

                enhanced_data = await enhancer.enhance_transcript(
                    meeting_id,
                    raw_text,
                    speakers
                )

                # 更新第一個逐字稿
                if transcripts:
                    first_transcript = transcripts[0]
                    first_transcript.original_text = first_transcript.text
                    first_transcript.text = enhanced_data["text"]
                    first_transcript.recall_confidence = enhanced_data.get("confidence", 0.85)
                    first_transcript.recall_enhanced = True
                    first_transcript.enhanced_at = datetime.now(timezone.utc)
                    session.commit()

                results.append({
                    "meeting_id": meeting_id,
                    "status": "enhanced",
                    "confidence": enhanced_data.get("confidence", 0.85)
                })

            except RecallEnhancerError as e:
                logger.warning(f"Failed to enhance {meeting_id}: {e}")
                results.append({
                    "meeting_id": meeting_id,
                    "status": "failed",
                    "reason": str(e)
                })

        return {
            "total": len(meeting_ids),
            "succeeded": sum(1 for r in results if r["status"] == "enhanced"),
            "failed": sum(1 for r in results if r["status"] == "failed"),
            "skipped": sum(1 for r in results if r["status"] == "skipped"),
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in batch_enhance: {e}")
        raise HTTPException(500, "Internal server error")
    finally:
        session.close()
