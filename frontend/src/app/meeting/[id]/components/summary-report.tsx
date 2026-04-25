"use client";

import { useCallback } from "react";
import {
  Download, RefreshCw, FileText, Subtitles, FileDown, ChevronDown,
} from "lucide-react";
import { apiFetch, API_BASE_URL } from "@/lib/api-client";

/** 摘要結構型別 */
interface SummaryData {
  摘要總覽?: string;
  待辦項目?: Array<{ 負責人: string; 事項: string } | string>;
  重點記錄?: any[];
  建議行動?: any[];
}

interface SummaryReportProps {
  meetingId: string;
  meeting: Record<string, unknown>;
  onMeetingUpdate: (data: Record<string, unknown>) => void;
}

/**
 * AI 摘要報告頁面元件。
 * 顯示 AI 生成的會議摘要，支援切換模板重新生成與匯出。
 */
export default function SummaryReport({ meetingId, meeting, onMeetingUpdate }: SummaryReportProps) {
  const handleRegenerate = useCallback(async (template: string) => {
    try {
      await apiFetch(`/api/meetings/${meetingId}/summary/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_type: template }),
      });
      const res = await apiFetch<{ data: Record<string, unknown> }>(`/api/meetings/${meetingId}`);
      onMeetingUpdate(res.data);
    } catch (e) {
      console.error("Regenerate failed:", e);
    }
  }, [meetingId, onMeetingUpdate]);

  const handleExport = useCallback((fmt: string) => {
    window.location.href = `${API_BASE_URL}/api/meetings/${meetingId}/export/${fmt}`;
  }, [meetingId]);

  const summaries = meeting.summaries as Array<{ content: SummaryData }> | undefined;
  const latestSummary = summaries?.at(-1)?.content;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 工具列 */}
      <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>切換模板：</span>
          {[
            { key: "general_meeting", label: "週會" },
            { key: "interview", label: "訪談" },
            { key: "brainstorming", label: "腦力激盪" },
          ].map((t) => (
            <button key={t.key} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1" onClick={() => handleRegenerate(t.key)}>
              <RefreshCw size={12} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {[
            { fmt: "srt", icon: Subtitles, label: "字幕檔" },
            { fmt: "txt", icon: FileText, label: "逐字稿" },
            { fmt: "summary", icon: FileDown, label: "摘要" },
            { fmt: "md", icon: FileDown, label: "完整報告" },
          ].map((item) => (
            <button
              key={item.fmt}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
              onClick={() => handleExport(item.fmt)}
            >
              <item.icon size={12} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 摘要內容 */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        {latestSummary ? (
          <SummaryContent content={latestSummary} />
        ) : (
          <p className="text-center py-12" style={{ color: "var(--color-text-muted)" }}>尚無摘要</p>
        )}
      </div>
    </div>
  );
}

/** 結構化摘要內容渲染元件 */
function SummaryContent({ content }: { content: SummaryData }) {
  return (
    <div className="space-y-8">
      {content.摘要總覽 && (
        <section className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-primary-light)" }}>📋 摘要總覽</h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{content.摘要總覽}</p>
        </section>
      )}

      {content.待辦項目 && content.待辦項目.length > 0 && (
        <section className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-warning)" }}>✅ 待辦項目</h3>
          <div className="space-y-2">
            {content.待辦項目.map((item, i) => (
              <div key={i} className="text-sm px-3 py-2 rounded-lg" style={{ background: "var(--color-bg-base)" }}>
                {typeof item === "object" ? (
                  <><span className="font-medium" style={{ color: "var(--color-primary-light)" }}>{item.負責人}</span>：{item.事項}</>
                ) : String(item)}
              </div>
            ))}
          </div>
        </section>
      )}

      {content.重點記錄 && content.重點記錄.length > 0 && (
        <section className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-success)" }}>📝 重點記錄</h3>
          <ul className="space-y-1.5">
            {content.重點記錄.map((item, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: "var(--color-text-secondary)" }}>
                <span style={{ color: "var(--color-border-light)" }}>•</span>
                <div className="flex-1">
                  {typeof item === "object" && item !== null
                    ? (item.Q && item.A ? <><span className="font-medium" style={{ color: "var(--color-primary-light)" }}>Q: {item.Q}</span><br/>A: {item.A}</> : JSON.stringify(item))
                    : String(item)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.建議行動 && content.建議行動.length > 0 && (
        <section className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-primary-light)" }}>💡 建議行動</h3>
          <ul className="space-y-1.5">
            {content.建議行動.map((item, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: "var(--color-text-secondary)" }}>
                <span style={{ color: "var(--color-border-light)" }}>•</span>
                <div className="flex-1">{typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
