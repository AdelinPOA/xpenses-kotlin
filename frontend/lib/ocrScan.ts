"use client";

import api, { OCRScanResult } from "./api";

/** Compresses image receipts client-side (max 1600px JPEG) before upload. */
export async function compressImage(file: File): Promise<Blob | File> {
  const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
  if (!isImage) return Promise.resolve(file);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round(width / (height / maxDim)); height = maxDim; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.8);
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

export type ScanPhase = "uploading" | "reading";

export interface ScanProgress {
  phase: ScanPhase;
  elapsedSeconds: number;
}

/** Raised when the user cancels the scan. */
export class ScanCancelledError extends Error {}
/** Raised when the OCR job exceeds the total wait cap. */
export class ScanTimeoutError extends Error {}
/** Raised when the backend reports the OCR job failed. */
export class ScanJobError extends Error {
  constructor(public detail?: string) {
    super(detail ?? "OCR job failed");
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });

export interface ScanOptions {
  onProgress?: (p: ScanProgress) => void;
  signal?: AbortSignal;
  /** Total wait cap for the whole scan (default 60s). */
  maxWaitMs?: number;
}

/**
 * Uploads a receipt for OCR and polls until completion.
 * Throws ScanCancelledError / ScanTimeoutError / ScanJobError so callers
 * can map failures to localized messages.
 */
export async function scanReceipt(file: File, opts: ScanOptions = {}): Promise<OCRScanResult> {
  const { onProgress, signal, maxWaitMs = 60_000 } = opts;
  const startedAt = Date.now();

  // Elapsed-seconds ticker once we reach the polling phase.
  let ticker: ReturnType<typeof setInterval> | null = null;
  const stopTicker = () => {
    if (ticker) { clearInterval(ticker); ticker = null; }
  };
  if (onProgress) {
    onProgress({ phase: "uploading", elapsedSeconds: 0 });
  }

  try {
    const compressedBlob = await compressImage(file);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const fd = new FormData();
    fd.append("file", compressedBlob, file.name);
    const res = await api.post("/ocr/scan", fd, { signal });

    let result: OCRScanResult | undefined;
    if (res.status === 202 && res.data.status_url) {
      onProgress?.({ phase: "reading", elapsedSeconds: Math.round((Date.now() - startedAt) / 1000) });
      ticker = setInterval(() => {
        onProgress?.({ phase: "reading", elapsedSeconds: Math.round((Date.now() - startedAt) / 1000) });
      }, 1000);

      const deadline = startedAt + maxWaitMs;
      while (Date.now() < deadline) {
        await sleep(1500, signal);
        const statusRes = await api.get(res.data.status_url, { signal });
        if (statusRes.data.status === "completed") {
          result = {
            ...(statusRes.data.result ?? {}),
            expense_id: statusRes.data.expense_id,
            receipt_id: statusRes.data.receipt_id,
            error_code: statusRes.data.error_code,
          } as OCRScanResult;
          break;
        }
        if (statusRes.data.status === "failed") {
          throw new ScanJobError(statusRes.data.error);
        }
      }
      if (!result) throw new ScanTimeoutError();
    } else {
      result = res.data as OCRScanResult;
    }

    onProgress?.({ phase: "reading", elapsedSeconds: Math.round((Date.now() - startedAt) / 1000) });
    return result;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new ScanCancelledError();
    throw e;
  } finally {
    stopTicker();
  }
}
