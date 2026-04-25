# Changelog

所有重要的變更都會記錄在此檔案中。

## [0.4.2] - 2026-04-25

### refactor: 移除本地 Whisper 轉錄支援

**Why**: 全面轉向 Groq API 雲端極速轉錄方案，簡化系統架構與相依性，並提升整體處理速度。

**What**:
- 移除 `transcription_service.py` 中的 Faster-Whisper 實作與切換邏輯
- 移除前端 `/settings` 頁面中的轉錄引擎選擇介面與相關變數
- 移除 `requirements.txt` 中的 `faster-whisper` 套件
- 移除設定相關 API ( `config.py`, `endpoints/settings.py` ) 中對本地模型 ( `whisper_model`, `transcription_provider` ) 的依賴

## [0.4.1] - 2026-04-25

### fix: 修復音檔上傳處理失敗的三項問題

**Why**: 上傳音檔後處理流程在多個環節出錯，導致始終回報「處理失敗」。

**What**:
- 修正 `audio_service.py`：FFmpeg 輸入輸出路徑相同時無法原地覆寫（`.wav` 上傳場景），
  改為先輸出至暫存路徑再替換
- 重構 `transcription_service.py`：
  - 抽出 `_parse_groq_result` / `_get_segment_field` 共用函式，消除 segment 解析的重複邏輯
  - 統一使用 `getattr` + `dict.get` 雙重取值，強化 Groq SDK 回傳型別相容性
  - Groq 模型改為 `whisper-large-v3-turbo`（更快、更便宜）
  - 加入 debug 日誌以利排查轉錄結果
- 修正 `processing.py`：轉錄結果為空（靜音/無語音）時，優雅跳過摘要生成並標記完成，
  不再因 `No transcript found` 而拋出異常

## [0.4.0] - 2026-04-25

### feat: 整合 Groq API 雲端極速轉錄 + 使用者自助 API Key 管理

**Why**: 本地 Faster-Whisper 在無 GPU 環境下轉錄速度較慢（1 小時音檔需 30-40 分鐘），
整合 Groq API (免費) 可將轉錄時間壓縮至 < 1 分鐘。
同時將 API Key 管理從 `.env` 改為前端使用者自行輸入+儲存，提升彈性與安全性。

**What**:
- 重寫 `transcription_service.py`：支援 Groq API / 本地 Whisper 雙引擎切換
  - Groq API 自動處理 > 25MB 大檔案切割上傳
  - 預設使用 `whisper-large-v3` 模型
- 修改 `summary_service.py`：Gemini API Key 改從資料庫讀取（向下相容 .env）
- 新增 `UserSetting` ORM Model（key-value 格式儲存設定）
- 新增 Settings API 端點（讀取/批次更新/狀態檢查，API Key 回傳遮罩）
- 新增前端設定頁面 (`/settings`)
  - 轉錄引擎選擇（Groq 雲端 / 本地離線）
  - Groq / Gemini API Key 輸入與密碼遮罩
  - 服務狀態即時檢查
  - 附帶官方申請連結（免費、不需信用卡）
- 首頁新增設定按鈕（齒輪圖示）
- 更新 `requirements.txt` 加入 `groq` SDK
- 更新 `router.py` 註冊 settings 路由
- 10 項整合測試仍全數通過

## [0.3.0] - 2026-04-25

### feat: Phase 2 整合測試 + Phase 3 部署準備

**Why**: 確保端對端流程正確運作，並建立部署所需的文件與腳本。

**What**:
- 建立整合測試腳本 (10 項測試全數通過)
  - 健康檢查、檔案格式驗證（PDF/MP3/M4A/WAV）
  - 404/400 錯誤處理、會議記錄建立、SSE 進度端點
- 安裝 FFmpeg (winget)
- 修復 `datetime.utcnow()` deprecation warning（改用 timezone-aware）
- 建立 `README.md`（安裝步驟、架構說明、環境變數文件）
- 建立 `start-dev.ps1` 一鍵啟動腳本（含前置條件檢查）

## [0.2.0] - 2026-04-25

### feat: Phase 1 前端介面開發完成

**Why**: 建立完整的使用者互動介面，實現「上傳→進度→結果」三階段流程。

**What**:
- 設計系統：暗色主題 CSS 變數、玻璃擬態卡片、漸層按鈕、微動畫
- 首頁：拖放上傳區域、XHR 上傳進度條、檔案格式/大小驗證、功能特色卡片
- 工作台頁面：SSE 即時步驟進度指示器、逐字稿/摘要雙欄佈局
- 匯出選單：SRT/TXT/Summary/Markdown 下載
- 摘要面板：模板切換（週會/訪談/腦力激盪）+ 重新生成
- SSE Hook (`use-sse.ts`)：EventSource 自動連線/斷線
- API Client (`api-client.ts`)：統一 base URL 與錯誤處理

## [0.1.1] - 2026-04-25

### docs: 全面更新文件至方案 B 精簡架構

**Why**: Phase 0 完成後，原有文件仍殘留方案 A（Celery/Redis/PostgreSQL）的內容，
需統一更新以確保文件與實作一致。

**What**:
- 重寫 `02.technical-architecture.md`：架構圖改為單一服務、SQLite、SSE
- 重寫 `03.project-structure.md`：移除 Celery/Redis 目錄、新增精簡對比表
- 重寫 `04.implementation-plan.md`：Phase 0 標記完成、精簡為 4 階段 4-5 週
- 刪除 `05.environment-config.md`（內容已整合至 `.env.example`）
- 刪除 `06.free-solutions-evaluation`（方案已決定，不再需要）
- 刪除 `backend/alembic/` 與 `alembic.ini`（MVP 使用 auto-create）
- 刪除 `docker-compose.yml`（MVP 不需 Docker）
- 移除 `requirements.txt` 中的 alembic、celery、redis、psycopg2-binary

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
- 建立開發文件（PRD/架構/目錄結構/實施計畫）
