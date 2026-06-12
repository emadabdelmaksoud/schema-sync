// Maps low-level network failures (e.g. "Failed to fetch" when the
// connection drops mid-request) to a clear, user-friendly message.
export function friendlyNetworkError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Load failed") ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  ) {
    return new Error(
      "No internet connection — the save didn't reach the server. Check your connection and try again.",
    );
  }
  return e instanceof Error ? e : new Error(msg);
}