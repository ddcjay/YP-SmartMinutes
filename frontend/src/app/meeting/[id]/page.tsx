"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Download, RefreshCw, CheckCircle2, Loader2,
  XCircle, Clock, FileText, Subtitles, FileDown, ChevronDown,
} from "lucide-react";
import { useSse } from "@/hooks/use-sse";
import { apiFetch, API_BASE_URL } from "@/lib/api-client";

/** 處理步驟定義 */
const STEPS = [
  { key: "processing", label: "處理檔案中" },
  { key: "transcribing", label: "轉錄音訊中" },
  { key: "summarizing", label: "生成摘要中" },
];

/** 狀態在步驟列表中的索引（用於判斷已完成/進行中） */
function getStepIndex(status: string): number {
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : status === "completed" ? STEPS.length : -1;
}

export default function MeetingPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const progress = useSse(meetingId);
  const [meeting, setMeeting] = useState<Record<string, unknown> | null>(null);
  const [showExport, setShowExport] = useState(false);
  const isComplete = progress.status === "completed";
  const isFailed = progress.status === "failed";

  // 處理完成後載入完整資料
  useEffect(() => {
    if (isComplete) {
      apiFetch<{ data: Record<string, unknown> }>(`/api/meetings/${meetingId}`)
        .then((res) => setMeeting(res.data))
        .catch(console.error);
    }
  }, [isComplete, meetingId]);

  const handleRegenerate = useCallback(async (template: string) => {
    try {
      await apiFetch(`/api/meetings/${meetingId}/summary/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_type: template }),
      });
      const res = await apiFetch<{ data: Record<string, unknown> }>(`/api/meetings/${meetingId}`);
      setMeeting(res.data);
    } catch (e) {
      console.error("Regenerate failed:", e);
    }
  }, [meetingId]);

  const handleExport = useCallback((fmt: string) => {
    window.open(`${API_BASE_URL}/api/meetings/${meetingId}/export/${fmt}`, "_blank");
    setShowExport(false);
  }, [meetingId]);

  const currentStepIdx = getStepIndex(progress.status);

  return (
    <main className="flex-1 flex flex-col min-h-screen">
      {/* 頂部導覽列 */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-sm hover:opacity-80 transition" style={{ color: "var(--color-text-secondary)" }}>
          <ArrowLeft size={16} />
          返回首頁
        </button>
        <h1 className="text-lg font-semibold">
          Smart<span style={{ color: "var(--color-primary-light)" }}>Minutes</span>
        </h1>
        {isComplete && (
          <div className="relative">
            <button className="btn-secondary flex items-center gap-2 text-sm" onClick={() => setShowExport(!showExport)}>
              <Download size={14} />
              匯出
              <ChevronDown size={14} />
            </button>
            {showExport && (
              <div className="absolute right-0 mt-2 w-48 glass-card py-2 z-50 shadow-xl">
                {[
                  { fmt: "srt", icon: Subtitles, label: "字幕檔 (.srt)" },
                  { fmt: "txt", icon: FileText, label: "逐字稿 (.txt)" },
                  { fmt: "summary", icon: FileDown, label: "摘要 (.txt)" },
                  { fmt: "md", icon: FileDown, label: "完整報告 (.md)" },
                ].map((item) => (
                  <button
                    key={item.fmt}
                    className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-[var(--color-bg-hover)] transition"
                    onClick={() => handleExport(item.fmt)}
                  >
                    <item.icon size={14} style={{ color: "var(--color-primary-light)" }} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!isComplete && <div className="w-20" />}
      </header>

      {/* 處理中狀態 */}
      {!isComplete && !isFailed && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="glass-card p-10 w-full max-w-md text-center animate-fade-up">
            <Loader2 size={56} className="mx-auto mb-6 animate-spin-slow" style={{ color: "var(--color-primary-light)" }} />
            <h2 className="text-xl font-semibold mb-2">正在處理您的錄音</h2>
            <p className="text-sm mb-8" style={{ color: "var(--color-text-secondary)" }}>
              請稍候，我們正在轉錄並摘要您的會議內容...
            </p>

            {/* 步驟列表 */}
            <div className="space-y-4 text-left">
              {STEPS.map((step, i) => {
                const isDone = currentStepIdx > i;
                const isActive = currentStepIdx === i;
                return (
                  <div
                    key={step.key}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                    style={{
                      background: isActive ? "rgba(99,102,241,0.08)" : isDone ? "rgba(34,197,94,0.06)" : "transparent",
                      border: `1px solid ${isActive ? "rgba(99,102,241,0.25)" : isDone ? "rgba(34,197,94,0.15)" : "var(--color-border)"}`,
                    }}
                  >
                    {isDone ? (
                      <CheckCircle2 size={20} style={{ color: "var(--color-success)" }} />
                    ) : isActive ? (
                      <Loader2 size={20} className="animate-spin-slow" style={{ color: "var(--color-primary-light)" }} />
                    ) : (
                      <Clock size={20} style={{ color: "var(--color-text-muted)" }} />
                    )}
                    <span className={isDone ? "" : isActive ? "font-medium" : ""} style={{ color: isDone || isActive ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 進度條 */}
            <div className="mt-6 w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-base)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress.progress}%`, background: "var(--gradient-primary)" }} />
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>{progress.progress}%</p>
          </div>
        </div>
      )}

      {/* 處理失敗 */}
      {isFailed && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="glass-card p-10 w-full max-w-md text-center animate-fade-up">
            <XCircle size={56} className="mx-auto mb-4" style={{ color: "var(--color-error)" }} />
            <h2 className="text-xl font-semibold mb-2">處理失敗</h2>
            <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>{progress.message}</p>
            <button className="btn-primary" onClick={() => router.push("/")}>返回重新上傳</button>
          </div>
        </div>
      )}

      {/* 處理完成 — 工作台 */}
      {isComplete && meeting && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden" style={{ maxHeight: "calc(100vh - 65px)" }}>
          {/* 左側：逐字稿 */}
          <div className="flex flex-col overflow-hidden" style={{ borderRight: "1px solid var(--color-border)" }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold flex items-center gap-2">
                <Subtitles size={16} style={{ color: "var(--color-primary-light)" }} />
                完整逐字稿
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-1">
              {(meeting.transcripts as Array<{ id: number; start_time: number; content: string }>)?.map((t) => (
                <div key={t.id} className="flex gap-4 py-2 px-3 rounded-lg hover:bg-[var(--color-bg-hover)] transition group">
                  <span className="text-xs font-mono shrink-0 pt-0.5" style={{ color: "var(--color-primary-light)", minWidth: "60px" }}>
                    {formatTime(t.start_time)}
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-primary)" }}>{t.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 右側：AI 摘要 */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold flex items-center gap-2">
                <FileText size={16} style={{ color: "var(--color-primary-light)" }} />
                AI 會議摘要
              </h2>
              <div className="flex items-center gap-2">
                {["general_meeting", "interview", "brainstorming"].map((t) => (
                  <button key={t} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1" onClick={() => handleRegenerate(t)}>
                    <RefreshCw size={12} />
                    {t === "general_meeting" ? "週會" : t === "interview" ? "訪談" : "腦力激盪"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {(meeting.summaries as Array<{ content: SummaryData }>)?.length > 0 ? (
                <SummaryContent content={(meeting.summaries as Array<{ content: SummaryData }>).at(-1)!.content} />
              ) : (
                <p style={{ color: "var(--color-text-muted)" }}>尚無摘要</p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/** 秒數格式化為 MM:SS */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** 摘要結構型別 */
interface SummaryData {
  摘要總覽?: string;
  待辦項目?: Array<{ 負責人: string; 事項: string } | string>;
  重點記錄?: string[];
  建議行動?: string[];
}

/** 結構化摘要內容渲染元件 */
function SummaryContent({ content }: { content: SummaryData }) {
  return (
    <div className="space-y-6">
      {content.摘要總覽 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--color-primary-light)" }}>
            📋 摘要總覽
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            {content.摘要總覽}
          </p>
        </section>
      )}

      {content.待辦項目 && content.待辦項目.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--color-warning)" }}>
            ✅ 待辦項目
          </h3>
          <div className="space-y-2">
            {content.待辦項目.map((item, i) => (
              <div key={i} className="text-sm px-3 py-2 rounded-lg" style={{ background: "var(--color-bg-elevated)" }}>
                {typeof item === "object" ? (
                  <><span className="font-medium" style={{ color: "var(--color-primary-light)" }}>{item.負責人}</span>：{item.事項}</>
                ) : (
                  String(item)
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {content.重點記錄 && content.重點記錄.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--color-success)" }}>
            📝 重點記錄
          </h3>
          <ul className="space-y-1.5">
            {content.重點記錄.map((item, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: "var(--color-text-secondary)" }}>
                <span style={{ color: "var(--color-border-light)" }}>•</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.建議行動 && content.建議行動.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--color-primary-light)" }}>
            💡 建議行動
          </h3>
          <ul className="space-y-1.5">
            {content.建議行動.map((item, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: "var(--color-text-secondary)" }}>
                <span style={{ color: "var(--color-border-light)" }}>•</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
