"""
語音轉文字服務。
支援兩種轉錄引擎，由使用者在前端自行選擇：
  - Groq API：雲端極速轉錄（免費額度，1 小時音檔 < 1 分鐘）
  - Local：本地 Faster-Whisper（完全離線，資料不出境）
"""
import logging
import os
import math

from sqlalchemy.orm import Session

from app.config import settings
from app.models.meeting import Transcript

logger = logging.getLogger(__name__)

# NOTE: 本地 Whisper 模型惰性載入，避免啟動時消耗過多記憶體
_local_model = None

# Groq API 單次上傳上限為 25MB，超過需切割
GROQ_MAX_CHUNK_BYTES = 24 * 1024 * 1024  # 預留 1MB 空間


def _get_local_model():
    """
    惰性載入本地 Faster-Whisper 模型（僅在第一次呼叫時初始化）。

    Returns:
        WhisperModel 實例
    """
    global _local_model
    if _local_model is None:
        from faster_whisper import WhisperModel
        logger.info(f"Loading Faster-Whisper model: {settings.whisper_model} on {settings.whisper_device}")
        compute_type = "float16" if settings.whisper_device == "cuda" else "int8"
        _local_model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=compute_type,
        )
        logger.info("Faster-Whisper model loaded successfully")
    return _local_model


def _transcribe_with_groq(wav_path: str, meeting_id: str, db: Session, api_key: str) -> list[Transcript]:
    """
    使用 Groq API (Whisper Large V3) 進行雲端極速轉錄。
    若音檔超過 25MB 會自動切割成多段上傳。

    Args:
        wav_path: WAV 檔案路徑
        meeting_id: 會議 UUID
        db: SQLAlchemy Session
        api_key: Groq API Key

    Returns:
        已存入資料庫的 Transcript 物件列表
    """
    from groq import Groq

    client = Groq(api_key=api_key)
    file_size = os.path.getsize(wav_path)

    transcript_records = []

    if file_size <= GROQ_MAX_CHUNK_BYTES:
        # 單次上傳即可
        logger.info(f"Groq transcription: single chunk ({file_size / 1024 / 1024:.1f} MB)")
        with open(wav_path, "rb") as audio_file:
            result = client.audio.transcriptions.create(
                file=("audio.wav", audio_file),
                model="whisper-large-v3",
                language="zh",
                response_format="verbose_json",
            )

        if hasattr(result, "segments") and result.segments:
            for seg in result.segments:
                record = Transcript(
                    meeting_id=meeting_id,
                    start_time=round(seg.get("start", seg.start) if isinstance(seg, dict) else seg.start, 3),
                    end_time=round(seg.get("end", seg.end) if isinstance(seg, dict) else seg.end, 3),
                    content=(seg.get("text", "").strip() if isinstance(seg, dict) else seg.text.strip()),
                )
                db.add(record)
                transcript_records.append(record)
        elif hasattr(result, "text") and result.text:
            # 如果只回傳純文字（無時間戳），作為單一段落存入
            record = Transcript(
                meeting_id=meeting_id,
                start_time=0.0,
                end_time=0.0,
                content=result.text.strip(),
            )
            db.add(record)
            transcript_records.append(record)
    else:
        # 大檔案需切割後逐段上傳
        chunk_count = math.ceil(file_size / GROQ_MAX_CHUNK_BYTES)
        logger.info(f"Groq transcription: splitting into {chunk_count} chunks ({file_size / 1024 / 1024:.1f} MB)")

        time_offset = 0.0
        with open(wav_path, "rb") as f:
            for i in range(chunk_count):
                chunk_data = f.read(GROQ_MAX_CHUNK_BYTES)
                if not chunk_data:
                    break

                logger.info(f"Processing chunk {i + 1}/{chunk_count}")
                result = client.audio.transcriptions.create(
                    file=("chunk.wav", chunk_data),
                    model="whisper-large-v3",
                    language="zh",
                    response_format="verbose_json",
                )

                if hasattr(result, "segments") and result.segments:
                    for seg in result.segments:
                        start = (seg.get("start", seg.start) if isinstance(seg, dict) else seg.start)
                        end = (seg.get("end", seg.end) if isinstance(seg, dict) else seg.end)
                        text = (seg.get("text", "").strip() if isinstance(seg, dict) else seg.text.strip())
                        record = Transcript(
                            meeting_id=meeting_id,
                            start_time=round(start + time_offset, 3),
                            end_time=round(end + time_offset, 3),
                            content=text,
                        )
                        db.add(record)
                        transcript_records.append(record)
                        time_offset = record.end_time
                elif hasattr(result, "text") and result.text:
                    record = Transcript(
                        meeting_id=meeting_id,
                        start_time=round(time_offset, 3),
                        end_time=round(time_offset, 3),
                        content=result.text.strip(),
                    )
                    db.add(record)
                    transcript_records.append(record)

    db.commit()
    logger.info(f"Groq transcription completed: {len(transcript_records)} segments saved")
    return transcript_records


def _transcribe_with_local(wav_path: str, meeting_id: str, db: Session) -> list[Transcript]:
    """
    使用本地 Faster-Whisper 進行離線轉錄。

    Args:
        wav_path: WAV 檔案路徑
        meeting_id: 會議 UUID
        db: SQLAlchemy Session

    Returns:
        已存入資料庫的 Transcript 物件列表
    """
    model = _get_local_model()

    logger.info(f"Local transcription starting for meeting: {meeting_id}")
    segments_iter, info = model.transcribe(
        wav_path,
        language="zh",
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
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
    logger.info(f"Local transcription completed: {len(transcript_records)} segments saved")
    return transcript_records


def transcribe_audio(wav_path: str, meeting_id: str, db: Session) -> list[Transcript]:
    """
    統一轉錄介面。根據使用者設定自動選擇 Groq API 或本地 Whisper。

    Args:
        wav_path: 預處理後的 WAV 檔案路徑
        meeting_id: 會議 UUID
        db: SQLAlchemy Session

    Returns:
        已存入資料庫的 Transcript 物件列表
    """
    from app.api.endpoints.settings import get_setting

    provider = get_setting("transcription_provider", db, "groq")

    if provider == "groq":
        api_key = get_setting("groq_api_key", db)
        if not api_key:
            raise ValueError("尚未設定 Groq API Key，請在設定頁面填入後再試")
        logger.info(f"Using Groq API for transcription (meeting: {meeting_id})")
        return _transcribe_with_groq(wav_path, meeting_id, db, api_key)
    else:
        logger.info(f"Using local Faster-Whisper for transcription (meeting: {meeting_id})")
        return _transcribe_with_local(wav_path, meeting_id, db)
