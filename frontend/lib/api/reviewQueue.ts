import api from "@/lib/api";
import type { ReviewQueueItem } from "@/lib/types/reviewQueue";

export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  const response = await api.get<ReviewQueueItem[]>("/review-queue");
  return response.data;
}
