"""
檔案匯出服務。
支援將逐字稿與摘要匯出為 SRT、TXT、Markdown 等格式。
"""
import json
import logging
from sqlalchemy.orm import Session

from app.models.meeting import Meeting, Transcript, Summary

logger = logging.getLogger(__name__)


def _format_srt_time(seconds: float) -> str:
    """
    將秒數轉換為 SRT 時間格式 (HH:MM:SS,mmm)。

    Args:
        seconds: 時間（秒）

    Returns:
        SRT 格式的時間字串
    """
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"


def export_srt(meeting_id: str, db: Session) -> str:
    """
    將逐字稿匯出為 SRT 字幕格式。

    Args:
        meeting_id: 會議 UUID
        db: SQLAlchemy Session

    Returns:
        SRT 格式字串
    """
    transcripts = (
        db.query(Transcript)
        .filter(Transcript.meeting_id == meeting_id)
        .order_by(Transcript.start_time)
        .all()
    )

    lines = []
    for i, t in enumerate(transcripts, 1):
        start = _format_srt_time(t.start_time)
        end = _format_srt_time(t.end_time)
        lines.append(f"{i}")
        lines.append(f"{start} --> {end}")
        lines.append(t.content)
        lines.append("")

    return "\n".join(lines)


def export_txt(meeting_id: str, db: Session) -> str:
    """
    將逐字稿匯出為純文字格式（含時間戳）。

    Args:
        meeting_id: 會議 UUID
        db: SQLAlchemy Session

    Returns:
        純文字逐字稿
    """
    transcripts = (
        db.query(Transcript)
        .filter(Transcript.meeting_id == meeting_id)
        .order_by(Transcript.start_time)
        .all()
    )

    lines = []
    for t in transcripts:
        mins = int(t.start_time // 60)
        secs = int(t.start_time % 60)
        timestamp = f"[{mins:02d}:{secs:02d}]"
        lines.append(f"{timestamp} {t.content}")

    return "\n".join(lines)


def export_summary_txt(meeting_id: str, db: Session) -> str:
    """
    將最新的 AI 摘要匯出為純文字格式。

    Args:
        meeting_id: 會議 UUID
        db: SQLAlchemy Session

    Returns:
        格式化的摘要純文字
    """
    summary = (
        db.query(Summary)
        .filter(Summary.meeting_id == meeting_id)
        .order_by(Summary.created_at.desc())
        .first()
    )

    if not summary:
        return "尚未生成摘要"

    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    content = summary.content
    lines = [
        f"# {meeting.title if meeting else '會議摘要'}",
        "",
        "## 摘要總覽",
        "",
        content.get("摘要總覽", ""),
        "",
        "---",
        "",
        "## 待辦項目",
        "",
    ]

    for item in content.get("待辦項目", []):
        if isinstance(item, dict):
            lines.append(f"- **{item.get('負責人', '待指派')}**：{item.get('事項', '')}")
        else:
            lines.append(f"- {item}")

    lines.extend(["", "---", "", "## 重點記錄", ""])
    for item in content.get("重點記錄", []):
        lines.append(f"- {item}")

    lines.extend(["", "---", "", "## 建議行動", ""])
    for item in content.get("建議行動", []):
        lines.append(f"- {item}")

    return "\n".join(lines)


def export_markdown(meeting_id: str, db: Session) -> str:
    """
    將摘要與逐字稿合併匯出為 Markdown 格式。

    Args:
        meeting_id: 會議 UUID
        db: SQLAlchemy Session

    Returns:
        完整 Markdown 文件
    """
    summary_md = export_summary_txt(meeting_id, db)
    transcript_txt = export_txt(meeting_id, db)

    return f"{summary_md}\n\n---\n\n## 完整逐字稿\n\n{transcript_txt}"
