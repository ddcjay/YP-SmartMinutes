"""
會議相關 API 端點。
處理音檔上傳、狀態查詢、逐字稿/摘要取得、SSE 進度推播與檔案匯出。
"""
import asyncio
import json
import logging
import shutil
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, Request
from fastapi.responses import StreamingResponse, Response, FileResponse
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


@router.get("", response_model=ApiResponse)
def list_meetings(limit: int = 10, db: Session = Depends(get_db)):
    """取得最近的會議記錄列表"""
    meetings = db.query(Meeting).order_by(Meeting.created_at.desc()).limit(limit).all()
    data = [MeetingResponse.model_validate(m).model_dump(mode="json") for m in meetings]
    return ApiResponse(data=data)


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


@router.get("/{meeting_id}/audio")
def stream_audio(meeting_id: str, request: Request, db: Session = Depends(get_db)):
    """
    串流會議原始音檔，支援 HTTP Range 請求（讓前端 <audio> 元素可隨意跳轉播放位置）。
    優先回傳轉檔後的 WAV，若不存在則回傳原始上傳檔。
    """
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "會議不存在")

    file_path = Path(meeting.file_path)

    # 優先使用轉檔後的 WAV（音質一致且支援更好的跳轉）
    wav_path = file_path.with_suffix(".wav")
    if wav_path.exists():
        audio_path = wav_path
        content_type = "audio/wav"
    elif file_path.exists():
        audio_path = file_path
        ext = file_path.suffix.lower()
        content_type = {
            ".mp3": "audio/mpeg", ".wav": "audio/wav",
            ".m4a": "audio/mp4", ".mp4": "audio/mp4",
            ".webm": "audio/webm", ".ogg": "audio/ogg",
        }.get(ext, "application/octet-stream")
    else:
        raise HTTPException(404, "音檔不存在")

    file_size = audio_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        # NOTE: 解析 Range header 實現分段傳輸，讓瀏覽器可以跳轉播放
        range_str = range_header.replace("bytes=", "")
        start_str, end_str = range_str.split("-")
        start = int(start_str)
        end = int(end_str) if end_str else file_size - 1
        length = end - start + 1

        def iter_file():
            with open(audio_path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(8192, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iter_file(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
            },
        )

    return FileResponse(str(audio_path), media_type=content_type)


@router.put("/{meeting_id}/transcripts/{transcript_id}", response_model=ApiResponse)
def update_transcript(
    meeting_id: str,
    transcript_id: int,
    req: TranscriptUpdateRequest,
    db: Session = Depends(get_db),
):
    """
    更新單一逐字稿段落的內容（使用者手動修訂）。
    同時標記該段落已被編輯。
    """
    transcript = (
        db.query(Transcript)
        .filter(Transcript.id == transcript_id, Transcript.meeting_id == meeting_id)
        .first()
    )
    if not transcript:
        raise HTTPException(404, "逐字稿段落不存在")

    transcript.content = req.content
    transcript.is_edited = 1
    db.commit()

    return ApiResponse(message="逐字稿已更新")


@router.post("/{meeting_id}/transcripts/identify-speakers")
def identify_speakers_endpoint(
    meeting_id: str,
    req: dict,
    db: Session = Depends(get_db),
):
    """
    AI 語者辨識（SSE 串流）：每批處理完即時推送進度與結果。
    前端透過 response body 的 SSE 格式讀取批次進度。
    """
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "會議不存在")

    labeled = req.get("labeled_segments", [])
    if not labeled:
        raise HTTPException(400, "請至少標註一段發言者")

    from app.services.speaker_service import identify_speakers_stream

    def event_generator():
        try:
            for event in identify_speakers_stream(meeting_id, labeled, db):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except ValueError as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

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

    encoded_filename = quote(filename)
    return Response(
        content=content.encode("utf-8"),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )
