# Changelog

所有重要的變更都會記錄在此檔案中。

## [0.1.0] - 2026-04-25

### feat: 專案初始化與方案 B 精簡架構建立

**Why**: 採用精簡架構方案（方案 B），移除 Celery/Redis/PostgreSQL，
改用 FastAPI BackgroundTasks + SQLite + SSE，將啟動需求從 4 個服務精簡為 1 個，
預估開發時間從 6-8 週縮短至 4-5 週。

**What**:
- 建立 FastAPI 後端專案骨架（分層架構：api/services/models/schemas/tasks）
- 建立 Next.js 14 前端專案（App Router + Tailwind CSS + TypeScript）
- 實作集中式設定管理 (`config.py` + pydantic-settings)
- 實作 SQLAlchemy ORM Model（Meeting/Transcript/Summary）
- 實作 SQLite 資料庫連線與自動建表
- 實作音訊預處理服務 (FFmpeg → 16kHz mono WAV)
- 實作 Faster-Whisper 本地轉錄服務（惰性載入、VAD 過濾）
- 實作 Gemini API 摘要服務（3 種 Prompt 模板 + JSON 解析容錯）
- 實作檔案匯出服務（SRT/TXT/Summary/Markdown）
- 實作 API 路由（上傳/查詢/SSE 進度/摘要重新生成/匯出）
- 實作背景任務處理（ThreadPoolExecutor 取代 Celery）
- 實作全域錯誤處理中介層
- 建立 .gitignore、.env.example
- 建立開發文件（PRD/架構/目錄結構/實施計畫/環境設定）
