# SmartMinutes 開發啟動腳本
# 使用方式：在專案根目錄執行 .\start-dev.ps1

Write-Host ""
Write-Host "  Smart" -NoNewline -ForegroundColor White
Write-Host "Minutes" -NoNewline -ForegroundColor Magenta
Write-Host " - AI 自動化會議紀錄助手" -ForegroundColor DarkGray
Write-Host ""

# 檢查前置條件
$missing = @()

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { $missing += "Python 3.11+" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $missing += "Node.js 20+" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { $missing += "FFmpeg" }

if ($missing.Count -gt 0) {
    Write-Host "  [!] 缺少以下工具：" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "      - $_" -ForegroundColor Yellow }
    Write-Host ""
    exit 1
}

# 檢查 .env
if (-not (Test-Path "backend\.env")) {
    Write-Host "  [!] 尚未建立 backend\.env，正在從 .env.example 複製..." -ForegroundColor Yellow
    Copy-Item ".env.example" "backend\.env"
    Write-Host "  [!] 請編輯 backend\.env 填入 GEMINI_API_KEY 後重新執行此腳本" -ForegroundColor Yellow
    exit 1
}

Write-Host "  [1/2] 啟動後端 API (port 8000)..." -ForegroundColor Cyan
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\venv\Scripts\activate; uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" -PassThru

Start-Sleep -Seconds 2

Write-Host "  [2/2] 啟動前端 UI (port 3000)..." -ForegroundColor Cyan
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev" -PassThru

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "  ✓ 啟動完成！" -ForegroundColor Green
Write-Host ""
Write-Host "  後端 API:  http://localhost:8000" -ForegroundColor White
Write-Host "  前端 UI:   http://localhost:3000" -ForegroundColor White
Write-Host "  API 文件:  http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "  按 Ctrl+C 或關閉視窗即可停止" -ForegroundColor DarkGray
