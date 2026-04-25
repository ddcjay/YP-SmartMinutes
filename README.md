# SmartMinutes — AI 自動化會議紀錄助手

上傳會議錄音，AI 自動產出逐字稿、會議摘要與字幕檔。完全免費。

## 功能

- 🎙️ **精準轉錄** — Faster-Whisper 本地辨識，支援繁中與中英夾雜
- 📝 **智慧摘要** — AI 自動整理會議要點、待辦事項與建議行動
- 📄 **多格式輸出** — SRT 字幕、逐字稿、摘要文字、Markdown

## 快速開始

### 前置需求

| 項目 | 版本 |
|:---|:---|
| Python | 3.11+ |
| Node.js | 20 LTS |
| FFmpeg | 6.x+ |

### 安裝步驟

```bash
# 1. Clone 專案
git clone <repo-url> && cd YP-SmartMinutes

# 2. 後端安裝
cd backend
python -m venv venv
.\venv\Scripts\activate    # Windows
pip install -r requirements.txt

# 3. 前端安裝
cd ../frontend
npm install

# 4. 環境設定
cd ..
copy .env.example backend\.env
# 編輯 backend\.env 填入 GEMINI_API_KEY
```

### 啟動服務

```powershell
# 方式一：一鍵啟動
.\start-dev.ps1

# 方式二：手動啟動
# 終端 1 — 後端
cd backend && .\venv\Scripts\activate && uvicorn app.main:app --port 8000

# 終端 2 — 前端
cd frontend && npm run dev
```

開啟瀏覽器訪問 `http://localhost:3000`

## 技術架構

```
Frontend (Next.js 14)  ←  REST + SSE  →  Backend (FastAPI)
                                            ├── Faster-Whisper (ASR)
                                            ├── Gemini API (摘要)
                                            ├── FFmpeg (音訊處理)
                                            └── SQLite (資料儲存)
```

> 整個後端僅需啟動 **1 個服務**，無需 Docker、Redis 或外部資料庫。

## 專案結構

```
YP-SmartMinutes/
├── frontend/          # Next.js 前端
├── backend/           # FastAPI 後端
│   ├── app/
│   │   ├── api/       # API 路由
│   │   ├── services/  # 業務邏輯
│   │   ├── models/    # ORM 模型
│   │   ├── schemas/   # 資料驗證
│   │   └── tasks/     # 背景任務
│   └── tests/         # 整合測試
├── docs/              # 專案文件
└── start-dev.ps1      # 一鍵啟動
```

## 環境變數

| 變數 | 說明 | 預設值 |
|:---|:---|:---|
| `GEMINI_API_KEY` | Google Gemini API 金鑰 | (必填) |
| `WHISPER_MODEL` | Whisper 模型大小 | `medium` |
| `WHISPER_DEVICE` | 運算裝置 | `cpu` |
| `UPLOAD_DIR` | 音檔暫存路徑 | `./uploads` |
| `MAX_FILE_SIZE_MB` | 單檔大小上限 | `500` |

## 測試

```bash
cd backend
.\venv\Scripts\activate
python -m pytest tests/ -v
```

## 授權

MIT License
