"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api, { PendingReportSummary, Report } from "@/lib/api";
import { reportKeys } from "@/lib/queryKeys";
import { formatEur } from "@/lib/format";
import Link from "next/link";
import { 
  Check, X, FileText, Eye, User, ChevronDown, ChevronUp, 
  Paperclip, Tag, Calendar, AlertCircle, Loader2 
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import ReportReceiptsDrawer from "@/components/reports/ReportReceiptsDrawer";
import { useTranslations } from "next-intl";

interface PendingReportsTableProps {
  reports: PendingReportSummary[];
  onApprove: (reportId: number) => void;
  onReject: (reportId: number, reason: string) => void;
  actionPending?: boolean;
  /** Bulk actions (Phase 3.2). When provided, multi-select is enabled. */
  onBulkApprove?: (ids: number[]) => void;
  onBulkReject?: (ids: number[], reason: string) => void;
  bulkPending?: boolean;
}

function ReportAccordionDetail({
  reportId,
  onApprove,
  onReject,
  actionPending,
  onViewReceipts,
}: {
  reportId: number;
  onApprove: (reportId: number) => void;
  onReject: (reportId: number, reason: string) => void;
  actionPending?: boolean;
  onViewReceipts: () => void;
}) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => api.get(`/reports/${reportId}`).then((r) => r.data),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center text-muted-foreground gap-2 border-t border-border bg-muted/20">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">{t("fetching_details")}</span>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-4 border-t border-border bg-rose-500/5 text-rose-600 text-sm flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        <span>{t("failed_load_report", { fallback: "Failed to load report details." })}</span>
      </div>
    );
  }

  const handleRejectSubmit = () => {
    if (!rejectReason.trim()) return;
    onReject(reportId, rejectReason.trim());
  };

  return (
    <div className="border-t border-border bg-muted/15 p-4 sm:p-5 space-y-4 animate-in fade-in-50 duration-150">
      {/* Report metadata & description */}
      <div className="bg-card rounded-xl p-3.5 border border-border space-y-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            {report.date_from && report.date_to ? `${report.date_from} — ${report.date_to}` : tc("no_date_range")}
          </span>
          <span className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-primary" />
            {report.user_display_name || `User #${report.user_id}`}
          </span>
        </div>
        {report.description && (
          <p className="text-foreground/90 pt-1 border-t border-border/50 text-xs sm:text-sm">
            {report.description}
          </p>
        )}
      </div>

      {/* Itemized expenses table/list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
          <span>{t("itemized_expenses")} ({report.expenses?.length || 0})</span>
          <span>{formatEur(report.total_amount || 0)}</span>
        </div>

        <div className="space-y-2">
          {report.expenses?.map((exp) => (
            <div
              key={exp.id}
              className="p-3 rounded-lg border border-border bg-card flex items-center justify-between gap-3 text-sm shadow-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground truncate text-xs sm:text-sm">
                    {exp.merchant || exp.description || tc("expense")}
                  </p>
                  {exp.receipts && exp.receipts.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewReceipts();
                      }}
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/25 px-1.5 py-1 rounded cursor-pointer transition-colors min-h-6"
                    >
                      <Paperclip className="w-2.5 h-2.5" />
                      {t("receipt_attached")} ({exp.receipts.length})
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Tag className="w-2.5 h-2.5" />
                    {exp.category_name || tc("uncategorized")}
                  </span>
                  <span>•</span>
                  <span>{exp.date}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-bold text-foreground tabular-nums text-xs sm:text-sm">{formatEur(exp.amount_eur)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary calculation card */}
      <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5 text-xs sm:text-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>{t("total_expenses")}</span>
          <span className="font-semibold text-foreground">{formatEur(report.total_amount || 0)}</span>
        </div>
        {report.total_advances > 0 && (
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 font-medium">
            <span>{t("less_advances")}</span>
            <span>- {formatEur(report.total_advances)}</span>
          </div>
        )}
        <div className="pt-2 border-t border-border flex items-center justify-between font-bold text-sm sm:text-base text-foreground">
          <span>{t("net_reimbursable")}</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            {formatEur(report.total_reimbursable ?? report.total_amount)}
          </span>
        </div>
      </div>

      {/* Reject reason input when active */}
      {showRejectInput && (
        <div className="space-y-2 p-3.5 bg-rose-500/5 border border-rose-500/20 rounded-xl animate-in fade-in-50">
          <label className="text-xs font-semibold text-rose-700 dark:text-rose-400">
            {t("manager_notes")} *
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("add_notes")}
            rows={2}
            className="w-full rounded-lg border border-border bg-background p-2.5 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-500"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowRejectInput(false)}
              className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
            >
              {tc("cancel")}
            </button>
            <button
              type="button"
              onClick={handleRejectSubmit}
              disabled={actionPending || !rejectReason.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1"
            >
              {actionPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              {t("reject_report")}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Link
          href={`/reports/${report.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <Eye className="w-3.5 h-3.5" />
          {t("view_details")}
        </Link>

        <div className="flex items-center gap-2">
          {!showRejectInput && (
            <button
              type="button"
              onClick={() => setShowRejectInput(true)}
              disabled={actionPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 disabled:opacity-50 cursor-pointer"
            >
              <X className="w-4 h-4" />
              {tc("reject")}
            </button>
          )}

          <button
            type="button"
            onClick={() => onApprove(report.id)}
            disabled={actionPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {actionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t("approve_report")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PendingReportsTable({
  reports,
  onApprove,
  onReject,
  actionPending,
  onBulkApprove,
  onBulkReject,
  bulkPending,
}: PendingReportsTableProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const [userExpandedId, setUserExpandedId] = useState<number | null>(null);
  const [userCollapsedFirst, setUserCollapsedFirst] = useState(false);
  const [receiptsReportId, setReceiptsReportId] = useState<number | null>(null);

  // ── Batch selection state (Phase 3.2) ────────────────────────────────────
  const canBulk = !!(onBulkApprove && onBulkReject);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClick = useRef(false);

  const canSelectMultiple = canBulk && reports.length > 1;

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Long-press (~500ms) enters selection mode and picks the pressed row.
  const startLongPress = (id: number) => {
    if (!canSelectMultiple) return;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      suppressNextClick.current = true;
      setSelectionMode(true);
      setSelectedIds((prev) => new Set(prev).add(id));
    }, 500);
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkRejectOpen(false);
    setBulkRejectReason("");
  };

  const handleRowClick = (id: number, toggleExpand: () => void) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    if (selectionMode) toggleSelected(id);
    else toggleExpand();
  };

  const submitBulkApprove = () => {
    if (!selectedIds.size || bulkPending) return;
    onBulkApprove?.(Array.from(selectedIds));
    exitSelectionMode();
  };

  const submitBulkReject = () => {
    if (!selectedIds.size || !bulkRejectReason.trim() || bulkPending) return;
    onBulkReject?.(Array.from(selectedIds), bulkRejectReason.trim());
    exitSelectionMode();
  }; 
  
  const expandedId = userExpandedId !== null 
    ? userExpandedId 
    : (reports.length > 0 && !userCollapsedFirst ? reports[0].id : null);

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setUserExpandedId(null);
      setUserCollapsedFirst(true);
    } else {
      setUserExpandedId(id);
      setUserCollapsedFirst(false);
    }
  };

  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Check className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-foreground">{t("all_clear")}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t("no_reports_pending")}</p>
      </div>
    );
  }

  const toggleExpandFor = (id: number) => () => toggleExpand(id);

  return (
    <>

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-amber-500/[0.04] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
              {t("review_queue_label")}
            </p>
            <h3 className="font-bold text-foreground text-base sm:text-lg">{t("pending_reports")}</h3>
          </div>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-black text-amber-700 dark:text-amber-400 ml-1">
            {reports.length}
          </span>
        </div>
        <Link href="/approvals" className="text-xs font-semibold text-primary hover:underline">
          {t("open_review_queue")}
        </Link>
        {canSelectMultiple && !selectionMode && (
          <button
            type="button"
            onClick={() => setSelectionMode(true)}
            className="text-xs font-semibold text-muted hover:text-primary transition-colors cursor-pointer"
          >
            {t("select_reports")}
          </button>
        )}
        {selectionMode && (
          <button
            type="button"
            onClick={exitSelectionMode}
            disabled={bulkPending}
            className="text-xs font-semibold text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            {tc("cancel")}
          </button>
        )}
      </div>

      {/* List items with accordion */}
      <div className="divide-y divide-border">
        {reports.map((report, index) => {
          const isExpanded = expandedId === report.id;

          return (
            <article
              key={report.id}
              className={`transition-colors ${
                index === 0 && !isExpanded ? "bg-amber-500/[0.02]" : "bg-card"
              }`}
            >
              {/* Accordion Summary Row */}
              <div
                onClick={() => handleRowClick(report.id, toggleExpandFor(report.id))}
                onPointerDown={() => startLongPress(report.id)}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
                onPointerCancel={clearLongPress}
                className={`p-4 sm:p-5 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                  selectionMode && selectedIds.has(report.id) ? "bg-primary/[0.06]" : "hover:bg-muted/30"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {selectionMode && (
                      <span
                        aria-hidden="true"
                        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          selectedIds.has(report.id)
                            ? "bg-primary border-primary text-white"
                            : "border-border bg-background"
                        }`}
                      >
                        {selectedIds.has(report.id) && <Check className="w-3.5 h-3.5" />}
                      </span>
                    )}
                    {index === 0 && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary">
                        {t("next_to_review")}
                      </span>
                    )}
                    <h4 className="font-bold text-foreground truncate text-sm sm:text-base">
                      {report.title}
                    </h4>
                  </div>

                  {report.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {report.description}
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <User className="w-3.5 h-3.5 text-primary" />
                      {report.user_name}
                    </span>
                    <span>•</span>
                    <span>{t("submitted")} {report.date_submitted ? new Date(report.date_submitted).toLocaleDateString() : "—"}</span>
                    <span>•</span>
                    <span>
                      {report.expense_count === 1
                        ? t("expense_count_one", { count: report.expense_count })
                        : t("expense_count_other", { count: report.expense_count })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                  <div className="text-left sm:text-right">
                    <p className="text-base sm:text-lg font-black tabular-nums text-foreground">
                      {formatEur(report.total_amount_eur)}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase">{report.currency}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Toggle details"
                      className="min-w-11 min-h-11 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Accordion Content */}
              {isExpanded && (
                <ReportAccordionDetail
                  reportId={report.id}
                  onApprove={onApprove}
                  onReject={onReject}
                  actionPending={actionPending}
                  onViewReceipts={() => setReceiptsReportId(report.id)}
                />
              )}
            </article>
          );
        })}
      </div>
    </div>

      {/* ── Sticky batch action bar (Phase 3.2) ─────────────────────── */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)] left-1/2 -translate-x-1/2 lg:bottom-6 z-30 flex items-center gap-1.5 sm:gap-2 bg-card border border-border shadow-lg rounded-full px-3 py-2 max-w-[calc(100vw-2rem)]">
          <span className="text-xs font-bold text-foreground whitespace-nowrap tabular-nums">
            {t("n_selected", { count: selectedIds.size })}
          </span>
          <button
            type="button"
            onClick={submitBulkApprove}
            disabled={bulkPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Check className="w-3.5 h-3.5" />
            {t("bulk_approve", { count: selectedIds.size })}
          </button>
          <button
            type="button"
            onClick={() => setBulkRejectOpen(true)}
            disabled={bulkPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            {t("bulk_reject", { count: selectedIds.size })}
          </button>
        </div>
      )}

      {/* ── Shared rejection reason dialog for bulk reject ─────────── */}
      {bulkRejectOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("bulk_reject_reason")}
          onClick={(e) => {
            if (e.target === e.currentTarget && !bulkPending) setBulkRejectOpen(false);
          }}
        >
          <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-md p-5 space-y-3">
            <h4 className="text-sm font-bold text-foreground">{t("bulk_reject_reason")}</h4>
            <textarea
              value={bulkRejectReason}
              onChange={(e) => setBulkRejectReason(e.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-border bg-background p-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-500 resize-none"
              placeholder={t("add_notes")}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkRejectOpen(false)}
                disabled={bulkPending}
                className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground cursor-pointer"
              >
                {tc("cancel")}
              </button>
              <button
                type="button"
                onClick={submitBulkReject}
                disabled={bulkPending || !bulkRejectReason.trim()}
                className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                {t("bulk_reject", { count: selectedIds.size })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline receipt viewer (Phase 3.1) */}
      <ReportReceiptsDrawer reportId={receiptsReportId} onClose={() => setReceiptsReportId(null)} />
    </>
  );
}

