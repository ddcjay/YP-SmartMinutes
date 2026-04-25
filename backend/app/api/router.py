"""
API 路由聚合。
將所有子路由模組註冊到統一的 router，由 main.py 掛載。
"""
from fastapi import APIRouter

from app.api.endpoints.meetings import router as meetings_router
from app.api.endpoints.settings import router as settings_router

router = APIRouter()
router.include_router(meetings_router)
router.include_router(settings_router)
