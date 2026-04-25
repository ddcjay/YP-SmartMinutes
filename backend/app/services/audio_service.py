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

    # NOTE: 當輸入已是 .wav，FFmpeg 無法原地覆寫 (in-place)，
    # 因此先輸出到暫存路徑再替換
    if input_file == output_file:
        tmp_output = input_file.with_name(f"{input_file.stem}_processed.wav")
    else:
        tmp_output = output_file

    cmd = [
        "ffmpeg", "-y",           # 覆蓋已存在的輸出檔
        "-i", str(input_file),    # 輸入檔案
        "-ar", "16000",           # 取樣率 16kHz（Whisper 要求）
        "-ac", "1",               # 單聲道
        "-c:a", "pcm_s16le",      # 16-bit PCM 編碼
        str(tmp_output),
    ]

    logger.info(f"FFmpeg converting: {input_file.name} → {tmp_output.name}")

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

    # 若使用暫存路徑，將結果搬移回預期的輸出路徑
    if tmp_output != output_file:
        tmp_output.replace(output_file)

    logger.info(f"Audio preprocessed successfully: {output_file}")
    return str(output_file)
