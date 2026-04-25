"""
會議相關 API 端點。
處理音檔上傳、狀態查詢、逐字稿/摘要取得、SSE 進度推播與檔案匯出。
"""
import asyncio
import json
import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.models.meeting import Meeting, Transcript, Summary
from app.schemas.meeting import (
    MeetingResponse,
    MeetingDetailResponse,
    ApiResponse,
    SummaryRegenerateRequest,
    TranscriptUpdateRequest,
)
from app.tasks.processing import start_processing, get_progress

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/meetings", tags=["meetings"])

# 允許上傳的檔案格式白名單
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg"}


@router.post("/upload", response_model=ApiResponse)
async def upload_meeting(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    template_type: str = Form(default="general_meeting"),
    db: Session = Depends(get_db),
):
    """
    上傳會議音檔並啟動背景處理流程。

    - 驗證檔案格式與大小
    - 儲存至本地 uploads 目錄
    - 建立 Meeting 記錄
    - 啟動背景轉錄+摘要任務
    """
    # 檔案格式驗證
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支援的檔案格式: {ext}，請上傳 {', '.join(ALLOWED_EXTENSIONS)}")

    # 建立會議記錄
    meeting = Meeting(
        title=title or Path(file.filename).stem,
        file_path="",  # 稍後更新
        file_size=0,
        template_type=template_type,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    # 儲存檔案
    upload_dir = settings.upload_path / meeting.id
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"original{ext}"

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 更新檔案路徑與大小
    meeting.file_path = str(file_path)
    meeting.file_size = file_path.stat().st_size
    db.commit()

    # 啟動背景處理
    start_processing(meeting.id)

    return ApiResponse(
        code=200,
        message="上傳成功，已開始處理",
        data={"meeting_id": meeting.id},
    )


@router.get("/{meeting_id}", response_model=ApiResponse)
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """取得會議詳情（含逐字稿與摘要）。"""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "會議不存在")

    detail = MeetingDetailResponse.model_validate(meeting)
    return ApiResponse(data=detail.model_dump(mode="json"))


@router.get("/{meeting_id}/progress")
async def stream_progress(meeting_id: str):
    """
    SSE 端點：即時串流推播處理進度。
    前端使用 EventSource API 訂閱即可接收更新。
    """
    async def event_generator():
        while True:
            progress = get_progress(meeting_id)
            yield f"data: {json.dumps(progress, ensure_ascii=False)}\n\n"
            if progress["status"] in ("completed", "failed"):
                break
            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{meeting_id}/summary/regenerate", response_model=ApiResponse)
def regenerate_summary(
    meeting_id: str,
    req: SummaryRegenerateRequest,
    db: Session = Depends(get_db),
):
    """切換模板並重新生成 AI 摘要。"""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "會議不存在")

    from app.services.summary_service import generate_summary
    summary = generate_summary(meeting_id, req.template_type, db)

    return ApiResponse(
        message="摘要已重新生成",
        data={"summary_id": summary.id, "template_type": summary.template_type},
    )


@router.get("/{meeting_id}/export/{fmt}")
def export_file(meeting_id: str, fmt: str, db: Session = Depends(get_db)):
    """
    匯出會議成果檔案。

    支援格式：srt, txt, summary, md
    """
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "會議不存在")

    from app.services.export_service import export_srt, export_txt, export_summary_txt, export_markdown

    safe_title = meeting.title.replace(" ", "_")

    if fmt == "srt":
        content = export_srt(meeting_id, db)
        filename = f"{safe_title}.srt"
        media_type = "text/plain"
    elif fmt == "txt":
        content = export_txt(meeting_id, db)
        filename = f"{safe_title}_逐字稿.txt"
        media_type = "text/plain"
    elif fmt == "summary":
        content = export_summary_txt(meeting_id, db)
        filename = f"{safe_title}_摘要.txt"
        media_type = "text/plain"
    elif fmt == "md":
        content = export_markdown(meeting_id, db)
        filename = f"{safe_title}.md"
        media_type = "text/markdown"
    else:
        raise HTTPException(400, f"不支援的匯出格式: {fmt}")

    return Response(
        content=content.encode("utf-8"),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )
