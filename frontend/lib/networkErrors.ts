"use client";

/**
 * Classifies transport failures shared by the OCR and offline-save adapters.
 * HTTP responses are deliberately excluded: a reachable server error is not
 * the same as a request that never reached the server.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as {
    response?: unknown;
    request?: unknown;
    code?: unknown;
  };
  if (candidate.response != null) return false;
  if (candidate.code === "ERR_NETWORK" || candidate.code === "ECONNABORTED") {
    return true;
  }
  if (candidate.request != null) return true;
  return error instanceof Error && /network|fetch|offline/i.test(error.message);
}

/** Network and transient server failures can safely leave durable work queued. */
export function isRetryableFailure(error: unknown): boolean {
  if (isNetworkFailure(error)) return true;
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    response?: { status?: unknown };
    status?: unknown;
  };
  const status = candidate.response?.status ?? candidate.status;
  return (
    typeof status === "number" &&
    (status === 408 || status === 425 || status === 429 || status >= 500)
  );
}
