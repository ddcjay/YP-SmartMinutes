"""
Phase 2 整合測試腳本。
測試項目：錯誤處理、檔案驗證、API 端點、匯出功能。

使用方式：
  cd backend
  .\venv\Scripts\activate
  python -m pytest tests/test_integration.py -v
"""
import os
import sys
import json
import tempfile
import pytest

# 確保可以匯入 app 模組
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.db.session import Base, engine


@pytest.fixture(autouse=True)
def setup_db():
    """每次測試前重建資料庫。"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


class TestHealthCheck:
    """健康檢查端點測試。"""

    def test_health_returns_ok(self):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"


class TestFileValidation:
    """檔案上傳驗證測試。"""

    def test_reject_unsupported_format(self):
        """不支援的檔案格式應回傳 400。"""
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"fake pdf content")
            f.flush()
            with open(f.name, "rb") as upload:
                res = client.post(
                    "/api/meetings/upload",
                    files={"file": ("test.pdf", upload, "application/pdf")},
                )
        assert res.status_code == 400
        assert "不支援" in res.json()["detail"]
        os.unlink(f.name)

    def test_accept_mp3_format(self):
        """MP3 格式應被接受並回傳 meeting_id。"""
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            # 寫入最小的合法音訊位元組（假資料，不會實際轉錄成功但能通過格式驗證）
            f.write(b"\xff\xfb\x90\x00" * 100)
            f.flush()
            with open(f.name, "rb") as upload:
                res = client.post(
                    "/api/meetings/upload",
                    files={"file": ("test.mp3", upload, "audio/mpeg")},
                )
        assert res.status_code == 200
        data = res.json()
        assert data["code"] == 200
        assert "meeting_id" in data["data"]
        os.unlink(f.name)

    def test_accept_m4a_format(self):
        """M4A 格式應被接受。"""
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as f:
            f.write(b"\x00" * 200)
            f.flush()
            with open(f.name, "rb") as upload:
                res = client.post(
                    "/api/meetings/upload",
                    files={"file": ("test.m4a", upload, "audio/mp4")},
                )
        assert res.status_code == 200
        os.unlink(f.name)

    def test_accept_wav_format(self):
        """WAV 格式應被接受。"""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(b"RIFF" + b"\x00" * 200)
            f.flush()
            with open(f.name, "rb") as upload:
                res = client.post(
                    "/api/meetings/upload",
                    files={"file": ("test.wav", upload, "audio/wav")},
                )
        assert res.status_code == 200
        os.unlink(f.name)


class TestMeetingApi:
    """會議 API 端點測試。"""

    def test_get_nonexistent_meeting(self):
        """查詢不存在的會議應回傳 404。"""
        res = client.get("/api/meetings/nonexistent-id")
        assert res.status_code == 404

    def test_export_nonexistent_meeting(self):
        """匯出不存在的會議應回傳 404。"""
        res = client.get("/api/meetings/nonexistent-id/export/srt")
        assert res.status_code == 404

    def test_export_unsupported_format(self):
        """匯出不支援的格式應回傳 400。"""
        # 先上傳建立一個會議
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            f.write(b"\xff\xfb\x90\x00" * 100)
            f.flush()
            with open(f.name, "rb") as upload:
                res = client.post(
                    "/api/meetings/upload",
                    files={"file": ("test.mp3", upload, "audio/mpeg")},
                )
        meeting_id = res.json()["data"]["meeting_id"]

        res = client.get(f"/api/meetings/{meeting_id}/export/docx")
        assert res.status_code == 400
        os.unlink(f.name)

    def test_upload_creates_meeting_record(self):
        """上傳後應能查詢到會議記錄。"""
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            f.write(b"\xff\xfb\x90\x00" * 100)
            f.flush()
            with open(f.name, "rb") as upload:
                res = client.post(
                    "/api/meetings/upload",
                    files={"file": ("my_meeting.mp3", upload, "audio/mpeg")},
                    data={"title": "測試會議"},
                )
        meeting_id = res.json()["data"]["meeting_id"]

        # 查詢會議
        res = client.get(f"/api/meetings/{meeting_id}")
        assert res.status_code == 200
        meeting_data = res.json()["data"]
        assert meeting_data["title"] == "測試會議"
        os.unlink(f.name)


class TestSseProgress:
    """SSE 進度端點測試。"""

    def test_progress_stream_returns_event_stream(self):
        """SSE 進度端點應回傳 text/event-stream。"""
        # 先上傳
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            f.write(b"\xff\xfb\x90\x00" * 100)
            f.flush()
            with open(f.name, "rb") as upload:
                res = client.post(
                    "/api/meetings/upload",
                    files={"file": ("test.mp3", upload, "audio/mpeg")},
                )
        meeting_id = res.json()["data"]["meeting_id"]

        # 測試 SSE 端點
        with client.stream("GET", f"/api/meetings/{meeting_id}/progress") as response:
            assert response.headers["content-type"].startswith("text/event-stream")
            # 讀取第一個事件即可
            for line in response.iter_lines():
                if line.startswith("data:"):
                    data = json.loads(line[5:].strip())
                    assert "status" in data
                    assert "progress" in data
                    break
        os.unlink(f.name)
