"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Key, Zap, Brain, Check, AlertCircle, Eye, EyeOff,
} from "lucide-react";
import { apiFetch, API_BASE_URL } from "@/lib/api-client";

interface SettingsStatus {
  groq_configured: boolean;
  gemini_configured: boolean;
  ready: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const [groqKey, setGroqKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // 載入目前設定狀態
  useEffect(() => {
    apiFetch<{ data: SettingsStatus }>("/api/settings/status")
      .then((res) => {
        setStatus(res.data);
      })
      .catch(console.error);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMessage("");
    try {
      const settings: { key: string; value: string }[] = [];
      // 僅在使用者有輸入新值時才更新（避免覆蓋已儲存的 key）
      if (groqKey.trim()) {
        settings.push({ key: "groq_api_key", value: groqKey.trim() });
      }
      if (geminiKey.trim()) {
        settings.push({ key: "gemini_api_key", value: geminiKey.trim() });
      }

      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });

      // 重新載入狀態
      const res = await apiFetch<{ data: SettingsStatus }>("/api/settings/status");
      setStatus(res.data);
      setGroqKey("");
      setGeminiKey("");
      setSaveMessage("設定已儲存成功！");

      setTimeout(() => setSaveMessage(""), 3000);
    } catch (e) {
      setSaveMessage("儲存失敗，請檢查輸入");
    } finally {
      setSaving(false);
    }
  }, [groqKey, geminiKey]);

  return (
    <main className="flex-1 flex flex-col min-h-screen">
      {/* 導覽列 */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-sm hover:opacity-80 transition" style={{ color: "var(--color-text-secondary)" }}>
          <ArrowLeft size={16} />
          返回首頁
        </button>
        <h1 className="text-lg font-semibold">
          Smart<span style={{ color: "var(--color-primary-light)" }}>Minutes</span>
          <span className="text-sm font-normal ml-2" style={{ color: "var(--color-text-muted)" }}>設定</span>
        </h1>
        <div className="w-20" />
      </header>

      <div className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-lg space-y-6 animate-fade-up">

          {/* 設定狀態卡片 */}
          {status && (
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-secondary)" }}>服務狀態</h2>
              <div className="space-y-2">
                <StatusRow label="Groq API（語音轉錄）" configured={status.groq_configured} />
                <StatusRow label="Gemini API（AI 摘要）" configured={status.gemini_configured} />
              </div>
              {status.ready ? (
                <p className="mt-3 text-xs flex items-center gap-1" style={{ color: "var(--color-success)" }}>
                  <Check size={12} /> 所有服務已就緒，可以開始使用
                </p>
              ) : (
                <p className="mt-3 text-xs flex items-center gap-1" style={{ color: "var(--color-warning)" }}>
                  <AlertCircle size={12} /> 請先完成以下設定才能正常使用
                </p>
              )}
            </div>
          )}



          {/* Groq API Key */}
          <div className="glass-card p-5">
              <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
                <Key size={14} style={{ color: "var(--color-primary-light)" }} />
                Groq API Key
              </h2>
              <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
                前往{" "}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
                  className="underline hover:opacity-80" style={{ color: "var(--color-primary-light)" }}>
                  console.groq.com
                </a>
                {" "}免費申請（不需信用卡）
              </p>
              <div className="relative">
                <input
                  type={showGroqKey ? "text" : "password"}
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  placeholder={status?.groq_configured ? "已設定（留空不修改）" : "gsk_..."}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition"
                  style={{
                    background: "var(--color-bg-base)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                >
                  {showGroqKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Gemini API Key */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Brain size={14} style={{ color: "var(--color-primary-light)" }} />
              Gemini API Key
            </h2>
            <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
              前往{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                className="underline hover:opacity-80" style={{ color: "var(--color-primary-light)" }}>
                aistudio.google.com
              </a>
              {" "}免費申請
            </p>
            <div className="relative">
              <input
                type={showGeminiKey ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder={status?.gemini_configured ? "已設定（留空不修改）" : "AIzaSy..."}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition"
                style={{
                  background: "var(--color-bg-base)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
              >
                {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 儲存按鈕 */}
          <button
            className="btn-primary w-full flex items-center justify-center gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? "儲存中..." : "儲存設定"}
          </button>

          {/* 儲存結果提示 */}
          {saveMessage && (
            <p className="text-center text-sm" style={{ color: saveMessage.includes("成功") ? "var(--color-success)" : "var(--color-error)" }}>
              {saveMessage}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

/** 狀態指示列 */
function StatusRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{label}</span>
      {configured ? (
        <span className="text-xs flex items-center gap-1" style={{ color: "var(--color-success)" }}>
          <Check size={12} /> 已設定
        </span>
      ) : (
        <span className="text-xs flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
          <AlertCircle size={12} /> 未設定
        </span>
      )}
    </div>
  );
}
