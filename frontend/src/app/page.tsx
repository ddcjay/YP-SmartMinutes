"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileAudio, Sparkles, FileText, Subtitles, Loader2, Settings } from "lucide-react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api-client";

/** 允許上傳的檔案格式 */
const ACCEPTED_TYPES = [".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg"];
const ACCEPTED_MIME = ["audio/mpeg", "audio/wav", "audio/x-m4a", "audio/mp4", "video/mp4", "audio/webm", "audio/ogg"];

export default function HomePage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const handleFile = useCallback((file: File) => {
    setError("");
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      setError(`不支援的格式：${ext}，請上傳 MP3、WAV、M4A 或 MP4`);
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError("檔案過大，上限為 500MB");
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", selectedFile.name.replace(/\.[^.]+$/, ""));

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}/api/meetings/upload`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const res = JSON.parse(xhr.responseText);
          router.push(`/meeting/${res.data.meeting_id}`);
        } else {
          setError("上傳失敗，請重試");
          setIsUploading(false);
        }
      };

      xhr.onerror = () => {
        setError("網路錯誤，無法連接伺服器");
        setIsUploading(false);
      };

      xhr.send(formData);
    } catch {
      setError("上傳失敗，請重試");
      setIsUploading(false);
    }
  }, [selectedFile, router]);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* 背景光暈效果 */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--gradient-glow)" }} />

      {/* 右上角設定按鈕 */}
      <Link
        href="/settings"
        className="absolute top-5 right-5 z-20 p-2.5 rounded-xl hover:bg-[var(--color-bg-hover)] transition"
        title="設定 API Key"
      >
        <Settings size={20} style={{ color: "var(--color-text-muted)" }} />
      </Link>

      {/* 標題區 */}
      <div className="text-center mb-10 animate-fade-up relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-6"
          style={{ background: "rgba(99,102,241,0.12)", color: "var(--color-primary-light)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <Sparkles size={14} />
          <span>AI 驅動 · 免費使用</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
          Smart<span style={{ color: "var(--color-primary-light)" }}>Minutes</span>
        </h1>
        <p className="text-lg" style={{ color: "var(--color-text-secondary)" }}>
          上傳會議錄音，AI 自動產出逐字稿、會議摘要與字幕檔
        </p>
      </div>

      {/* 上傳區域 */}
      <div className="w-full max-w-xl relative z-10 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <div
          className={`glass-card p-8 text-center cursor-pointer transition-all duration-300 ${isDragging ? "scale-[1.02]" : ""}`}
          style={{
            borderColor: isDragging ? "var(--color-primary)" : selectedFile ? "var(--color-success)" : undefined,
            boxShadow: isDragging ? "0 0 30px rgba(99,102,241,0.15)" : undefined,
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          onClick={() => {
            if (!isUploading) {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ACCEPTED_MIME.join(",");
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFile(file);
              };
              input.click();
            }
          }}
        >
          {isUploading ? (
            <div className="space-y-4">
              <Loader2 size={48} className="mx-auto animate-spin-slow" style={{ color: "var(--color-primary-light)" }} />
              <p className="font-medium">上傳中... {uploadProgress}%</p>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--color-bg-base)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%`, background: "var(--gradient-primary)" }}
                />
              </div>
            </div>
          ) : selectedFile ? (
            <div className="space-y-3">
              <FileAudio size={48} className="mx-auto" style={{ color: "var(--color-success)" }} />
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {(selectedFile.size / 1024 / 1024).toFixed(1)} MB · 點擊更換檔案
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Upload size={48} className="mx-auto" style={{ color: "var(--color-text-muted)" }} />
              <p className="font-medium">拖放音檔到此處，或點擊選擇檔案</p>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                支援 MP3、WAV、M4A、MP4（上限 500MB）
              </p>
            </div>
          )}
        </div>

        {/* 錯誤訊息 */}
        {error && (
          <p className="mt-3 text-sm text-center" style={{ color: "var(--color-error)" }}>{error}</p>
        )}

        {/* 開始處理按鈕 */}
        {selectedFile && !isUploading && (
          <button className="btn-primary w-full mt-4 text-lg py-3.5" onClick={handleUpload}>
            <span className="flex items-center justify-center gap-2">
              <Sparkles size={18} />
              開始 AI 轉錄
            </span>
          </button>
        )}
      </div>

      {/* 功能特色卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mt-14 relative z-10 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        {[
          { icon: FileAudio, title: "極速轉錄", desc: "Groq 雲端極速辨識 / 本地離線模式可選" },
          { icon: FileText, title: "智慧摘要", desc: "AI 自動整理會議要點、待辦事項與建議行動" },
          { icon: Subtitles, title: "多格式輸出", desc: "匯出 SRT 字幕、逐字稿、Markdown 等格式" },
        ].map((feature) => (
          <div key={feature.title} className="glass-card p-5 text-center">
            <feature.icon size={28} className="mx-auto mb-3" style={{ color: "var(--color-primary-light)" }} />
            <h3 className="font-semibold mb-1">{feature.title}</h3>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{feature.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
