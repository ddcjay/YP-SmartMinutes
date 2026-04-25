"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_BASE_URL } from "@/lib/api-client";

interface ProgressData {
  status: string;
  progress: number;
  message: string;
}

/**
 * SSE 進度訂閱 Hook。
 * 透過 EventSource 訂閱後端的 SSE 端點，即時接收處理進度。
 *
 * @param meetingId - 會議 UUID，傳入 null 時不訂閱
 * @returns 目前的進度資料
 */
export function useSse(meetingId: string | null) {
  const [progress, setProgress] = useState<ProgressData>({
    status: "idle",
    progress: 0,
    message: "",
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!meetingId) return;

    disconnect();

    const es = new EventSource(`${API_BASE_URL}/api/meetings/${meetingId}/progress`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: ProgressData = JSON.parse(event.data);
        setProgress(data);

        // 完成或失敗後自動斷開連線
        if (data.status === "completed" || data.status === "failed") {
          es.close();
        }
      } catch (e) {
        console.error("Failed to parse SSE data:", e);
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [meetingId, disconnect]);

  return progress;
}
