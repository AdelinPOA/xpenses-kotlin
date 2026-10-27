"use client";

import { useQuery } from "@tanstack/react-query";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import api, { Expense } from "@/lib/api";
import { expenseKeys } from "@/lib/queryKeys";
import dynamic from "next/dynamic";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import QueryErrorNotice from "@/components/ui/QueryErrorNotice";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthProvider";
import { listOcrSources } from "@/lib/ocrSourceQueue";

const ExpenseForm = dynamic(() => import("@/components/expenses/ExpenseForm"), {
  loading: () => <div className="animate-pulse bg-card h-96 rounded-xl" />,
});
const ImmediateExpenseReview = dynamic(
  () => import("@/components/expenses/ImmediateExpenseReview"),
  { loading: () => <div className="animate-pulse bg-card h-96 rounded-xl" /> },
);

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const uploadFailed = searchParams.get("upload_failed") === "1";
  const ocrSourceId = searchParams.get("ocr_source_id");
  const returnReportParam = searchParams.get("return_report_id");
  const parsedReportId = returnReportParam && /^\d+$/.test(returnReportParam)
    ? Number(returnReportParam)
    : null;
  const requestedReportId = parsedReportId && Number.isSafeInteger(parsedReportId) && parsedReportId > 0
    ? parsedReportId
    : null;
  const { user } = useAuth();
  const t = useTranslations("expenses");
  const [matchingOcrSource, setMatchingOcrSource] = useState(false);
  const [ocrSourceUnavailable, setOcrSourceUnavailable] = useState(false);
  const [ocrSourceCheckPending, setOcrSourceCheckPending] = useState(false);

  const { data: expense, isLoading, isError, isFetching, refetch } = useQuery<Expense>({
    queryKey: expenseKeys.detail(parseInt(id)),
    queryFn: () => api.get(`/expenses/${id}`).then((r) => r.data),
  });

  useEffect(() => {
    let active = true;
    setMatchingOcrSource(false);
    setOcrSourceUnavailable(false);
    setOcrSourceCheckPending(false);
    if (
      !ocrSourceId ||
      !expense ||
      !user?.id ||
      expense.verification_state !== "PENDING" ||
      expense.last_verified_at
    ) return () => { active = false; };

    setOcrSourceCheckPending(true);
    void listOcrSources(user.id)
      .then(async (sources) => {
        const source = sources.find((item) =>
          item.id === ocrSourceId &&
          item.expenseId === expense.id &&
          Number.isSafeInteger(item.remoteJobId) &&
          (item.remoteJobId ?? 0) > 0,
        );
        if (!source || !expense.receipts?.length) return false;
        const { data: job } = await api.get(`/ocr/status/${source.remoteJobId}`);
        const status = String(job.status ?? "").toUpperCase();
        return Number(job.expense_id) === expense.id &&
          ["COMPLETED", "PENDING", "PROCESSING", "RETRY_WAIT", "PAUSED"].includes(status);
      })
      .then((isOutstandingSource) => {
        if (active) setMatchingOcrSource(isOutstandingSource);
      })
      .catch(() => {
        if (active) setMatchingOcrSource(false);
      })
      .finally(() => {
        if (active) setOcrSourceCheckPending(false);
      });
    return () => { active = false; };
  }, [expense?.id, expense?.last_verified_at, expense?.verification_state, ocrSourceId, user?.id]);

  const ocrReviewOutstanding = Boolean(
    expense?.verification_state === "PENDING" && !expense.last_verified_at,
  );
  const waitingForOcrSource = Boolean(
    process.env.NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED === "true" &&
    ocrSourceId && ocrReviewOutstanding && user?.id && ocrSourceCheckPending,
  );
  const showImmediateReview = Boolean(
    process.env.NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED === "true" &&
    expense && ocrReviewOutstanding && matchingOcrSource && !ocrSourceUnavailable,
  );
  const returnToReportId = requestedReportId && expense?.report_id === requestedReportId
    ? requestedReportId
    : undefined;

  return (
    <AppShell>
      {!showImmediateReview && <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("edit_expense")}</h1>
      </div>}
      {isError && <QueryErrorNotice isFetching={isFetching} onRetry={() => { void refetch(); }} />}
      {isLoading || waitingForOcrSource ? (
        <div className="animate-pulse bg-card h-96 rounded-xl" />
      ) : showImmediateReview && expense ? (
        <ImmediateExpenseReview
          expense={expense}
          sourceId={ocrSourceId}
          onSourceUnavailableAction={() => setOcrSourceUnavailable(true)}
          onReloadAction={async () => {
            const latest = await refetch();
            return latest.data ?? null;
          }}
        />
      ) : expense ? (
        <ExpenseForm expense={expense} highlightReceipts={uploadFailed} returnToReportId={returnToReportId} />
      ) : isError ? null : (
        <EmptyState message={t("not_found")} />
      )}
    </AppShell>
  );
}
