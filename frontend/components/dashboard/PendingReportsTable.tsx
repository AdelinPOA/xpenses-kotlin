"use client";

import { PendingReportSummary } from "@/lib/api";
import { formatEur } from "@/lib/format";
import Link from "next/link";
import { Check, X, FileText, Eye, User } from "lucide-react";
import { useTranslations } from "next-intl";

interface PendingReportsTableProps {
  reports: PendingReportSummary[];
  onSelectReport: (reportId: number) => void;
  onApprove: (reportId: number, e: React.MouseEvent) => void;
  onReject: (reportId: number, e: React.MouseEvent) => void;
}

export default function PendingReportsTable({
  reports,
  onSelectReport,
  onApprove,
  onReject,
}: PendingReportsTableProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  if (reports.length === 0) {
    return (
      <div className="border border-dashed border-emerald-500/40 bg-emerald-500/5 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Check className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">{t("all_clear")}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t("no_reports_pending")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-amber-500/[0.035] p-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-amber-500" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">{t("review_queue_label")}</p>
            <h3 className="font-semibold text-foreground text-lg">{t("pending_reports")}</h3>
          </div>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            {reports.length}
          </span>
        </div>
        <Link href="/approvals" className="text-xs font-semibold text-primary hover:underline">
          {t("open_review_queue")}
        </Link>
      </div>

      <div className="max-h-[560px] flex-1 space-y-3 overflow-y-auto p-3">
        {reports.map((report, index) => (
          <article
            key={report.id}
            onClick={() => onSelectReport(report.id)}
            className={`cursor-pointer border bg-background/50 p-4 transition-colors hover:bg-muted/30 ${
              index === 0 ? "border-amber-400/70 border-l-4 border-l-primary shadow-sm" : "border-border"
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                {index === 0 && (
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{t("next_to_review")}</p>
                )}
                <h4 className="font-semibold text-foreground truncate">{report.title}</h4>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <User className="w-3.5 h-3.5 text-primary" />
                    {report.user_name}
                  </span>
                  <span>{t("submitted")} {report.date_submitted ? new Date(report.date_submitted).toLocaleDateString() : "—"}</span>
                  <span>{report.date_from && report.date_to ? `${report.date_from} - ${report.date_to}` : tc("no_date_range")}</span>
                  <span>
                    {report.expense_count === 1
                      ? t("expense_count_one", { count: report.expense_count })
                      : t("expense_count_other", { count: report.expense_count })}
                  </span>
                </div>
                {report.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{report.description}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xl font-bold tabular-nums text-foreground">{formatEur(report.total_amount_eur)}</p>
                <p className="text-xs text-muted-foreground">{report.currency}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => onApprove(report.id, e)}
                title={t("approve_report")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {tc("approve")}
              </button>
              <button
                onClick={(e) => onReject(report.id, e)}
                title={t("reject_report")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
              >
                <X className="w-4 h-4" />
                {tc("reject")}
              </button>
              <Link
                href={`/reports/${report.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-card-hover"
              >
                <Eye className="w-4 h-4" />
                {t("view_details")}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
