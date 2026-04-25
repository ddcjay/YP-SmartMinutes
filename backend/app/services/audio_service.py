"""
音訊預處理服務。
使用 FFmpeg 將各種格式的音檔統一轉換為 Whisper 所需的 WAV 格式。
"""
import subprocess
import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


def preprocess_audio(input_path: str) -> str:
    """
    將輸入音檔轉換為 16kHz 單聲道 WAV 格式。

    Args:
        input_path: 原始音檔路徑

    Returns:
        轉換後的 WAV 檔案路徑

    Raises:
        RuntimeError: FFmpeg 轉換失敗時拋出
    """
    input_file = Path(input_path)
    output_file = input_file.with_suffix(".wav")

    # NOTE: 如果已經是 WAV 格式且符合規格，可考慮跳過轉換（未來優化）
    cmd = [
        "ffmpeg", "-y",           # 覆蓋已存在的輸出檔
        "-i", str(input_file),    # 輸入檔案
        "-ar", "16000",           # 取樣率 16kHz（Whisper 要求）
        "-ac", "1",               # 單聲道
        "-c:a", "pcm_s16le",      # 16-bit PCM 編碼
        str(output_file),
    ]

    logger.info(f"FFmpeg converting: {input_file.name} → {output_file.name}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 分鐘超時，避免超大檔案卡住
        )
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {result.stderr}")
    except FileNotFoundError:
        raise RuntimeError(
            "FFmpeg not found. Please install FFmpeg and ensure it is in your system PATH."
        )

    logger.info(f"Audio preprocessed successfully: {output_file}")
    return str(output_file)
