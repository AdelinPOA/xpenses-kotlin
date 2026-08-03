"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import api from "@/lib/api";
import { dashboardKeys, reportKeys, reviewQueueKeys } from "@/lib/queryKeys";

interface ReviewQueueActionOptions {
  approveErrorMessage: string;
  rejectErrorMessage: string;
  onSuccess?: (action: "approve" | "reject") => void;
  onError?: (message: string, action: "approve" | "reject") => void;
}

interface RejectVariables {
  id: number;
  reason: string;
}

function getServerError(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ detail?: string }>(error)) {
    return error.response?.data?.detail ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export function useReviewQueueActions(options: ReviewQueueActionOptions) {
  const queryClient = useQueryClient();

  const refreshReviewSurfaces = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewQueueKeys.all }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.manager() }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
      queryClient.invalidateQueries({ queryKey: reportKeys.all }),
    ]);
  };

  const handleSuccess = async (action: "approve" | "reject") => {
    await refreshReviewSurfaces();
    options.onSuccess?.(action);
  };

  const handleError = async (error: unknown, action: "approve" | "reject") => {
    await refreshReviewSurfaces();
    options.onError?.(
      getServerError(error, action === "approve" ? options.approveErrorMessage : options.rejectErrorMessage),
      action
    );
  };

  const approve = useMutation({
    mutationFn: (id: number) => api.post(`/reports/${id}/approve`),
    onSuccess: () => handleSuccess("approve"),
    onError: (error) => handleError(error, "approve"),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: RejectVariables) => {
      if (!reason.trim()) {
        throw new Error(options.rejectErrorMessage);
      }
      return api.post(`/reports/${id}/reject`, { reason: reason.trim() });
    },
    onSuccess: () => handleSuccess("reject"),
    onError: (error) => handleError(error, "reject"),
  });

  return { approve, reject };
}
