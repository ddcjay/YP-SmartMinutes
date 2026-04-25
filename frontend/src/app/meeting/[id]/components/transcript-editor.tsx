"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Subtitles, Pencil, Check, X, Loader2, Users, Sparkles,
} from "lucide-react";
import { apiFetch, API_BASE_URL } from "@/lib/api-client";

interface TranscriptSegment {
  id: number;
  start_time: number;
  end_time: number;
  content: string;
  speaker_label?: string | null;
  is_edited?: boolean;
}

interface TranscriptEditorProps {
  meetingId: string;
  meeting: Record<string, unknown>;
  onMeetingUpdate: (data: Record<string, unknown>) => void;
}

/**
 * 逐字稿編輯頁面元件。
 * 整合音檔播放器、時間戳跳轉、行內編輯、語者標註功能。
 */
export default function TranscriptEditor({ meetingId, meeting, onMeetingUpdate }: TranscriptEditorProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);

  // 編輯狀態
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 語者標註狀態
  const [speakerEditId, setSpeakerEditId] = useState<number | null>(null);
  const [speakerName, setSpeakerName] = useState("");
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifyMessage, setIdentifyMessage] = useState("");

  const transcripts = meeting.transcripts as TranscriptSegment[] | undefined;

  // 收集目前已有的發言者清單（用於快速選取）
  const knownSpeakers = Array.from(
    new Set((transcripts ?? []).map((t) => t.speaker_label).filter(Boolean) as string[])
  );

  // 收集使用者已標註的段落（用於送給 AI）
  const labeledSegments = (transcripts ?? [])
    .filter((t) => t.speaker_label)
    .map((t) => ({ id: t.id, speaker_label: t.speaker_label! }));

  // 追蹤目前播放段落
  useEffect(() => {
    if (!transcripts) return;
    const active = transcripts.find(
      (t) => currentTime >= t.start_time && currentTime <= t.end_time
    );
    if (active) setActiveSegmentId(active.id);
  }, [currentTime, transcripts]);

  // 自動捲動
  useEffect(() => {
    if (activeSegmentId === null) return;
    const el = document.getElementById(`seg-${activeSegmentId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSegmentId]);

  // ===== 播放控制 =====
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    isPlaying ? audio.pause() : audio.play();
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    if (!isPlaying) audio.play();
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

  const changeVolume = useCallback((val: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = val;
    setVolume(val);
    if (val === 0) { audio.muted = true; setIsMuted(true); }
    else if (isMuted) { audio.muted = false; setIsMuted(false); }
  }, [isMuted]);

  const changePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  // ===== 逐字稿編輯 =====
  const startEdit = useCallback((seg: TranscriptSegment) => {
    // NOTE: 進入編輯模式時自動暫停播放，避免干擾校對
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
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
      onMeetingUpdate({
        ...meeting,
        transcripts: (meeting.transcripts as TranscriptSegment[]).map((t) =>
          t.id === segId ? { ...t, content: editText.trim(), is_edited: true } : t
        ),
      });
      setEditingId(null);
      setEditText("");
    } catch (e) {
      console.error("Save transcript failed:", e);
    } finally {
      setIsSaving(false);
    }
  }, [meetingId, editText, meeting, onMeetingUpdate]);

  // ===== 語者標註 =====
  const saveSpeaker = useCallback((segId: number, name: string) => {
    const label = name.trim() || null;
    onMeetingUpdate({
      ...meeting,
      transcripts: (meeting.transcripts as TranscriptSegment[]).map((t) =>
        t.id === segId ? { ...t, speaker_label: label } : t
      ),
    });
    setSpeakerEditId(null);
    setSpeakerName("");
  }, [meeting, onMeetingUpdate]);

  /** 呼叫 AI 語者辨識 API（SSE 串流，即時顯示進度） */
  const identifySpeakers = useCallback(async () => {
    if (labeledSegments.length === 0) {
      alert("請先點擊段落左側的「👤」圖示，為至少一段逐字稿標註發言者名稱。");
      return;
    }
    setIsIdentifying(true);
    setIdentifyMessage("正在送出請求...");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/meetings/${meetingId}/transcripts/identify-speakers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labeled_segments: labeledSegments }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error("API 請求失敗");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // NOTE: 累積所有批次的辨識結果，最終一次性合併
      const allResults = new Map<number, string>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "start") {
              setIdentifyMessage(event.message);
            } else if (event.type === "progress") {
              setIdentifyMessage(event.message);
              // 每批結果即時合併到地圖中
              for (const r of event.results || []) {
                allResults.set(r.id, r.speaker_label);
              }
              // 即時更新畫面
              onMeetingUpdate({
                ...meeting,
                transcripts: (meeting.transcripts as TranscriptSegment[]).map((t) => ({
                  ...t,
                  speaker_label: allResults.get(t.id) ?? t.speaker_label,
                })),
              });
            } else if (event.type === "done") {
              setIdentifyMessage(event.message);
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.includes("JSON")) throw parseErr;
          }
        }
      }
    } catch (e: any) {
      console.error("Speaker identification failed:", e);
      alert(`語者辨識失敗：${e.message || "未知錯誤"}`);
      setIdentifyMessage("");
    } finally {
      setIsIdentifying(false);
      // 3 秒後清除訊息
      setTimeout(() => setIdentifyMessage(""), 3000);
    }
  }, [meetingId, meeting, labeledSegments, onMeetingUpdate]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ marginBottom: "72px" }}>
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

      {/* 標題列 */}
      <div className="px-6 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <h2 className="font-semibold flex items-center gap-2">
          <Subtitles size={16} style={{ color: "var(--color-primary-light)" }} />
          完整逐字稿
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            點擊時間跳轉 · 雙擊文字編輯 · 點擊 👤 標註發言者
          </p>
          <button
            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
            onClick={identifySpeakers}
            disabled={isIdentifying || labeledSegments.length === 0}
            title={labeledSegments.length === 0 ? "請先標註至少一段發言者" : `已標註 ${labeledSegments.length} 段，點擊開始 AI 辨識`}
          >
            {isIdentifying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isIdentifying ? "辨識中..." : "AI 語者辨識"}
          </button>
          {identifyMessage && (
            <span className="text-xs px-3 py-1.5 rounded-lg animate-fade-up" style={{ background: "rgba(99,102,241,0.1)", color: "var(--color-primary-light)" }}>
              {identifyMessage}
            </span>
          )}
        </div>
      </div>

      {/* 逐字稿列表 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1 max-w-4xl mx-auto w-full">
        {transcripts?.map((t) => (
          <div
            key={t.id}
            id={`seg-${t.id}`}
            className="flex gap-2 py-2 px-3 rounded-lg transition-all group"
            style={{
              background: activeSegmentId === t.id ? "rgba(99,102,241,0.12)" : undefined,
              border: activeSegmentId === t.id ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent",
            }}
          >
            {/* 語者標註按鈕 */}
            <div className="shrink-0 pt-0.5" style={{ minWidth: "80px" }}>
              {speakerEditId === t.id ? (
                <div className="flex items-center gap-1">
                  <input
                    className="text-xs px-1.5 py-1 rounded w-16"
                    style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-primary)", color: "var(--color-text-primary)", outline: "none" }}
                    value={speakerName}
                    onChange={(e) => setSpeakerName(e.target.value)}
                    placeholder="名稱"
                    autoFocus
                    list="known-speakers"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSpeaker(t.id, speakerName);
                      if (e.key === "Escape") { setSpeakerEditId(null); setSpeakerName(""); }
                    }}
                    onBlur={() => saveSpeaker(t.id, speakerName)}
                  />
                </div>
              ) : (
                <button
                  className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded transition hover:bg-[var(--color-bg-hover)]"
                  style={{ color: t.speaker_label ? "var(--color-warning)" : "var(--color-text-muted)" }}
                  onClick={() => { setSpeakerEditId(t.id); setSpeakerName(t.speaker_label || ""); }}
                  title="標註發言者"
                >
                  <Users size={11} />
                  {t.speaker_label || "👤"}
                </button>
              )}
            </div>

            {/* 時間戳 */}
            <button
              className="text-xs font-mono shrink-0 pt-0.5 hover:underline cursor-pointer flex items-center gap-1 transition-colors"
              style={{ color: activeSegmentId === t.id ? "var(--color-primary)" : "var(--color-primary-light)", minWidth: "55px" }}
              onClick={() => seekTo(t.start_time)}
              title={`跳轉至 ${formatTime(t.start_time)} 播放`}
            >
              <Play size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              {formatTime(t.start_time)}
            </button>

            {/* 逐字稿內容 */}
            {editingId === t.id ? (
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  className="w-full text-sm leading-relaxed px-3 py-2 rounded-lg resize-none"
                  style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-primary)", color: "var(--color-text-primary)", outline: "none" }}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(t.id); }
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <div className="flex gap-2">
                  <button className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--color-success)", color: "#fff" }} onClick={() => saveEdit(t.id)} disabled={isSaving}>
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} 儲存
                  </button>
                  <button className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)" }} onClick={cancelEdit}>
                    <X size={12} /> 取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-start gap-2">
                <p className="text-sm leading-relaxed flex-1 cursor-text" style={{ color: "var(--color-text-primary)" }} onDoubleClick={() => startEdit(t)} title="雙擊編輯">
                  {t.content}
                  {t.is_edited && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "var(--color-primary-light)" }}>已修訂</span>
                  )}
                </p>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-[var(--color-bg-hover)]" onClick={() => startEdit(t)} title="編輯此段文字">
                  <Pencil size={13} style={{ color: "var(--color-text-muted)" }} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 已知發言者 datalist（供輸入框自動完成） */}
      <datalist id="known-speakers">
        {knownSpeakers.map((s) => <option key={s} value={s} />)}
      </datalist>

      {/* 底部播放器 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-4 px-6 py-3" style={{ background: "var(--color-bg-elevated)", borderTop: "1px solid var(--color-border)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-2">
          <button onClick={() => skip(-5)} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition" title="倒退 5 秒">
            <SkipBack size={16} style={{ color: "var(--color-text-secondary)" }} />
          </button>
          <button onClick={togglePlay} className="p-2.5 rounded-full transition-all" style={{ background: "var(--gradient-primary)", color: "#fff" }} title={isPlaying ? "暫停" : "播放"}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button onClick={() => skip(5)} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition" title="快進 5 秒">
            <SkipForward size={16} style={{ color: "var(--color-text-secondary)" }} />
          </button>
        </div>

        <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-text-secondary)", minWidth: "46px" }}>{formatTime(currentTime)}</span>

        <div className="flex-1">
          <input type="range" min={0} max={duration || 1} step={0.1} value={currentTime} onChange={(e) => seekTo(parseFloat(e.target.value))} className="audio-slider w-full" />
        </div>

        <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-text-secondary)", minWidth: "46px" }}>{formatTime(duration)}</span>

        <div className="flex items-center gap-1.5">
          <button onClick={toggleMute} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition" title={isMuted ? "取消靜音" : "靜音"}>
            {isMuted || volume === 0 ? <VolumeX size={16} style={{ color: "var(--color-text-muted)" }} /> : <Volume2 size={16} style={{ color: "var(--color-text-secondary)" }} />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} onChange={(e) => changeVolume(parseFloat(e.target.value))} className="audio-slider w-20" title={`音量 ${Math.round((isMuted ? 0 : volume) * 100)}%`} />
        </div>

        <select
          value={playbackRate}
          onChange={(e) => changePlaybackRate(parseFloat(e.target.value))}
          className="text-xs font-mono font-semibold px-2 py-1 rounded-lg cursor-pointer"
          style={{ background: "var(--color-bg-hover)", color: playbackRate !== 1.0 ? "var(--color-primary-light)" : "var(--color-text-secondary)", border: "1px solid var(--color-border)", outline: "none" }}
          title="播放速度"
        >
          {[1.0, 1.2, 1.4, 1.6, 1.8, 2.0].map((r) => (
            <option key={r} value={r}>{r.toFixed(1)}x</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
