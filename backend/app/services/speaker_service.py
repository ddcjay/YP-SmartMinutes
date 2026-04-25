"""
AI 語者辨識服務。
根據使用者提供的少量標註範例，透過 Gemini LLM 推斷逐字稿中每段話的發言者。
支援大量段落的分批處理與即時進度回報（SSE 串流）。
"""
import json
import logging
import math
import time
from typing import Generator
from sqlalchemy.orm import Session

from app.models.meeting import Transcript

logger = logging.getLogger(__name__)

# NOTE: 每批處理的最大段落數
BATCH_SIZE = 250
# NOTE: Gemini 免費版 RPM 限制為 15，批次間距需足夠長
BATCH_DELAY_SEC = 10
# NOTE: 429 重試配置
MAX_RETRIES = 3
RETRY_BASE_DELAY = 15  # 秒


def _build_prompt(batch_lines: list[str], known_speakers: list[str], context_lines: list[str] | None = None) -> str:
    """
    組裝語者辨識 Prompt。

    Args:
        batch_lines: 本批需要辨識的逐字稿行
        known_speakers: 已知的發言者名單
        context_lines: 前一批的最後幾行（提供上下文連貫性）

    Returns:
        完整 Prompt 字串
    """
    context_section = ""
    if context_lines:
        context_text = "\n".join(context_lines)
        context_section = f"\n以下是前一段的最後幾句話（僅供參考上下文，不需回傳）：\n{context_text}\n"

    batch_text = "\n".join(batch_lines)

    return f"""你是一位專業的會議記錄編輯。以下是一段會議逐字稿，其中部分段落已標註發言者（以【名字】標示），其餘標記為【?】。

已知的發言者有：{', '.join(known_speakers)}
（如果對話中明顯出現其他人的發言，你也可以新增發言者）

請根據以下線索判斷每段【?】的發言者：
1. 對話的上下文邏輯與語氣
2. 稱呼與被稱呼的關係
3. 同一人連續發言的可能性
4. 已標註段落中該人物的說話風格
{context_section}
逐字稿：
{batch_text}

請以 JSON 陣列回傳結果，格式為：
[{{"id": 段落ID, "speaker_label": "發言者名稱"}}]

只需回傳【?】段落的結果即可（已標註的不需要回傳）。
僅輸出 JSON，不要加任何說明文字或 markdown 標記。"""


def _call_gemini(prompt: str, api_key: str) -> list[dict]:
    """
    呼叫 Gemini API 並解析回傳的 JSON 結果。
    內建 429 重試機制（指數退避）。

    Args:
        prompt: 完整 Prompt
        api_key: Gemini API Key

    Returns:
        解析後的段落辨識結果列表
    """
    import google.generativeai as genai
    genai.configure(api_key=api_key)

    model = genai.GenerativeModel("gemini-2.0-flash-lite")

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = model.generate_content(prompt)
            raw = response.text.strip()
            break
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg and attempt < MAX_RETRIES:
                # NOTE: 配額超限時使用指數退避重試
                wait = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(f"Rate limited (attempt {attempt + 1}), waiting {wait}s...")
                time.sleep(wait)
                continue
            raise

    # 清理可能的 markdown 包裹
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"AI speaker identification JSON parse failed: {raw[:500]}")
        raise ValueError(f"AI 回傳格式解析失敗：{e}")


def identify_speakers_stream(
    meeting_id: str,
    labeled_segments: list[dict],
    db: Session,
) -> Generator[dict, None, None]:
    """
    以生成器方式逐批辨識發言者，每完成一批就 yield 進度事件。
    供 SSE 串流端點使用，讓前端即時獲得回饋。

    Args:
        meeting_id: 會議 UUID
        labeled_segments: 使用者標註的範例
        db: SQLAlchemy Session

    Yields:
        進度事件字典，格式為：
        - {"type": "progress", "batch": 1, "total": 5, "message": "...", "results": [...]}
        - {"type": "done", "total_updated": 100}
        - {"type": "error", "message": "..."}
    """
    from app.api.endpoints.settings import get_setting

    api_key = get_setting("gemini_api_key", db)
    if not api_key:
        yield {"type": "error", "message": "尚未設定 Gemini API Key，請在設定頁面填入後再試"}
        return

    transcripts = (
        db.query(Transcript)
        .filter(Transcript.meeting_id == meeting_id)
        .order_by(Transcript.start_time)
        .all()
    )

    if not transcripts:
        yield {"type": "error", "message": "此會議尚無逐字稿"}
        return

    label_map = {item["id"]: item["speaker_label"] for item in labeled_segments}
    known_speakers = list(set(label_map.values()))

    # 組裝所有行
    all_lines = []
    for t in transcripts:
        label = label_map.get(t.id)
        if label:
            all_lines.append(f"[ID:{t.id}] 【{label}】：{t.content}")
        else:
            all_lines.append(f"[ID:{t.id}] 【?】：{t.content}")

    total_batches = math.ceil(len(all_lines) / BATCH_SIZE)
    logger.info(f"Speaker identification: {len(all_lines)} segments, {total_batches} batches")

    # 通知前端總批次數
    yield {
        "type": "start",
        "total_batches": total_batches,
        "total_segments": len(all_lines),
        "message": f"共 {len(all_lines)} 段逐字稿，分 {total_batches} 批處理",
    }

    all_updates: dict[int, str] = {}
    context_lines: list[str] | None = None

    for batch_idx in range(total_batches):
        start = batch_idx * BATCH_SIZE
        end = min(start + BATCH_SIZE, len(all_lines))
        batch_lines = all_lines[start:end]

        logger.info(f"Processing batch {batch_idx + 1}/{total_batches}")

        # 通知前端開始處理本批
        yield {
            "type": "progress",
            "batch": batch_idx + 1,
            "total": total_batches,
            "message": f"正在處理第 {batch_idx + 1}/{total_batches} 批...",
            "results": [],
        }

        try:
            prompt = _build_prompt(batch_lines, known_speakers, context_lines)
            batch_results = _call_gemini(prompt, api_key)

            # 收集結果
            batch_update_list = []
            for r in batch_results:
                seg_id = r.get("id")
                sp = r.get("speaker_label")
                if seg_id and sp:
                    all_updates[seg_id] = sp
                    batch_update_list.append(r)
                    if sp not in known_speakers:
                        known_speakers.append(sp)

            yield {
                "type": "progress",
                "batch": batch_idx + 1,
                "total": total_batches,
                "message": f"第 {batch_idx + 1}/{total_batches} 批完成（本批辨識 {len(batch_update_list)} 段）",
                "results": batch_update_list,
            }
        except Exception as e:
            logger.error(f"Batch {batch_idx + 1} failed: {e}")
            yield {
                "type": "progress",
                "batch": batch_idx + 1,
                "total": total_batches,
                "message": f"第 {batch_idx + 1}/{total_batches} 批失敗：{str(e)[:100]}",
                "results": [],
            }

        context_lines = batch_lines[-5:]

        # NOTE: 遵守 Gemini API RPM 限制，批次間等待避免 429 錯誤
        if batch_idx < total_batches - 1:
            time.sleep(BATCH_DELAY_SEC)

    # 合併使用者標註 + AI 結果，寫回資料庫
    all_updates.update({item["id"]: item["speaker_label"] for item in labeled_segments})

    updated_count = 0
    for t in transcripts:
        speaker = all_updates.get(t.id)
        if speaker:
            t.speaker_label = speaker
            updated_count += 1

    db.commit()
    logger.info(f"Speaker identification completed: {updated_count} segments updated")

    yield {
        "type": "done",
        "total_updated": updated_count,
        "message": f"辨識完成！共更新 {updated_count} 段發言者",
    }
