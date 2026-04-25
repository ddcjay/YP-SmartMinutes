"""
SQLAlchemy 資料庫連線與 Session 管理。
採用 SQLite 作為 MVP 資料庫，未來可透過更換 database_url 遷移至 PostgreSQL。
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

# NOTE: SQLite 需要 check_same_thread=False 才能在 FastAPI 多執行緒環境正常運作
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    echo=settings.app_debug,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """所有 ORM Model 的基底類別。"""
    pass


def get_db():
    """
    FastAPI Depends 用的資料庫 Session 生成器。
    確保每次請求結束後正確關閉連線。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """建立所有資料表（開發用，生產環境應使用 Alembic 遷移）。"""
    # NOTE: 必須先匯入所有 Model，Base.metadata 才會包含對應的 Table
    import app.models.meeting  # noqa: F401
    import app.models.user_setting  # noqa: F401
    Base.metadata.create_all(bind=engine)
