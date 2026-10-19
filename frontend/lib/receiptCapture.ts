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

/** Raised when the user cancels the scan. */
export class ScanCancelledError extends Error {}
/** Raised when the OCR job exceeds the total wait cap. */
export class ScanTimeoutError extends Error {}
/** Raised when OCR cannot produce a promoted Expense and Receipt. */
export class ScanJobError extends Error {
  constructor(public detail?: string) {
    super(detail ?? "OCR job failed");
  }
}

/** Upload reached the transport but did not yield a usable acceptance identity. */
export class ScanUploadError extends Error {
  constructor(
    public definitelyRejected: boolean,
    public originalError?: unknown,
  ) {
    super(
      definitelyRejected
        ? "OCR upload rejected"
        : "OCR upload acceptance could not be confirmed",
    );
  }
}

/** Keep a received identity available even if local acknowledgement fails. */
export class ScanAcceptancePersistenceError extends Error {
  constructor(
    public remoteJobId: number,
    public originalError: unknown,
  ) {
    super(
      typeof (originalError as { message?: unknown } | null)?.message ===
        "string"
        ? (originalError as { message: string }).message
        : "Could not persist OCR acceptance",
    );
  }
}

function isDefinitiveUploadRejection(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status;
  return (
    status !== undefined &&
    [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(status)
  );
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
  /** Resume an acknowledged job without uploading the source a second time. */
  resumeJobId?: number;
  /** Commit the possibly-sent marker before POST, so reload cannot blindly re-upload. */
  onUploading?: () => Promise<void>;
  /** Must commit the accepted ID locally before polling starts, including resume. */
  onAccepted?: (jobId: number) => Promise<void>;
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
  throw new ScanJobError();
}

/** Keeps the capture feed and the form aligned on when OCR needs human review. */
function needsReceiptDetails(result: OCRScanResult): boolean {
  return (
    !result.amount ||
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

/**
 * Performs the transport and polling portion of receipt capture.
 * Kept exported through ocrScan.ts for compatibility with older callers.
 */
export async function scanReceipt(
  file: File,
  opts: ScanOptions = {},
): Promise<OCRScanResult> {
  const { onProgress, signal, maxWaitMs = 5 * 60_000 } = opts;
  const startedAt = Date.now();
  const resumeJobId = opts.resumeJobId;
  if (
    resumeJobId !== undefined &&
    (!Number.isSafeInteger(resumeJobId) || resumeJobId <= 0)
  ) {
    throw new ScanJobError("Invalid OCR job ID");
  }

  // Elapsed-seconds ticker once we reach the polling phase.
  let ticker: ReturnType<typeof setInterval> | null = null;
  const stopTicker = () => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
  if (onProgress) {
    onProgress({
      phase: resumeJobId ? "reading" : "uploading",
      elapsedSeconds: 0,
    });
  }

  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let statusUrl: string | undefined;
    let result: OCRScanResult | undefined;
    const acknowledge = async (jobId: number) => {
      try {
        await opts.onAccepted?.(jobId);
      } catch (error) {
        throw new ScanAcceptancePersistenceError(jobId, error);
      }
    };
    if (resumeJobId !== undefined) {
      await acknowledge(resumeJobId);
      statusUrl = `/ocr/status/${resumeJobId}`;
    } else {
      const compressedBlob = await compressImage(file);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const fd = new FormData();
      fd.append("file", compressedBlob, file.name);
      await opts.onUploading?.();
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      let res;
      try {
        res = await api.post("/ocr/scan", fd, { signal });
      } catch (error) {
        if (isAbortLikeError(error)) throw error;
        throw new ScanUploadError(isDefinitiveUploadRejection(error), error);
      }
      if (res.status === 202) {
        const jobId: unknown = res.data.job_id;
        if (
          typeof jobId !== "number" ||
          !Number.isSafeInteger(jobId) ||
          jobId <= 0
        ) {
          throw new ScanUploadError(false);
        }
        // Use the owner-authorized status endpoint, not an arbitrary response URL.
        statusUrl = `/ocr/status/${jobId}`;
        await acknowledge(jobId);
      } else {
        result = res.data as OCRScanResult;
      }
    }

    if (statusUrl) {
      onProgress?.({
        phase: "reading",
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      });
      ticker = setInterval(() => {
        onProgress?.({
          phase: "reading",
          elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        });
      }, 1000);

      const deadline = startedAt + maxWaitMs;
      while (Date.now() < deadline) {
        await sleep(1500, signal);
        const statusRes = await api.get(statusUrl, { signal });
        if (statusRes.data.status === "completed") {
          const promotedResult = {
            ...(statusRes.data.result ?? {}),
            expense_id: statusRes.data.expense_id,
            receipt_id: statusRes.data.receipt_id,
            error_code: statusRes.data.error_code,
          } as OCRScanResult;
          if (
            promotedResult.expense_id == null ||
            promotedResult.receipt_id == null
          ) {
            throw new ScanJobError();
          }
          result = promotedResult;
          break;
        }
        if (statusRes.data.status === "failed") {
          throw new ScanJobError(statusRes.data.error);
        }
      }
      if (!result) throw new ScanTimeoutError();
    }

    onProgress?.({
      phase: "reading",
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
    if (!result) throw new ScanJobError();
    return result;
  } catch (e: unknown) {
    if (isAbortLikeError(e)) {
      // Abort stops browser observation only. The accepted durable pipeline must
      // keep running across navigation, logout and lost network connections.
      // Destructive cancellation requires a separate explicit owner action.
      throw new ScanCancelledError();
    }
    throw e;
  } finally {
    stopTicker();
  }
}
