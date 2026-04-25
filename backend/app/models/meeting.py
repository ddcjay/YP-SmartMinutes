"""
會議紀錄相關的 ORM Model。
對應資料庫中的 meetings、transcripts、summaries 三張表。
"""
import uuid
from datetime import datetime, timezone


def _utcnow():
    """回傳 UTC 時間（避免 Python 3.12+ 的 deprecation warning）。"""
    return datetime.now(timezone.utc)

from sqlalchemy import Column, String, Text, Integer, Float, DateTime, Enum, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.db.session import Base


class Meeting(Base):
    """會議主表，記錄每次上傳音檔的處理狀態與基本資訊。"""

    __tablename__ = "meetings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(200), default="未命名會議")
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, default=0)              # 檔案大小 (bytes)
    duration = Column(Float, nullable=True)              # 音檔長度 (秒)
    status = Column(
        String(20),
        default="uploading",
        # NOTE: 狀態機流程：uploading → processing → transcribing → summarizing → completed / failed
    )
    progress = Column(Integer, default=0)                # 處理進度百分比 (0-100)
    progress_message = Column(String(200), default="")   # 目前進度描述文字
    template_type = Column(String(50), default="general_meeting")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # 關聯
    transcripts = relationship("Transcript", back_populates="meeting", cascade="all, delete-orphan")
    summaries = relationship("Summary", back_populates="meeting", cascade="all, delete-orphan")


class Transcript(Base):
    """逐字稿段落表，每一筆代表一個時間區間的轉錄文字。"""

    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id"), nullable=False)
    speaker_label = Column(String(50), nullable=True)    # 語者標籤 (Speaker 0, 1...)
    start_time = Column(Float, nullable=False)           # 開始時間 (秒)
    end_time = Column(Float, nullable=False)             # 結束時間 (秒)
    content = Column(Text, nullable=False)               # 轉錄文字內容
    is_edited = Column(Integer, default=0)               # 是否經使用者手動修改
    created_at = Column(DateTime, default=_utcnow)

    meeting = relationship("Meeting", back_populates="transcripts")


class Summary(Base):
    """AI 摘要表，支援同一會議多次以不同模板生成摘要。"""

    __tablename__ = "summaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id"), nullable=False)
    template_type = Column(String(50), nullable=False)   # general_meeting | interview | brainstorming
    content = Column(JSON, nullable=False)               # 結構化摘要 JSON
    created_at = Column(DateTime, default=_utcnow)

    meeting = relationship("Meeting", back_populates="summaries")
