"""
全域錯誤處理中介層。
統一捕獲未預期的例外，確保 API 回應格式一致且不洩露敏感資訊。
"""
import logging
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


async def global_exception_handler(request: Request, exc: Exception):
    """
    處理所有未被路由攔截的例外。

    Args:
        request: FastAPI 請求物件
        exc: 例外物件

    Returns:
        統一格式的錯誤回應
    """
    logger.exception(f"Unhandled exception at {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "code": 500,
            "message": "Internal server error",
            "data": None,
        },
    )
