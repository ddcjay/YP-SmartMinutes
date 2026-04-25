"""
AI 語者辨識服務。
根據使用者提供的少量標註範例，透過 Gemini LLM 推斷逐字稿中每段話的發言者。
"""
import json
import logging
from sqlalchemy.orm import Session

from app.models.meeting import Transcript

logger = logging.getLogger(__name__)


def identify_speakers(
    meeting_id: str,
    labeled_segments: list[dict],
    db: Session,
) -> list[dict]:
    """
    根據使用者標註的範例段落，使用 AI 推斷所有段落的發言者。

    Args:
        meeting_id: 會議 UUID
        labeled_segments: 使用者標註的範例，格式為 [{"id": 1, "speaker_label": "張主任"}, ...]
        db: SQLAlchemy Session

    Returns:
        更新後的段落列表 [{"id": ..., "speaker_label": ...}, ...]
    """
    from app.api.endpoints.settings import get_setting

    api_key = get_setting("gemini_api_key", db)
    if not api_key:
        raise ValueError("尚未設定 Gemini API Key，請在設定頁面填入後再試")

    # 取得所有逐字稿段落
    transcripts = (
        db.query(Transcript)
        .filter(Transcript.meeting_id == meeting_id)
        .order_by(Transcript.start_time)
        .all()
    )

    if not transcripts:
        raise ValueError("此會議尚無逐字稿")

    # 建立已標註的映射表
    label_map = {item["id"]: item["speaker_label"] for item in labeled_segments}

    # 組裝逐字稿文字，已標註的段落帶上發言者名稱
    transcript_lines = []
    for t in transcripts:
        label = label_map.get(t.id)
        if label:
            transcript_lines.append(f"[ID:{t.id}] 【{label}】：{t.content}")
        else:
            transcript_lines.append(f"[ID:{t.id}] 【?】：{t.content}")

    transcript_text = "\n".join(transcript_lines)

    # 收集所有已知的發言者名單
    known_speakers = list(set(label_map.values()))

    prompt = f"""你是一位專業的會議記錄編輯。以下是一段會議逐字稿，其中部分段落已由使用者標註了發言者（以【名字】標示），其餘標記為【?】。

已知的發言者有：{', '.join(known_speakers)}
（如果對話中明顯出現其他人的發言，你也可以新增發言者）

請根據以下線索判斷每段【?】的發言者：
1. 對話的上下文邏輯與語氣
2. 稱呼與被稱呼的關係
3. 同一人連續發言的可能性
4. 已標註段落中該人物的說話風格

逐字稿：
{transcript_text}

請以 JSON 陣列回傳結果，格式為：
[{{"id": 段落ID, "speaker_label": "發言者名稱"}}]

只需回傳【?】段落的結果即可（已標註的不需要回傳）。
僅輸出 JSON，不要加任何說明文字或 markdown 標記。"""

    import google.generativeai as genai
    genai.configure(api_key=api_key)

    model = genai.GenerativeModel("gemini-2.0-flash-lite")
    response = model.generate_content(prompt)
    raw = response.text.strip()

    # 清理可能的 markdown 包裹
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        results = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"AI speaker identification JSON parse failed: {raw[:500]}")
        raise ValueError(f"AI 回傳格式解析失敗：{e}")

    # 合併已標註 + AI 推斷的結果，寫回資料庫
    all_updates = {item["id"]: item["speaker_label"] for item in results}
    all_updates.update(label_map)  # 使用者標註優先

    updated = []
    for t in transcripts:
        speaker = all_updates.get(t.id)
        if speaker:
            t.speaker_label = speaker
            updated.append({"id": t.id, "speaker_label": speaker})

    db.commit()
    logger.info(f"Speaker identification completed: {len(updated)} segments updated")

    return updated
