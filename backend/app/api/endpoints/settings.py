"""
使用者設定 API 端點。
提供 API Key 的儲存、讀取功能，讓使用者透過前端管理。
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user_setting import UserSetting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])

# 允許使用者設定的 key 白名單（防止任意寫入）
ALLOWED_KEYS = {"groq_api_key", "gemini_api_key", "transcription_provider", "whisper_model"}


class SettingUpdateRequest(BaseModel):
    """設定更新請求。"""
    key: str
    value: str


class SettingsBatchRequest(BaseModel):
    """批次設定更新請求。"""
    settings: list[SettingUpdateRequest]


def get_setting(key: str, db: Session, default: str = "") -> str:
    """
    讀取單一設定值（供內部服務使用）。

    Args:
        key: 設定鍵名
        db: SQLAlchemy Session
        default: 找不到時的預設值

    Returns:
        設定值字串
    """
    record = db.query(UserSetting).filter(UserSetting.key == key).first()
    return record.value if record else default


@router.get("")
def list_settings(db: Session = Depends(get_db)):
    """
    取得所有使用者設定。
    NOTE: API Key 只回傳遮罩後的值（安全考量）。
    """
    records = db.query(UserSetting).all()
    result = {}
    for r in records:
        if "api_key" in r.key and r.value:
            # 只顯示前 4 碼和後 4 碼，中間用 * 遮罩
            masked = r.value[:4] + "*" * max(0, len(r.value) - 8) + r.value[-4:]
            result[r.key] = masked
        else:
            result[r.key] = r.value
    return {"code": 200, "data": result}


@router.put("")
def update_settings(req: SettingsBatchRequest, db: Session = Depends(get_db)):
    """
    批次更新使用者設定。
    僅允許白名單內的 key。
    """
    for item in req.settings:
        if item.key not in ALLOWED_KEYS:
            raise HTTPException(400, f"不允許設定: {item.key}")

        record = db.query(UserSetting).filter(UserSetting.key == item.key).first()
        if record:
            record.value = item.value
        else:
            record = UserSetting(key=item.key, value=item.value)
            db.add(record)

    db.commit()
    logger.info(f"Settings updated: {[s.key for s in req.settings]}")
    return {"code": 200, "message": "設定已儲存"}


@router.get("/status")
def check_status(db: Session = Depends(get_db)):
    """
    檢查各項服務的設定狀態（是否已設定 API Key）。
    用於前端顯示設定完成度。
    """
    groq_key = get_setting("groq_api_key", db)
    gemini_key = get_setting("gemini_api_key", db)
    provider = get_setting("transcription_provider", db, "groq")

    return {
        "code": 200,
        "data": {
            "groq_configured": bool(groq_key),
            "gemini_configured": bool(gemini_key),
            "transcription_provider": provider,
            "ready": bool(groq_key or provider == "local") and bool(gemini_key),
        },
    }
