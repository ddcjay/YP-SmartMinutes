"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Subtitles, Pencil, Check, X, Loader2,
} from "lucide-react";
import { apiFetch, API_BASE_URL } from "@/lib/api-client";

interface TranscriptSegment {
  id: number;
  start_time: number;
  end_time: number;
  content: string;
  is_edited?: boolean;
}

interface TranscriptEditorProps {
  meetingId: string;
  meeting: Record<string, unknown>;
  onMeetingUpdate: (data: Record<string, unknown>) => void;
}

/**
 * 逐字稿編輯頁面元件。
 * 整合音檔播放器、時間戳跳轉、行內編輯功能。
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

  const transcripts = meeting.transcripts as TranscriptSegment[] | undefined;

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

  const cyclePlaybackRate = useCallback(() => {
    const next = playbackRate >= 2.0 ? 1.0 : Math.round((playbackRate + 0.2) * 10) / 10;
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [playbackRate]);

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ marginBottom: "72px" }}>
      {/* 隱藏 audio 元素 */}
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
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <h2 className="font-semibold flex items-center gap-2">
          <Subtitles size={16} style={{ color: "var(--color-primary-light)" }} />
          完整逐字稿
        </h2>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          點擊時間跳轉播放 · 雙擊文字編輯
        </p>
      </div>

      {/* 逐字稿列表 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1 max-w-4xl mx-auto w-full">
        {transcripts?.map((t) => (
          <div
            key={t.id}
            id={`seg-${t.id}`}
            className="flex gap-3 py-2 px-3 rounded-lg transition-all group"
            style={{
              background: activeSegmentId === t.id ? "rgba(99,102,241,0.12)" : undefined,
              border: activeSegmentId === t.id ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent",
            }}
          >
            <button
              className="text-xs font-mono shrink-0 pt-0.5 hover:underline cursor-pointer flex items-center gap-1 transition-colors"
              style={{ color: activeSegmentId === t.id ? "var(--color-primary)" : "var(--color-primary-light)", minWidth: "70px" }}
              onClick={() => seekTo(t.start_time)}
              title={`跳轉至 ${formatTime(t.start_time)} 播放`}
            >
              <Play size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              {formatTime(t.start_time)}
            </button>

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

        <button onClick={cyclePlaybackRate} className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg hover:bg-[var(--color-bg-hover)] transition" style={{ color: playbackRate !== 1.0 ? "var(--color-primary-light)" : "var(--color-text-secondary)", minWidth: "42px" }} title="切換播放速度">
          {playbackRate.toFixed(1)}x
        </button>
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
