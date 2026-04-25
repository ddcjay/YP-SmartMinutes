"""
使用者設定 ORM Model。
將 API Key 等敏感設定儲存在 SQLite 中，由使用者透過前端自行管理。
"""
from sqlalchemy import Column, String, DateTime

from app.db.session import Base
from app.models.meeting import _utcnow


class UserSetting(Base):
    """
    使用者設定表。
    以 key-value 方式儲存，支援日後彈性擴充。
    """

    __tablename__ = "user_settings"

    key = Column(String(100), primary_key=True)
    value = Column(String(2000), nullable=False, default="")
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
