# SmartMinutes 開發進度報告

> 更新時間：2026-04-25 17:11

---

## 📊 今日完成事項

### 1. Whisper 轉錄繁體中文修正
- 在 Groq Whisper API 呼叫中加入 `prompt` 參數，強制輸出繁體中文
- 檔案：[transcription_service.py](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/backend/app/services/transcription_service.py)

### 2. 首頁功能卡片互動化
- 底部三個功能介紹框（極速轉錄/智慧摘要/多格式輸出）改為可點擊按鈕
- 點擊後直接觸發檔案上傳選單

### 3. 聽音檔修訂逐字稿功能 ⭐
完整的音檔播放 + 逐字稿校對工作台：

| 功能 | 狀態 |
|------|------|
| 底部固定式音檔播放器 | ✅ |
| 播放/暫停/快轉/倒退 5 秒 | ✅ |
| 可拖拉進度條 | ✅ |
| 音量滑桿 + 靜音切換 | ✅ |
| 播放速度下拉選單 (1.0x-2.0x) | ✅ |
| 時間戳點擊跳轉播放 | ✅ |
| 播放時自動高亮/捲動至當前段落 | ✅ |
| 雙擊文字進入行內編輯 | ✅ |
| 編輯時自動暫停播放 | ✅ |
| Enter 儲存 / Esc 取消 | ✅ |
| 已修訂段落標記「已修訂」| ✅ |
| 後端音檔串流 API (HTTP Range) | ✅ |
| 後端逐字稿更新 API | ✅ |

### 4. 頁面分離重構
- 原本左右分割改為 **Tab 分頁**架構
- **逐字稿編修**：全寬逐字稿 + 音檔播放器
- **摘要報告**：全寬 AI 摘要 + 匯出按鈕列 + 模板切換

```
meeting/[id]/
  page.tsx                      ← 主頁面（Tab 導覽 + 處理狀態）
  components/
    transcript-editor.tsx       ← 逐字稿編輯元件
    summary-report.tsx          ← 摘要報告元件
```

### 5. AI 語者辨識功能 ⭐（部分完成）
- 每段逐字稿左側新增 👤 按鈕，可手動標註發言者
- 標註後按「✨ AI 語者辨識」，AI 根據範例推斷所有段落的發言者
- 已實作 SSE 串流分批處理 + 即時進度回報
- 已加入 429 自動重試（指數退避：15→30→60 秒）

---

## 🔴 待解決問題

### P0 - AI 語者辨識 RPM 超限
- **問題**：Gemini 3.1 Flash Lite 免費版 RPM 限制僅 15 次/分鐘，1700+ 段逐字稿分批後仍容易超限
- **現狀**：已加入重試機制但免費配額仍不足以一次跑完
- **可能方案**：
  1. ⭐ 使用 **Gemini 2.5 Flash**（RPM=5 但 TPM 更大），增大 BATCH_SIZE 到 500+ 減少呼叫次數
  2. 進一步增大 BATCH_SIZE 並壓縮 Prompt（只送文字不送時間戳）
  3. 改用付費方案提升 RPM 限額
  4. 將語者辨識改為離線/佇列任務，背景慢慢處理

---

## 📋 待辦清單

### 高優先
- [ ] 🔧 解決 AI 語者辨識 RPM 超限問題
- [ ] 🔧 確認語者辨識結果是否正確寫回資料庫（等 API 配額恢復後測試）
- [ ] 🔧 匯出功能需整合語者標註（SRT/TXT 匯出時帶上發言者名稱）

### 中優先
- [ ] 📐 語者標註的前端 UI 微調（標註顏色區分不同發言者）
- [ ] 📐 摘要報告頁面的匯出按鈕排版優化
- [ ] 🔧 首頁「近期會議紀錄」加入分頁功能（會議數量增多時）

### 低優先
- [ ] 📐 RWD 手機版面適配
- [ ] 🔧 音檔清理機制（超過保留時間自動刪除）
- [ ] 📐 深色/淺色主題切換
- [ ] 🔧 批次上傳多個音檔

---

## 🗂️ 關鍵檔案索引

| 模組 | 檔案 | 說明 |
|------|------|------|
| 前端首頁 | [page.tsx](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/frontend/src/app/page.tsx) | 上傳 + 歷史紀錄 |
| 會議主頁 | [meeting/page.tsx](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/frontend/src/app/meeting/[id]/page.tsx) | Tab 分頁導覽 |
| 逐字稿編輯 | [transcript-editor.tsx](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/frontend/src/app/meeting/[id]/components/transcript-editor.tsx) | 播放器 + 編輯 + 語者標註 |
| 摘要報告 | [summary-report.tsx](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/frontend/src/app/meeting/[id]/components/summary-report.tsx) | AI 摘要 + 匯出 |
| 後端 API | [meetings.py](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/backend/app/api/endpoints/meetings.py) | 所有會議端點 |
| 轉錄服務 | [transcription_service.py](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/backend/app/services/transcription_service.py) | Groq Whisper |
| 摘要服務 | [summary_service.py](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/backend/app/services/summary_service.py) | Gemini 摘要 |
| 語者辨識 | [speaker_service.py](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/backend/app/services/speaker_service.py) | AI 語者辨識 |
| 全域樣式 | [globals.css](file:///c:/Users/ddcja/Desktop/程式開發/YP-SmartMinutes/frontend/src/app/globals.css) | 設計系統 + 播放器滑桿 |

---

## 📝 Git 提交紀錄（今日）

```
90f7a87 fix: 語者辨識加入 429 重試與批次延遲機制
76fd706 feat: 新增 AI 語者辨識功能
d37e41a refactor: 逐字稿編修與摘要報告切割為獨立分頁
4a4cea7 feat: 新增聽音檔修訂逐字稿功能
```
