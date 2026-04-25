"""
AI 摘要生成服務。
使用 Google Gemini API (Free Tier) 將逐字稿轉換為結構化會議摘要。
"""
import json
import logging
from sqlalchemy.orm import Session

from app.config import settings
from app.models.meeting import Meeting, Transcript, Summary

logger = logging.getLogger(__name__)

# 預設摘要模板的 Prompt 指令
PROMPT_TEMPLATES = {
    "general_meeting": """你是一位專業的會議記錄整理助手。請將以下會議逐字稿整理成結構化的會議紀錄。

請嚴格按照以下 JSON 格式輸出：
{{
  "摘要總覽": "用 2-3 段文字概述本次會議的主要內容與結論",
  "待辦項目": [
    {{"負責人": "人名", "事項": "待辦內容描述"}}
  ],
  "重點記錄": [
    "重點事項 1",
    "重點事項 2"
  ],
  "建議行動": [
    "建議 1",
    "建議 2"
  ]
}}

注意事項：
- 使用繁體中文（台灣用語）
- 待辦項目應具體可執行
- 重點記錄應條列清晰
- 建議行動應具建設性

逐字稿內容：
{transcript}""",

    "interview": """你是一位專業的訪談記錄整理助手。請將以下訪談逐字稿整理成結構化的訪談紀錄。

請嚴格按照以下 JSON 格式輸出：
{{
  "摘要總覽": "訪談的整體概述",
  "待辦項目": [{{"負責人": "人名", "事項": "後續追蹤事項"}}],
  "重點記錄": ["以 Q&A 配對方式整理的重點問答"],
  "建議行動": ["後續建議"]
}}

使用繁體中文（台灣用語）。

逐字稿內容：
{transcript}""",

    "brainstorming": """你是一位專業的技術會議整理助手。請將以下腦力激盪會議逐字稿整理成結構化紀錄。

請嚴格按照以下 JSON 格式輸出：
{{
  "摘要總覽": "會議討論的核心問題與共識",
  "待辦項目": [{{"負責人": "人名", "事項": "具體執行項目"}}],
  "重點記錄": ["提出的解決方案與技術細節"],
  "建議行動": ["後續技術驗證與實作方向"]
}}

使用繁體中文（台灣用語）。側重解決方案與技術細節。

逐字稿內容：
{transcript}""",
}


def _build_transcript_text(meeting_id: str, db: Session) -> str:
    """
    從資料庫組裝完整逐字稿文字。

    Args:
        meeting_id: 會議 UUID
        db: SQLAlchemy Session

    Returns:
        合併後的逐字稿純文字
    """
    transcripts = (
        db.query(Transcript)
        .filter(Transcript.meeting_id == meeting_id)
        .order_by(Transcript.start_time)
        .all()
    )
    return "\n".join(t.content for t in transcripts)


def generate_summary(meeting_id: str, template_type: str, db: Session) -> Summary:
    """
    呼叫 Gemini API 生成會議摘要，並將結果存入資料庫。

    Args:
        meeting_id: 會議 UUID
        template_type: 模板類型 (general_meeting / interview / brainstorming)
        db: SQLAlchemy Session

    Returns:
        已存入資料庫的 Summary 物件

    Raises:
        ValueError: 找不到逐字稿或模板類型無效
        RuntimeError: Gemini API 呼叫失敗
    """
    transcript_text = _build_transcript_text(meeting_id, db)
    if not transcript_text:
        raise ValueError(f"No transcript found for meeting {meeting_id}")

    template = PROMPT_TEMPLATES.get(template_type)
    if not template:
        raise ValueError(f"Unknown template type: {template_type}")

    prompt = template.format(transcript=transcript_text)

    logger.info(f"Generating summary for meeting {meeting_id} with template: {template_type}")

    # 從使用者設定讀取 Gemini API Key
    from app.api.endpoints.settings import get_setting
    gemini_key = get_setting("gemini_api_key", db)
    if not gemini_key:
        # 向下相容：若使用者未在前端設定，嘗試從 .env 讀取
        gemini_key = settings.gemini_api_key
    if not gemini_key:
        raise ValueError("尚未設定 Gemini API Key，請在設定頁面填入後再試")

    import google.generativeai as genai
    genai.configure(api_key=gemini_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    response = model.generate_content(prompt)
    response_text = response.text

    # 嘗試解析 JSON（Gemini 有時會用 markdown 包裹）
    try:
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        summary_data = json.loads(cleaned)
    except json.JSONDecodeError:
        # HACK: 如果無法解析為 JSON，將原始回應包裝成標準格式
        logger.warning("Failed to parse Gemini response as JSON, wrapping raw text")
        summary_data = {
            "摘要總覽": response_text,
            "待辦項目": [],
            "重點記錄": [],
            "建議行動": [],
        }

    summary = Summary(
        meeting_id=meeting_id,
        template_type=template_type,
        content=summary_data,
    )
    db.add(summary)
    db.commit()
    db.refresh(summary)

    logger.info(f"Summary generated successfully for meeting {meeting_id}")
    return summary
