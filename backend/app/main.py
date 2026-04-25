"""
SmartMinutes API 應用入口。
初始化 FastAPI、掛載路由、設定中介層與資料庫。
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.router import router
from app.db.session import init_db
from app.middleware.error_handler import global_exception_handler

# 設定日誌
logging.basicConfig(
    level=logging.DEBUG if settings.app_debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用生命週期管理：啟動時初始化資料庫。"""
    logging.getLogger(__name__).info("Initializing database...")
    init_db()
    logging.getLogger(__name__).info("SmartMinutes API started successfully")
    yield
    logging.getLogger(__name__).info("SmartMinutes API shutting down")


app = FastAPI(
    title="SmartMinutes API",
    version="1.0.0",
    description="AI 自動化會議紀錄助手",
    lifespan=lifespan,
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全域錯誤處理
app.add_exception_handler(Exception, global_exception_handler)

# 掛載 API 路由
app.include_router(router)


@app.get("/health")
def health_check():
    """健康檢查端點。"""
    return {"status": "ok", "message": "SmartMinutes API is running."}
