"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { getReviewQueue, type ReviewQueueItem } from "@/lib/api";
import { reviewQueueKeys } from "@/lib/queryKeys";
import { useReviewQueueActions } from "@/lib/reviewQueueActions";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import ReportReceiptsDrawer from "@/components/reports/ReportReceiptsDrawer";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { CheckCircle, Eye, Paperclip, XCircle } from "lucide-react";
import { formatEur } from "@/lib/format";
import { useTranslations } from "next-intl";

export default function ApprovalsPage() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const t = useTranslations("approvals");
  const tc = useTranslations("common");
  const tr = useTranslations("reports");
  const td = useTranslations("dashboard");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [receiptsReportId, setReceiptsReportId] = useState<number | null>(null);
  const canManage = user?.role === "manager" || user?.role === "chef_finance";

  const { data: reports, isLoading, error: fetchError } = useQuery<ReviewQueueItem[]>({
    queryKey: reviewQueueKeys.list(),
    queryFn: getReviewQueue,
    enabled: canManage,
  });

  const actions = useReviewQueueActions({
    approveErrorMessage: t("approve_failed"),
    rejectErrorMessage: t("reject_failed"),
    onSuccess: (action) => {
      setMutationError(null);
      if (action === "reject") {
        setRejectingId(null);
        setRejectReason("");
        toast.success(t("reject_success"));
      } else {
        toast.success(t("approve_success"));
      }
    },
    onError: (message) => {
      setMutationError(message);
      toast.error(message);
    },
  });

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!user || !canManage) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center mt-24 text-center">
          <XCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">{tc("access_denied")}</h2>
          <p className="text-muted text-sm mt-2">{tc("access_denied_description")}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">{t("heading")}</h1>
        <p className="text-muted text-sm mt-1">{t("subtitle")}</p>
      </div>

      {(fetchError || mutationError) && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-800 dark:text-red-300 flex justify-between items-center">
          <span>{mutationError || t("load_error")}</span>
          <button onClick={() => setMutationError(null)} className="text-red-500 hover:text-red-700 font-bold px-2">
            &times;
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground text-sm mt-8">{tc("loading")}</div>
      ) : !reports?.length ? (
        <EmptyState message={t("no_reports")} />
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div key={report.id} className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-foreground truncate">{report.title}</h3>
                  <p className="text-xs text-muted mt-1">
                    {t("submitted_by")} {" "}
                    <Link href={`/profile/${report.user_id}`} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      {report.user_name}
                    </Link>
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {report.date_from && report.date_to ? `${report.date_from} - ${report.date_to}` : tc("no_date_range")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {report.expense_count === 1
                      ? tr("expense_count_one", { count: report.expense_count })
                      : tr("expense_count_other", { count: report.expense_count })}
                  </p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <p className="text-xl font-bold text-foreground">{formatEur(report.total_amount_eur)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{report.currency}</p>
                  {report.date_submitted && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {td("submitted")} {new Date(report.date_submitted).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              {report.description && (
                <p className="text-sm text-muted-foreground mt-3 border-t border-border pt-3">{report.description}</p>
              )}

              {rejectingId === report.id ? (
                <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-4">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t("rejection_reason")}</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    className="w-full text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none dark:bg-slate-800 dark:text-slate-100"
                    placeholder={t("rejection_placeholder")}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => actions.reject.mutate({ id: report.id, reason: rejectReason })}
                      disabled={actions.reject.isPending || !rejectReason.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      {t("confirm_rejection")}
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                      className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      {tc("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mt-4 border-t border-border pt-4">
                  <button
                    onClick={() => actions.approve.mutate(report.id)}
                    disabled={actions.approve.isPending || actions.reject.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {tc("approve")}
                  </button>
                  <button
                    onClick={() => setRejectingId(report.id)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50"
                  >
                    <XCircle className="w-4 h-4" />
                    {tc("reject")}
                  </button>
                  <button
                    onClick={() => setReceiptsReportId(report.id)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-border bg-card text-foreground text-sm font-medium rounded-lg hover:bg-card-hover"
                  >
                    <Paperclip className="w-4 h-4" />
                    {t("view_receipts")}
                  </button>
                  <Link
                    href={`/reports/${report.id}`}
                    className="flex items-center gap-1.5 px-4 py-2 border border-border bg-card text-foreground text-sm font-medium rounded-lg hover:bg-card-hover"
                  >
                    <Eye className="w-4 h-4" />
                    {t("view_details")}
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {receiptsReportId !== null && (
        <ReportReceiptsDrawer reportId={receiptsReportId} onClose={() => setReceiptsReportId(null)} />
      )}
    </AppShell>
  );
}
