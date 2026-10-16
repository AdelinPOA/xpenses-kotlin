"use client";

import api from "./api";
import type { OCRScanResult } from "./types/expense";

/** Compresses image receipts client-side (max 1600px JPEG) before upload. */
export async function compressImage(file: File): Promise<Blob | File> {
  const isImage =
    file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
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
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round(width / (height / maxDim));
            height = maxDim;
          }
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

export interface OcrJobReference {
  jobId: number;
  statusUrl: string;
}

/** Raised when the user cancels the scan. */
export class ScanCancelledError extends Error {
  constructor() {
    super("OCR_CAPTURE_CANCELLED");
    this.name = "ScanCancelledError";
  }
}

/** Raised when the OCR job exceeds the total wait cap. */
export class ScanTimeoutError extends Error {
  constructor(public jobId?: number) {
    super("OCR_JOB_TIMEOUT");
    this.name = "ScanTimeoutError";
  }
}

/** Raised when OCR cannot produce a promoted Expense and Receipt. */
export class ScanJobError extends Error {
  constructor(
    public detail?: string,
    public errorCode?: string,
    public jobId?: number,
  ) {
    super(detail ?? errorCode ?? "OCR_JOB_FAILED");
    this.name = "ScanJobError";
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
  });

export interface ScanOptions {
  onProgress?: (p: ScanProgress) => void;
  signal?: AbortSignal;
  /** Total wait cap for the whole scan (default 5 minutes for provider fallbacks). */
  maxWaitMs?: number;
  /** Persist the server job before polling starts. */
  onJobCreated?: (job: OcrJobReference) => void | Promise<void>;
  /** Unmounts release a durable job; explicit cancellation deletes it. */
  cancelRemoteJobOnAbort?: boolean | (() => boolean);
}

/** The durable pipeline outcome shared by all receipt-capture callers. */
export interface ReceiptCapture {
  kind: "promoted";
  result: OCRScanResult;
  expenseId: number;
  receiptId: number;
  needsDetails: boolean;
}

/**
 * Maps a completed OCR result to the promoted outcome expected by callers.
 * A response without both durable IDs is malformed and must not be submitted
 * again as a new Expense with the original image attached a second time.
 */
export function interpretReceiptCapture(result: OCRScanResult): ReceiptCapture {
  const expenseId = result.expense_id;
  const receiptId = result.receipt_id;
  if (expenseId != null && receiptId != null) {
    return {
      kind: "promoted",
      result,
      expenseId,
      receiptId,
      needsDetails: needsReceiptDetails(result),
    };
  }
  throw new ScanJobError(
    undefined,
    result.error_code ?? "OCR_PROMOTION_MISSING",
  );
}

/** Keeps the capture feed and the form aligned on when OCR needs human review. */
function needsReceiptDetails(result: OCRScanResult): boolean {
  return (
    !result.amount ||
    result.fallback === "photo_only" ||
    Boolean(result.error_code) ||
    (result.warnings?.length ?? 0) > 0
  );
}

/** Treats browser and Axios aborts as one outcome. */
export function isReceiptCaptureCancelled(error: unknown): boolean {
  return error instanceof ScanCancelledError || isAbortLikeError(error);
}

function isAbortLikeError(error: unknown): boolean {
  return (
    hasErrorName(error, "AbortError") ||
    hasErrorName(error, "CanceledError") ||
    hasErrorCode(error, "ERR_CANCELED")
  );
}

function hasErrorName(error: unknown, name: string): boolean {
  if (typeof error !== "object" || error === null || !("name" in error))
    return false;
  return (error as { name?: unknown }).name === name;
}

function hasErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error))
    return false;
  return (error as { code?: unknown }).code === code;
}

function shouldCancelRemoteJob(opts: ScanOptions): boolean {
  const choice = opts.cancelRemoteJobOnAbort;
  return typeof choice === "function" ? choice() : choice !== false;
}

function cancelRemoteJobOnAbort(
  error: unknown,
  remoteJobId: number | null,
  opts: ScanOptions,
): never {
  if (isAbortLikeError(error)) {
    if (remoteJobId !== null && shouldCancelRemoteJob(opts)) {
      void api.delete(`/ocr/jobs/${remoteJobId}`).catch(() => undefined);
    }
    throw new ScanCancelledError();
  }
  throw error;
}

async function pollOcrJob(
  statusUrl: string,
  remoteJobId: number | null,
  opts: ScanOptions,
): Promise<OCRScanResult> {
  const { onProgress, signal, maxWaitMs = 5 * 60_000 } = opts;
  const startedAt = Date.now();
  let ticker: ReturnType<typeof setInterval> | null = null;
  const stopTicker = () => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };

  onProgress?.({ phase: "reading", elapsedSeconds: 0 });
  ticker = setInterval(() => {
    onProgress?.({
      phase: "reading",
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  }, 1000);

  try {
    const deadline = startedAt + maxWaitMs;
    while (Date.now() < deadline) {
      await sleep(1500, signal);
      const statusRes = await api.get(statusUrl, { signal });
      const data = statusRes.data as {
        status?: string;
        result?: Partial<OCRScanResult>;
        expense_id?: number | null;
        receipt_id?: number | null;
        error_code?: string | null;
        fallback?: string | null;
        fallback_reason?: string | null;
        provider_error?: string | null;
        error?: string;
      };
      if (data.status === "completed") {
        const result = data.result ?? {};
        return {
          ...result,
          expense_id: data.expense_id ?? result.expense_id,
          receipt_id: data.receipt_id ?? result.receipt_id,
          error_code: data.error_code ?? result.error_code,
          fallback: data.fallback ?? result.fallback,
          fallback_reason: data.fallback_reason ?? result.fallback_reason,
          provider_error: data.provider_error ?? result.provider_error,
          warnings: result.warnings ?? [],
        } as OCRScanResult;
      }
      if (data.status === "failed") {
        throw new ScanJobError(
          data.error,
          data.error_code ?? undefined,
          remoteJobId ?? undefined,
        );
      }
    }
    throw new ScanTimeoutError(remoteJobId ?? undefined);
  } finally {
    stopTicker();
  }
}

/**
 * Uploads a receipt for OCR, polls until completion, and interprets the result
 * for both the batch capture feed and the Expense form.
 */
export async function captureReceipt(
  file: File,
  opts: ScanOptions = {},
): Promise<ReceiptCapture> {
  return interpretReceiptCapture(await scanReceipt(file, opts));
}

/** Resume an existing durable OcrJob without uploading its source again. */
export async function resumeReceiptCapture(
  jobId: number,
  statusUrl = `/ocr/status/${jobId}`,
  opts: ScanOptions = {},
): Promise<ReceiptCapture> {
  try {
    return interpretReceiptCapture(await pollOcrJob(statusUrl, jobId, opts));
  } catch (error: unknown) {
    return cancelRemoteJobOnAbort(error, jobId, opts);
  }
}

/**
 * Performs the transport and polling portion of receipt capture.
 * Kept exported through ocrScan.ts for compatibility with older callers.
 */
export async function scanReceipt(
  file: File,
  opts: ScanOptions = {},
): Promise<OCRScanResult> {
  const { onProgress, signal } = opts;
  let remoteJobId: number | null = null;

  if (onProgress) {
    onProgress({ phase: "uploading", elapsedSeconds: 0 });
  }

  try {
    const compressedBlob = await compressImage(file);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const fd = new FormData();
    fd.append("file", compressedBlob, file.name);
    const res = await api.post("/ocr/scan", fd, { signal });

    if (res.status === 202 && res.data.status_url) {
      remoteJobId =
        typeof res.data.job_id === "number" ? res.data.job_id : null;
      const statusUrl = res.data.status_url as string;
      if (remoteJobId !== null) {
        await opts.onJobCreated?.({ jobId: remoteJobId, statusUrl });
      }
      return await pollOcrJob(statusUrl, remoteJobId, opts);
    }

    return res.data as OCRScanResult;
  } catch (error: unknown) {
    return cancelRemoteJobOnAbort(error, remoteJobId, opts);
  }
}
