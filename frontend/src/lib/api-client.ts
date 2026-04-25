/** API 基礎 URL */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * 通用 API 呼叫封裝。
 * 自動附加 base URL 與錯誤處理。
 *
 * @param path - API 路徑 (e.g. "/api/meetings/upload")
 * @param options - fetch 的原始選項
 * @returns 解析後的 JSON 回應
 */
export async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, options);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `API Error: ${res.status}`);
  }
  return res.json();
}
