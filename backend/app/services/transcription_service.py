"""
語音轉錄服務。
使用 Groq API 進行雲端極速轉錄。
"""
import logging
import os
import math

from sqlalchemy.orm import Session

from app.config import settings
from app.models.meeting import Transcript

logger = logging.getLogger(__name__)


def _get_segment_field(seg, field: str, default=None):
    """
    從 Groq 回傳的 segment 中安全取值。
    Groq SDK 回傳的 segment 可能是 dict 或 Pydantic 物件，需統一處理。

    Args:
        seg: Groq segment（dict 或物件）
        field: 欄位名稱
        default: 找不到時的預設值

    Returns:
        欄位值
    """
    if isinstance(seg, dict):
        return seg.get(field, default)
    return getattr(seg, field, default)


def _parse_groq_result(result, meeting_id: str, db: Session, time_offset: float = 0.0) -> list[Transcript]:
    """
    解析 Groq API 回傳結果並產生 Transcript 記錄。

    Args:
        result: Groq transcription API 回傳物件
        meeting_id: 會議 UUID
        db: SQLAlchemy Session
        time_offset: 時間偏移量（用於大檔案分段時校正時間戳）

    Returns:
        已加入 db session 的 Transcript 物件列表
    """
    records = []

    segments = getattr(result, "segments", None)
    if segments:
        for seg in segments:
            start = _get_segment_field(seg, "start", 0.0)
            end = _get_segment_field(seg, "end", 0.0)
            text = _get_segment_field(seg, "text", "")
            if not text or not text.strip():
                continue
            record = Transcript(
                meeting_id=meeting_id,
                start_time=round(start + time_offset, 3),
                end_time=round(end + time_offset, 3),
                content=text.strip(),
            )
            db.add(record)
            records.append(record)
    elif hasattr(result, "text") and result.text and result.text.strip():
        # 如果只回傳純文字（無時間戳），作為單一段落存入
        record = Transcript(
            meeting_id=meeting_id,
            start_time=round(time_offset, 3),
            end_time=round(time_offset, 3),
            content=result.text.strip(),
        )
        db.add(record)
        records.append(record)

    return records


def _transcribe_with_groq(wav_path: str, meeting_id: str, db: Session, api_key: str) -> list[Transcript]:
    """
    使用 Groq API (Whisper Large V3 Turbo) 進行雲端極速轉錄。
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
                model=GROQ_WHISPER_MODEL,
                language="zh",
                response_format="verbose_json",
            )

        logger.debug(f"Groq result type: {type(result)}, has segments: {hasattr(result, 'segments')}, has text: {hasattr(result, 'text')}")
        transcript_records = _parse_groq_result(result, meeting_id, db)
    else:
        # 大檔案需透過 wave 模組精確切割後逐段上傳
        import wave
        import tempfile
        
        chunk_count = math.ceil(file_size / GROQ_MAX_CHUNK_BYTES)
        logger.info(f"Groq transcription: splitting into ~{chunk_count} chunks ({file_size / 1024 / 1024:.1f} MB)")

        with wave.open(wav_path, 'rb') as wav_in:
            n_channels = wav_in.getnchannels()
            sampwidth = wav_in.getsampwidth()
            framerate = wav_in.getframerate()
            n_frames = wav_in.getnframes()
            
            # 每個 frame 的位元組數
            frame_size = n_channels * sampwidth
            # 每個 chunk 可以容納的最大 frame 數 (18MB)
            max_frames_per_chunk = GROQ_MAX_CHUNK_BYTES // frame_size
            
            frames_read = 0
            chunk_index = 1
            time_offset = 0.0
            
            while frames_read < n_frames:
                frames_to_read = min(max_frames_per_chunk, n_frames - frames_read)
                chunk_frames = wav_in.readframes(frames_to_read)
                if not chunk_frames:
                    break
                    
                # 建立暫存檔來儲存這個 chunk
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
                    tmp_path = tmp_wav.name
                    with wave.open(tmp_wav, 'wb') as wav_out:
                        wav_out.setnchannels(n_channels)
                        wav_out.setsampwidth(sampwidth)
                        wav_out.setframerate(framerate)
                        wav_out.writeframes(chunk_frames)
                
                logger.info(f"Processing chunk {chunk_index}/{chunk_count}")
                try:
                    with open(tmp_path, "rb") as chunk_file:
                        result = client.audio.transcriptions.create(
                            file=("chunk.wav", chunk_file),
                            model=GROQ_WHISPER_MODEL,
                            language="zh",
                            response_format="verbose_json",
                        )

                    chunk_records = _parse_groq_result(result, meeting_id, db, time_offset)
                    transcript_records.extend(chunk_records)
                finally:
                    # 確保刪除暫存檔
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
                
                # 更新 offset 和 index
                chunk_duration = frames_to_read / framerate
                time_offset += chunk_duration
                frames_read += frames_to_read
                chunk_index += 1

    db.commit()
    logger.info(f"Groq transcription completed: {len(transcript_records)} segments saved")
    return transcript_records


def transcribe_audio(wav_path: str, meeting_id: str, db: Session) -> list[Transcript]:
    """
    語音轉錄介面。使用 Groq API 進行雲端極速轉錄。

    Args:
        wav_path: 預處理後的 WAV 檔案路徑
        meeting_id: 會議 UUID
        db: SQLAlchemy Session

    Returns:
        已存入資料庫的 Transcript 物件列表
    """
    from app.api.endpoints.settings import get_setting

    api_key = get_setting("groq_api_key", db)
    if not api_key:
        raise ValueError("尚未設定 Groq API Key，請在設定頁面填入後再試")
    logger.info(f"Using Groq API for transcription (meeting: {meeting_id})")
    return _transcribe_with_groq(wav_path, meeting_id, db, api_key)
