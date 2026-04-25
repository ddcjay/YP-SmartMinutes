"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, Loader2, XCircle, Clock,
  Subtitles, FileText,
} from "lucide-react";
import { useSse } from "@/hooks/use-sse";
import { apiFetch } from "@/lib/api-client";
import TranscriptEditor from "./components/transcript-editor";
import SummaryReport from "./components/summary-report";

/** 處理步驟定義 */
const STEPS = [
  { key: "processing", label: "處理檔案中" },
  { key: "transcribing", label: "轉錄音訊中" },
  { key: "summarizing", label: "生成摘要中" },
];

function getStepIndex(status: string): number {
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : status === "completed" ? STEPS.length : -1;
}

/** 分頁定義 */
const TABS = [
  { key: "transcript", label: "逐字稿編修", icon: Subtitles },
  { key: "report", label: "摘要報告", icon: FileText },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MeetingPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const progress = useSse(meetingId);
  const [meeting, setMeeting] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("transcript");
  const isComplete = progress.status === "completed";
  const isFailed = progress.status === "failed";

  useEffect(() => {
    if (isComplete) {
      apiFetch<{ data: Record<string, unknown> }>(`/api/meetings/${meetingId}`)
        .then((res) => setMeeting(res.data))
        .catch(console.error);
    }
  }, [isComplete, meetingId]);

  const currentStepIdx = getStepIndex(progress.status);

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      {/* 頂部導覽列 */}
      <header className="flex items-center justify-between px-6 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-sm hover:opacity-80 transition" style={{ color: "var(--color-text-secondary)" }}>
          <ArrowLeft size={16} />
          返回首頁
        </button>
        <h1 className="text-lg font-semibold">
          Smart<span style={{ color: "var(--color-primary-light)" }}>Minutes</span>
        </h1>
        <div className="w-20" />
      </header>

      {/* 分頁標籤列（僅處理完成後顯示） */}
      {isComplete && meeting && (
        <div className="flex px-6 gap-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative"
              style={{
                color: activeTab === tab.key ? "var(--color-primary-light)" : "var(--color-text-muted)",
              }}
            >
              <tab.icon size={15} />
              {tab.label}
              {/* 底部指示線 */}
              {activeTab === tab.key && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ background: "var(--gradient-primary)" }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* 處理中狀態 */}
      {!isComplete && !isFailed && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="glass-card p-10 w-full max-w-md text-center animate-fade-up">
            <Loader2 size={56} className="mx-auto mb-6 animate-spin-slow" style={{ color: "var(--color-primary-light)" }} />
            <h2 className="text-xl font-semibold mb-2">正在處理您的錄音</h2>
            <p className="text-sm mb-8" style={{ color: "var(--color-text-secondary)" }}>
              請稍候，我們正在轉錄並摘要您的會議內容...
            </p>
            <div className="space-y-4 text-left">
              {STEPS.map((step, i) => {
                const isDone = currentStepIdx > i;
                const isActive = currentStepIdx === i;
                return (
                  <div key={step.key} className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                    style={{
                      background: isActive ? "rgba(99,102,241,0.08)" : isDone ? "rgba(34,197,94,0.06)" : "transparent",
                      border: `1px solid ${isActive ? "rgba(99,102,241,0.25)" : isDone ? "rgba(34,197,94,0.15)" : "var(--color-border)"}`,
                    }}
                  >
                    {isDone ? <CheckCircle2 size={20} style={{ color: "var(--color-success)" }} />
                      : isActive ? <Loader2 size={20} className="animate-spin-slow" style={{ color: "var(--color-primary-light)" }} />
                      : <Clock size={20} style={{ color: "var(--color-text-muted)" }} />}
                    <span className={isActive ? "font-medium" : ""} style={{ color: isDone || isActive ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>{step.label}</span>
                  </div>
                );
              })}
            </div>
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

      {/* 處理完成 — 分頁內容 */}
      {isComplete && meeting && (
        <>
          {activeTab === "transcript" && (
            <TranscriptEditor meetingId={meetingId} meeting={meeting} onMeetingUpdate={setMeeting} />
          )}
          {activeTab === "report" && (
            <SummaryReport meetingId={meetingId} meeting={meeting} onMeetingUpdate={setMeeting} />
          )}
        </>
      )}
    </main>
  );
}
