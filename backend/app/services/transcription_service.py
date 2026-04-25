"""
語音轉文字服務。
使用 Faster-Whisper 進行本地 ASR 轉錄，完全免費且資料不出境。
"""
import logging
from sqlalchemy.orm import Session

from app.config import settings
from app.models.meeting import Transcript

logger = logging.getLogger(__name__)

# NOTE: 模型在首次使用時才載入，避免啟動時消耗過多記憶體
_model = None


def _get_model():
    """
    惰性載入 Faster-Whisper 模型（僅在第一次呼叫時初始化）。

    Returns:
        WhisperModel 實例
    """
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        logger.info(f"Loading Faster-Whisper model: {settings.whisper_model} on {settings.whisper_device}")
        compute_type = "float16" if settings.whisper_device == "cuda" else "int8"
        _model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=compute_type,
        )
        logger.info("Faster-Whisper model loaded successfully")
    return _model


def transcribe_audio(wav_path: str, meeting_id: str, db: Session) -> list[Transcript]:
    """
    使用 Faster-Whisper 轉錄音檔，並將結果寫入資料庫。

    Args:
        wav_path: 預處理後的 WAV 檔案路徑
        meeting_id: 會議 UUID
        db: SQLAlchemy Session

    Returns:
        已存入資料庫的 Transcript 物件列表
    """
    model = _get_model()

    logger.info(f"Starting transcription for meeting: {meeting_id}")
    segments_iter, info = model.transcribe(
        wav_path,
        language="zh",           # 指定中文以提高辨識準確度
        beam_size=5,
        vad_filter=True,         # 啟用 VAD 過濾靜音段，減少幻覺輸出
        vad_parameters=dict(
            min_silence_duration_ms=500,
        ),
    )

    logger.info(f"Detected language: {info.language} (prob: {info.language_probability:.2f})")

    transcript_records = []
    for segment in segments_iter:
        record = Transcript(
            meeting_id=meeting_id,
            start_time=round(segment.start, 3),
            end_time=round(segment.end, 3),
            content=segment.text.strip(),
        )
        db.add(record)
        transcript_records.append(record)

    db.commit()
    logger.info(f"Transcription completed: {len(transcript_records)} segments saved")
    return transcript_records
