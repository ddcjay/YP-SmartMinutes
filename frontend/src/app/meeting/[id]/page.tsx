"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Download, RefreshCw, CheckCircle2, Loader2,
  XCircle, Clock, FileText, Subtitles, FileDown, ChevronDown,
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Pencil, Check, X,
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

/** 逐字稿段落型別 */
interface TranscriptSegment {
  id: number;
  start_time: number;
  end_time: number;
  content: string;
  is_edited?: boolean;
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

  // ===== 音檔播放器狀態 =====
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  /** 目前正在播放的逐字稿段落 ID（用於高亮標記） */
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);

  // ===== 行內編輯狀態 =====
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 處理完成後載入完整資料
  useEffect(() => {
    if (isComplete) {
      apiFetch<{ data: Record<string, unknown> }>(`/api/meetings/${meetingId}`)
        .then((res) => setMeeting(res.data))
        .catch(console.error);
    }
  }, [isComplete, meetingId]);

  // ===== 音檔播放控制 =====

  /** 音檔時間更新時，自動追蹤目前對應的逐字稿段落 */
  useEffect(() => {
    if (!meeting) return;
    const transcripts = meeting.transcripts as TranscriptSegment[] | undefined;
    if (!transcripts) return;

    // 找出目前時間點所屬的段落
    const active = transcripts.find(
      (t) => currentTime >= t.start_time && currentTime <= t.end_time
    );
    if (active) {
      setActiveSegmentId(active.id);
    }
  }, [currentTime, meeting]);

  /** 自動捲動到目前播放的段落 */
  useEffect(() => {
    if (activeSegmentId === null) return;
    const el = document.getElementById(`seg-${activeSegmentId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeSegmentId]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    if (!isPlaying) {
      audio.play();
    }
  }, [isPlaying]);

  const skip = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + delta, duration));
  }, [duration]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // ===== 逐字稿編輯 =====

  const startEdit = useCallback((seg: TranscriptSegment) => {
    setEditingId(seg.id);
    setEditText(seg.content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
  }, []);

  const saveEdit = useCallback(async (segId: number) => {
    if (!editText.trim()) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/meetings/${meetingId}/transcripts/${segId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: segId, content: editText.trim() }),
      });
      // 更新本地狀態，避免重新拉取
      setMeeting((prev) => {
        if (!prev) return prev;
        const transcripts = (prev.transcripts as TranscriptSegment[]).map((t) =>
          t.id === segId ? { ...t, content: editText.trim(), is_edited: true } : t
        );
        return { ...prev, transcripts };
      });
      setEditingId(null);
      setEditText("");
    } catch (e) {
      console.error("Save transcript failed:", e);
    } finally {
      setIsSaving(false);
    }
  }, [meetingId, editText]);

  // ===== 其他 =====

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
    window.location.href = `${API_BASE_URL}/api/meetings/${meetingId}/export/${fmt}`;
    setShowExport(false);
  }, [meetingId]);

  const currentStepIdx = getStepIndex(progress.status);

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      {/* 隱藏的 audio 元素 */}
      {isComplete && (
        <audio
          ref={audioRef}
          src={`${API_BASE_URL}/api/meetings/${meetingId}/audio`}
          preload="metadata"
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

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
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden" style={{ marginBottom: isComplete ? "72px" : 0 }}>
          {/* 左側：逐字稿（可編輯） */}
          <div className="flex flex-col overflow-hidden" style={{ borderRight: "1px solid var(--color-border)" }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold flex items-center gap-2">
                <Subtitles size={16} style={{ color: "var(--color-primary-light)" }} />
                完整逐字稿
              </h2>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                點擊時間跳轉播放 · 點擊 ✏️ 編輯文字
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-1">
              {(meeting.transcripts as TranscriptSegment[])?.map((t) => (
                <div
                  key={t.id}
                  id={`seg-${t.id}`}
                  className="flex gap-3 py-2 px-3 rounded-lg transition-all group"
                  style={{
                    background: activeSegmentId === t.id ? "rgba(99,102,241,0.12)" : undefined,
                    border: activeSegmentId === t.id ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent",
                  }}
                >
                  {/* 時間戳按鈕：點擊跳轉播放 */}
                  <button
                    className="text-xs font-mono shrink-0 pt-0.5 hover:underline cursor-pointer flex items-center gap-1 transition-colors"
                    style={{
                      color: activeSegmentId === t.id ? "var(--color-primary)" : "var(--color-primary-light)",
                      minWidth: "70px",
                    }}
                    onClick={() => seekTo(t.start_time)}
                    title={`跳轉至 ${formatTime(t.start_time)} 播放`}
                  >
                    <Play size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    {formatTime(t.start_time)}
                  </button>

                  {/* 逐字稿內容：展示或編輯模式 */}
                  {editingId === t.id ? (
                    <div className="flex-1 flex flex-col gap-2">
                      <textarea
                        className="w-full text-sm leading-relaxed px-3 py-2 rounded-lg resize-none"
                        style={{
                          background: "var(--color-bg-base)",
                          border: "1px solid var(--color-primary)",
                          color: "var(--color-text-primary)",
                          outline: "none",
                        }}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit(t.id);
                          }
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition"
                          style={{ background: "var(--color-success)", color: "#fff" }}
                          onClick={() => saveEdit(t.id)}
                          disabled={isSaving}
                        >
                          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          儲存
                        </button>
                        <button
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition"
                          style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)" }}
                          onClick={cancelEdit}
                        >
                          <X size={12} />
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-start gap-2">
                      <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--color-text-primary)" }}>
                        {t.content}
                        {t.is_edited && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "var(--color-primary-light)" }}>
                            已修訂
                          </span>
                        )}
                      </p>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-[var(--color-bg-hover)]"
                        onClick={() => startEdit(t)}
                        title="編輯此段文字"
                      >
                        <Pencil size={13} style={{ color: "var(--color-text-muted)" }} />
                      </button>
                    </div>
                  )}
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

      {/* 底部音檔播放器（固定在畫面最下方） */}
      {isComplete && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-4 px-6 py-3"
          style={{
            background: "var(--color-bg-elevated)",
            borderTop: "1px solid var(--color-border)",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* 播放控制按鈕組 */}
          <div className="flex items-center gap-2">
            <button onClick={() => skip(-5)} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition" title="倒退 5 秒">
              <SkipBack size={16} style={{ color: "var(--color-text-secondary)" }} />
            </button>
            <button
              onClick={togglePlay}
              className="p-2.5 rounded-full transition-all"
              style={{ background: "var(--gradient-primary)", color: "#fff" }}
              title={isPlaying ? "暫停" : "播放"}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button onClick={() => skip(5)} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition" title="快進 5 秒">
              <SkipForward size={16} style={{ color: "var(--color-text-secondary)" }} />
            </button>
          </div>

          {/* 目前時間 */}
          <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-text-secondary)", minWidth: "46px" }}>
            {formatTime(currentTime)}
          </span>

          {/* 進度條（可拖拉） */}
          <div className="flex-1 relative group">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              className="audio-slider w-full"
              style={{ accentColor: "var(--color-primary-light)" }}
            />
          </div>

          {/* 總時長 */}
          <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-text-secondary)", minWidth: "46px" }}>
            {formatTime(duration)}
          </span>

          {/* 靜音按鈕 */}
          <button onClick={toggleMute} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition" title={isMuted ? "取消靜音" : "靜音"}>
            {isMuted ? (
              <VolumeX size={16} style={{ color: "var(--color-text-muted)" }} />
            ) : (
              <Volume2 size={16} style={{ color: "var(--color-text-secondary)" }} />
            )}
          </button>
        </div>
      )}
    </main>
  );
}

/** 秒數格式化為 MM:SS */
function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** 摘要結構型別 */
interface SummaryData {
  摘要總覽?: string;
  待辦項目?: Array<{ 負責人: string; 事項: string } | string>;
  重點記錄?: any[];
  建議行動?: any[];
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
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--color-primary-light)" }}>
            💡 建議行動
          </h3>
          <ul className="space-y-1.5">
            {content.建議行動.map((item, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: "var(--color-text-secondary)" }}>
                <span style={{ color: "var(--color-border-light)" }}>•</span>
                <div className="flex-1">
                  {typeof item === "object" && item !== null
                    ? JSON.stringify(item)
                    : String(item)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
