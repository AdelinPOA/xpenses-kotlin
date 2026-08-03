"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api, { Report } from "@/lib/api";
import { reportKeys } from "@/lib/queryKeys";
import { formatEur } from "@/lib/format";
import { X, Check, FileText, User, Calendar, Tag, Paperclip, AlertCircle, Loader2 } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { useTranslations } from "next-intl";

interface SlideOverReviewDrawerProps {
  reportId: number | null;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  actionPending: boolean;
  actionError: string | null;
}

export default function SlideOverReviewDrawer({
  reportId,
  onClose,
  onApprove,
  onReject,
  actionPending,
  actionError,
}: SlideOverReviewDrawerProps) {
  const [comment, setComment] = useState("");
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: reportKeys.detail(reportId!),
    queryFn: () => api.get(`/reports/${reportId}`).then((r) => r.data),
    enabled: !!reportId,
  });

  if (!reportId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="w-full max-w-xl bg-card border-l border-border h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {isLoading ? t("loading_report") : report?.title || `${t("report_number")}${reportId}`}
              </h2>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>
                  {t("submitted_by")} {report?.user_display_name || `${t("user_number")}${report?.user_id}`}
                </span>
                {report?.status && <Badge status={report.status} />}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>{t("fetching_details")}</span>
            </div>
          ) : report ? (
            <>
              {actionError && (
                <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <div className="bg-muted/30 rounded-xl p-4 border border-border/60 space-y-2">
                <div className="flex items-center text-xs text-muted-foreground gap-4">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    {report.date_from || "N/A"} — {report.date_to || "N/A"}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-primary" />
                    {t("technician")}
                    {report.user_id}
                  </span>
                </div>
                {report.description && (
                  <p className="text-sm text-foreground/80 italic">{report.description}</p>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center justify-between">
                  <span>
                    {t("itemized_expenses")} ({report.expenses?.length || 0})
                  </span>
                  <span className="text-primary font-bold">{formatEur(report.total_amount || 0)}</span>
                </h3>

                <div className="space-y-2.5">
                  {report.expenses?.map((exp) => (
                    <div
                      key={exp.id}
                      className="p-3.5 rounded-lg border border-border bg-background flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {exp.merchant || exp.description || t("expenses_section")}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {exp.category_name || tc("uncategorized")}
                          </span>
                          <span>•</span>
                          <span>{exp.date}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-semibold text-foreground">{formatEur(exp.amount_eur)}</span>
                        {exp.receipts && exp.receipts.length > 0 && (
                          <span className="flex items-center justify-end text-[11px] text-emerald-600 dark:text-emerald-400 gap-0.5 mt-0.5">
                            <Paperclip className="w-3 h-3" /> {t("receipt_attached")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{t("total_expenses")}</span>
                  <span>{formatEur(report.total_amount || 0)}</span>
                </div>
                {report.total_advances > 0 && (
                  <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                    <span>{t("less_advances")}</span>
                    <span>- {formatEur(report.total_advances)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-border flex items-center justify-between font-bold text-base text-foreground">
                  <span>{t("net_reimbursable")}</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {formatEur(report.total_reimbursable ?? report.total_amount)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  {t("manager_notes")}
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("add_notes")}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-end gap-3">
          <button
            onClick={() => onReject(comment)}
            disabled={actionPending || !comment.trim()}
            className="px-4 py-2 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white font-medium text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {actionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            {t("reject_report")}
          </button>
          <button
            onClick={onApprove}
            disabled={actionPending}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {actionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t("approve_report")}
          </button>
        </div>
      </div>
    </div>
  );
}
