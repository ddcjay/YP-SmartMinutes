"""
Pydantic Schema：會議相關的請求/回應資料格式驗證。
"""
from datetime import datetime
from pydantic import BaseModel, Field


# ===== 回應格式 =====

class TranscriptSegment(BaseModel):
    """單一逐字稿段落的回應格式。"""
    id: int
    speaker_label: str | None = None
    start_time: float
    end_time: float
    content: str
    is_edited: bool = False

    model_config = {"from_attributes": True}


class SummaryResponse(BaseModel):
    """AI 摘要的回應格式。"""
    id: int
    template_type: str
    content: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class MeetingResponse(BaseModel):
    """會議詳情的回應格式。"""
    id: str
    title: str
    status: str
    progress: int
    progress_message: str
    duration: float | None = None
    file_size: int
    template_type: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MeetingDetailResponse(MeetingResponse):
    """含逐字稿與摘要的完整會議回應。"""
    transcripts: list[TranscriptSegment] = []
    summaries: list[SummaryResponse] = []


class ProgressEvent(BaseModel):
    """SSE 進度推播的資料格式。"""
    status: str
    progress: int
    message: str


# ===== 請求格式 =====

class TranscriptUpdateRequest(BaseModel):
    """更新逐字稿段落的請求格式。"""
    id: int
    content: str


class SummaryRegenerateRequest(BaseModel):
    """重新生成摘要的請求格式。"""
    template_type: str = Field(default="general_meeting", description="模板類型")


# ===== 通用回應 =====

class ApiResponse(BaseModel):
    """統一 API 回應格式。"""
    code: int = 200
    message: str = "success"
    data: dict | list | None = None
