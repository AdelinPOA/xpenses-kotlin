"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import api, { Report } from "@/lib/api";
import { reportKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import { Banknote, XCircle } from "lucide-react";
import { formatEur } from "@/lib/format";
import { useTranslations } from "next-intl";

export default function PaymentsPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const tr = useTranslations("reports");

  const { data: reports, isLoading, error: fetchError } = useQuery<Report[]>({
    queryKey: reportKeys.list({ status: "approved", all: true }),
    queryFn: () => api.get("/reports", { params: { status: "approved", all: true } }).then((r) => r.data),
    enabled: user?.role === "chef_finance",
  });

  const [mutationError, setMutationError] = useState<string | null>(null);

  const payMutation = useMutation({
    mutationFn: (id: number) => api.post(`/reports/${id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      setMutationError(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || t("payment_failed");
      setMutationError(msg);
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

  if (!user || user.role !== "chef_finance") {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center mt-24 text-center">
          <XCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">{tc("access_denied")}</h2>
          <p className="text-muted text-sm mt-2">
            {tc("access_denied_description")}
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">{t("heading")}</h1>
        <p className="text-muted text-sm mt-1">
          {t("subtitle")}
        </p>
      </div>

      {(fetchError || mutationError) && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-800 dark:text-red-300 flex justify-between items-center">
          <span>{mutationError || t("load_error")}</span>
          <button
            onClick={() => setMutationError(null)}
            className="text-red-500 hover:text-red-700 font-bold px-2"
          >
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
            <div
              key={report.id}
              className="bg-card rounded-2xl border border-border shadow-2xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-foreground truncate">
                  {report.title}
                </h3>
                {report.user_display_name && (
                  <p className="text-xs text-muted mt-1">
                    {t("submitted_by")}{" "}
                    <Link href={`/profile/${report.user_id}`} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      {report.user_display_name}
                    </Link>
                  </p>
                )}
                <p className="text-xs text-muted mt-1">
                  {report.date_from && report.date_to
                    ? `${report.date_from} — ${report.date_to}`
                    : tc("no_date_range")}
                </p>
                {report.approved_at && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("approved")} {new Date(report.approved_at).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                <div className="sm:text-right">
                  <p className="text-lg font-mono font-bold tabular-nums text-foreground">
                    {formatEur(report.total_amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {report.expenses.length === 1
                      ? tr("expense_count_one", { count: report.expenses.length })
                      : tr("expense_count_other", { count: report.expenses.length })}
                  </p>
                </div>
                <button
                  onClick={() => payMutation.mutate(report.id)}
                  disabled={payMutation.isPending}
                  className="min-h-11 flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl whitespace-nowrap hover:bg-primary-hover disabled:opacity-50"
                >
                  <Banknote className="w-4 h-4" />
                  {t("mark_paid")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
