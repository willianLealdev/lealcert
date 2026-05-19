/**
 * Extracts a human-readable error message from a customFetch ApiError.
 * ApiError stores the parsed response body at `error.data`, not `error.response.data`.
 */
export function getApiError(e: unknown, fallback = "Erro inesperado."): string {
  if (!e || typeof e !== "object") return fallback;
  const data = (e as { data?: { error?: string } }).data;
  if (data?.error) return data.error;
  const msg = (e as Error).message;
  if (msg && !msg.startsWith("HTTP ")) return msg;
  if (msg) {
    const colonIdx = msg.indexOf(": ");
    if (colonIdx !== -1) return msg.slice(colonIdx + 2);
  }
  return fallback;
}
