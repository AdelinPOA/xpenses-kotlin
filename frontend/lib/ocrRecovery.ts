"use client";

import api from "./api";
import type { OcrReviewRequestValues } from "./ocrSourceQueue";

export interface OcrJobRecovery {
  job_id: number;
  status: string;
  stage: string;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  allowed_actions: Array<"cancel" | "retry" | "complete_manually" | "view_expense">;
  expires_at: string | null;
  expense_id: number | null;
  receipt_id: number | null;
  report_id: number | null;
  report_link_status: string;
}

export interface OcrJobStatus {
  job_id: number;
  status: "pending" | "processing" | "retry_wait" | "completed" | "failed";
  stage?: string;
  expense_id?: number | null;
  receipt_id?: number | null;
  error_code?: string | null;
  error?: string;
  result?: Record<string, unknown>;
}

export interface ManualCompletionRequest {
  values?: OcrReviewRequestValues;
}

function requireJobId(jobId: number): void {
  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    throw new Error("Invalid OCR job ID");
  }
}

function actionHeaders(idempotencyKey: string) {
  if (!idempotencyKey.trim()) throw new Error("OCR action idempotency key required");
  return { headers: { "Idempotency-Key": idempotencyKey } };
}

/** Returns only the owner's server-safe recovery metadata; never includes source bytes. */
export async function listRecoverableOcrJobs(limit = 50): Promise<OcrJobRecovery[]> {
  const response = await api.get<OcrJobRecovery[]>("/ocr/jobs", { params: { limit } });
  return response.data;
}

export async function retryOcrJob(jobId: number, idempotencyKey: string): Promise<OcrJobRecovery> {
  requireJobId(jobId);
  const response = await api.post<OcrJobRecovery>(
    `/ocr/jobs/${jobId}/retry`,
    null,
    actionHeaders(idempotencyKey),
  );
  return response.data;
}

export async function completeOcrJobManually(
  jobId: number,
  body: ManualCompletionRequest,
  idempotencyKey: string,
): Promise<OcrJobRecovery> {
  requireJobId(jobId);
  const response = await api.post<OcrJobRecovery>(
    `/ocr/jobs/${jobId}/complete-manually`,
    body,
    actionHeaders(idempotencyKey),
  );
  return response.data;
}

export async function getOcrJobStatus(jobId: number): Promise<OcrJobStatus> {
  requireJobId(jobId);
  const response = await api.get<OcrJobStatus>(`/ocr/status/${jobId}`);
  return response.data;
}
