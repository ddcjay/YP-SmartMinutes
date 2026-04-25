"""
背景任務處理模組。
使用 asyncio + threading 在背景執行音檔處理流程，
取代原本的 Celery 方案以簡化單機部署架構。
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.meeting import Meeting

logger = logging.getLogger(__name__)

# NOTE: 使用執行緒池處理 IO 密集型或 CPU 密集型任務，避免阻塞 FastAPI 的事件迴圈
_executor = ThreadPoolExecutor(max_workers=2)

# 記憶體中的任務進度快取（個人單機版足夠使用）
_task_progress: dict[str, dict] = {}


def get_progress(meeting_id: str) -> dict:
    """
    取得指定會議的處理進度。先查記憶體快取，若無則查資料庫（支援重新整理或伺服器重啟後恢復狀態）。

    Args:
        meeting_id: 會議 UUID

    Returns:
        包含 status, progress, message 的字典
    """
    if meeting_id in _task_progress:
        return _task_progress[meeting_id]

    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting:
            return {
                "status": meeting.status,
                "progress": meeting.progress,
                "message": meeting.progress_message,
            }
    finally:
        db.close()

    return {
        "status": "unknown",
        "progress": 0,
        "message": "找不到任務",
    }


def _update_progress(meeting_id: str, status: str, progress: int, message: str):
    """
    更新任務進度至記憶體快取與資料庫。

    Args:
        meeting_id: 會議 UUID
        status: 目前狀態
        progress: 百分比 (0-100)
        message: 進度描述文字
    """
    _task_progress[meeting_id] = {
        "status": status,
        "progress": progress,
        "message": message,
    }

    # 同步寫回資料庫，確保重啟後狀態不遺失
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting:
            meeting.status = status
            meeting.progress = progress
            meeting.progress_message = message
            db.commit()
    except Exception as e:
        logger.error(f"Failed to update progress in DB: {e}")
        db.rollback()
    finally:
        db.close()


def _process_meeting_sync(meeting_id: str):
    """
    同步執行會議處理的完整流程（在執行緒池中執行）。
    包含：音訊預處理 → 語音轉錄 → AI 摘要生成。

    Args:
        meeting_id: 會議 UUID
    """
    try:
        # ① 音訊預處理
        _update_progress(meeting_id, "processing", 10, "處理檔案中...")
        from app.services.audio_service import preprocess_audio
        db = SessionLocal()
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            raise ValueError(f"Meeting {meeting_id} not found")

        wav_path = preprocess_audio(meeting.file_path)
        _update_progress(meeting_id, "processing", 20, "音訊預處理完成")

        # ② 語音轉錄（Groq API）
        _update_progress(meeting_id, "transcribing", 30, "轉錄音訊中...")
        from app.services.transcription_service import transcribe_audio
        segments = transcribe_audio(wav_path, meeting_id, db)

        # 更新音檔時長
        if segments:
            meeting.duration = segments[-1].end_time
            db.commit()

        _update_progress(meeting_id, "transcribing", 70, "轉錄完成")

        # NOTE: 若轉錄無結果（靜音或無語音），跳過摘要生成
        if not segments:
            logger.warning(f"No transcription segments for meeting {meeting_id}, skipping summary")
            _update_progress(meeting_id, "completed", 100, "處理完成（未偵測到語音內容）")
            return

        # ③ AI 摘要生成
        _update_progress(meeting_id, "summarizing", 80, "生成摘要中...")
        from app.services.summary_service import generate_summary
        generate_summary(meeting_id, meeting.template_type, db)
        _update_progress(meeting_id, "completed", 100, "處理完成")

    except Exception as e:
        logger.exception(f"Meeting processing failed: {meeting_id}")
        _update_progress(meeting_id, "failed", 0, f"處理失敗: {str(e)}")
    finally:
        db.close()


def start_processing(meeting_id: str):
    """
    將會議處理任務提交到背景執行緒池。

    Args:
        meeting_id: 會議 UUID
    """
    _update_progress(meeting_id, "uploading", 5, "準備處理...")
    _executor.submit(_process_meeting_sync, meeting_id)
