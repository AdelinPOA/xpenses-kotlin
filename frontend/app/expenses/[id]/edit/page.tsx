"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import { useSearchParams } from "next/navigation";
import api, { Expense } from "@/lib/api";
import { expenseKeys } from "@/lib/queryKeys";
import dynamic from "next/dynamic";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import QueryErrorNotice from "@/components/ui/QueryErrorNotice";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("expenses");

  const { data: expense, isLoading, isError, isFetching, refetch } = useQuery<Expense>({
    queryKey: expenseKeys.detail(parseInt(id)),
    queryFn: () => api.get(`/expenses/${id}`).then((r) => r.data),
  });

  const showImmediateReview = process.env.NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED === "true" && expense &&
    (expense.verification_state === "PENDING" || Boolean(ocrSourceId));

  return (
    <AppShell>
      {!showImmediateReview && <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("edit_expense")}</h1>
      </div>}
      {isError && <QueryErrorNotice isFetching={isFetching} onRetry={() => { void refetch(); }} />}
      {isLoading ? (
        <div className="animate-pulse bg-card h-96 rounded-xl" />
      ) : showImmediateReview ? (
        <ImmediateExpenseReview
          expense={expense}
          sourceId={ocrSourceId}
          onReload={async () => {
            const latest = await refetch();
            return latest.data ?? null;
          }}
        />
      ) : expense ? (
        <ExpenseForm expense={expense} highlightReceipts={uploadFailed} />
      ) : isError ? null : (
        <EmptyState message={t("not_found")} />
      )}
    </AppShell>
  );
}
