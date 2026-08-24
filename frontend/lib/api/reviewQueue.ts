import api from "@/lib/api";
import type { ReviewQueueItem } from "@/lib/types/reviewQueue";

export interface BulkStatusResult {
  succeeded: number[];
  failed: { id: number; reason: string | null }[];
}

export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  const response = await api.get<ReviewQueueItem[]>("/review-queue");
  return response.data;
}

export async function bulkReportStatus(
  ids: number[],
  action: "approve" | "reject",
  reason?: string
): Promise<BulkStatusResult> {
  const response = await api.post<BulkStatusResult>("/reports/bulk-status", {
    ids,
    action,
    ...(action === "reject" ? { reason } : {}),
  });
  return response.data;
}
