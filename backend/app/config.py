"""
集中式設定管理。
所有環境變數統一在此讀取，禁止在其他模組中直接存取 os.environ。
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """應用設定，從 .env 檔案或環境變數載入。"""

    # 應用基本設定
    app_env: str = "development"
    app_debug: bool = True

    # 資料庫（SQLite，檔案路徑相對於 backend 目錄）
    db_path: str = "smartminutes.db"

    # AI 服務
    gemini_api_key: str = ""

    # 檔案儲存
    upload_dir: str = "./uploads"
    max_file_size_mb: int = 500
    file_retention_hours: int = 24

    # 前端 URL（用於 CORS）
    frontend_url: str = "http://localhost:3000"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    @property
    def database_url(self) -> str:
        """產生 SQLite 連線字串。"""
        return f"sqlite:///{self.db_path}"

    @property
    def upload_path(self) -> Path:
        """取得上傳目錄的絕對路徑，若不存在則自動建立。"""
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


# NOTE: 全域單例，其他模組統一透過 from app.config import settings 取用
settings = Settings()
