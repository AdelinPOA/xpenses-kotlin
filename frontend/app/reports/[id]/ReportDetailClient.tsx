"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, {
  Report,
  Expense,
  API_BASE_URL,
  downloadBlob,
  duplicateExpense,
} from "@/lib/api";
import { reportKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ToastProvider";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  DollarSign,
  FileDown,
  FolderDown,
  PenLine,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { formatAmount } from "@/lib/format";
import { useTranslations } from "next-intl";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

export default function ReportDetailClient({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showPreflightDrawer, setShowPreflightDrawer] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const t = useTranslations("reports");
  const te = useTranslations("expenses");
  const tc = useTranslations("common");

  async function handleExportExpenses(format: "csv" | "xlsx") {
    setExporting(true);
    setExportOpen(false);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadBlob(
        `/reports/${id}/export-csv`,
        { format },
        `report_${id}_expenses_${today}.${format}`,
      );
    } catch {
      toast.error(t("error_export"));
    } finally {
      setExporting(false);
    }
  }

  const clearError = () => setMutationError("");
  const onError = (msg: string) => () => setMutationError(msg);

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: reportKeys.detail(parseInt(id)),
    queryFn: () => api.get(`/reports/${id}`).then((r) => r.data),
  });

  const { data: draftExpenses } = useQuery<Expense[]>({
    queryKey: expenseKeys.list({ status: "draft", no_report: true }),
    queryFn: () =>
      api.get("/expenses", { params: { status: "draft" } }).then((r) => r.data),
    enabled: report?.status === "draft",
  });

  const attach = useMutation({
    mutationFn: (expenseIds: number[]) =>
      api.post(`/reports/${id}/attach`, { expense_ids: expenseIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      setSelectedIds(new Set());
      clearError();
    },
    onError: onError(t("detail_error_attach")),
  });

  const submit = useMutation({
    mutationFn: () => api.post(`/reports/${id}/submit`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      setShowPreflightDrawer(false);
      clearError();
    },
    onError: onError(t("detail_error_submit")),
  });

  const pay = useMutation({
    mutationFn: () => api.post(`/reports/${id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      clearError();
    },
    onError: onError(t("detail_error_paid")),
  });

  const recall = useMutation({
    mutationFn: () => api.post(`/reports/${id}/recall`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      clearError();
    },
    onError: onError(t("detail_error_recall")),
  });

  const sign = useMutation({
    mutationFn: () => api.post(`/reports/${id}/sign`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      clearError();
    },
    onError: onError(t("detail_error_sign")),
  });

  const approve = useMutation({
    mutationFn: () => api.post(`/reports/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      clearError();
    },
    onError: onError(t("detail_error_approve")),
  });

  const reject = useMutation({
    mutationFn: () =>
      api.post(`/reports/${id}/reject`, { reason: rejectionReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      setShowRejectInput(false);
      setRejectionReason("");
      clearError();
    },
    onError: onError(t("detail_error_reject")),
  });

  const delExpense = useMutation({
    mutationFn: (expenseId: number) => api.delete(`/expenses/${expenseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      clearError();
    },
    onError: onError(t("detail_error_delete")),
  });

  const duplicate = useMutation({
    mutationFn: duplicateExpense,
    onSuccess: (newExpense) => {
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      router.push(`/expenses/${newExpense.id}/edit`);
    },
    onError: onError(t("detail_error_duplicate")),
  });

  const confirmDeleteExpense = (eid: number) => {
    if (window.confirm(te("delete_confirm"))) {
      delExpense.mutate(eid);
    }
  };

  const toggleExpense = (eid: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(eid) ? next.delete(eid) : next.add(eid);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === availableDrafts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableDrafts.map((e) => e.id)));
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div
          role="status"
          aria-live="polite"
          className="animate-pulse space-y-4 mt-8"
        >
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-64" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-20 bg-slate-200 dark:bg-slate-700 rounded-xl"
              />
            ))}
          </div>
          <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        </div>
      </AppShell>
    );
  }
  if (!report)
    return (
      <AppShell>
        <p className="text-red-500 text-sm">{t("detail_not_found")}</p>
      </AppShell>
    );

  const availableDrafts = draftExpenses?.filter((e) => !e.report_id) ?? [];
  const computedTotal = report.expenses.reduce(
    (sum, e) => sum + e.amount_eur,
    0,
  );
  const displayTotal = computedTotal || report.total_amount;

  const canApproveOrReject =
    (user?.role === "manager" || user?.role === "chef_finance") &&
    report.user_id !== user?.id;

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          href="/reports"
          className="flex items-center gap-1 text-sm text-muted hover:text-slate-800 dark:hover:text-slate-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> {t("detail_back")}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {report.title}
            </h1>
            {report.description && (
              <p className="text-muted text-sm mt-1 whitespace-pre-wrap break-words">
                {report.description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={report.status} />
            {report.status === "approved" && report.approved_at && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                {t("detail_approved_on")}{" "}
                {new Date(report.approved_at).toLocaleDateString()}
              </span>
            )}
            {report.status === "draft" && (
              <Link
                href={`/reports/${id}/edit`}
                className="flex items-center gap-2 px-3 py-1.5 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-card-hover"
              >
                <Pencil className="w-4 h-4" />
                {t("detail_edit")}
              </Link>
            )}
            <button
              onClick={() =>
                downloadBlob(`/reports/${id}/export`, {}, `report_${id}.pdf`)
              }
              className="flex items-center gap-2 px-3 py-1.5 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-card-hover cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              {t("detail_export_pdf")}
            </button>
            <button
              onClick={() =>
                downloadBlob(
                  `/reports/${id}/receipts-zip`,
                  {},
                  `receipts_${id}.zip`,
                )
              }
              className="flex items-center gap-2 px-3 py-1.5 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-card-hover cursor-pointer"
            >
              <FolderDown className="w-4 h-4" />
              {t("detail_download_receipts")}
            </button>
            <div className="relative">
              <button
                disabled={exporting}
                onClick={() => setExportOpen((v) => !v)}
                aria-expanded={exportOpen}
                className="flex items-center gap-2 px-3 py-1.5 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-card-hover disabled:opacity-50 cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                {exporting
                  ? t("detail_exporting")
                  : t("detail_export_expenses")}
              </button>
              {exportOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setExportOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-36 bg-input border border-border rounded-lg shadow-lg z-50">
                    <button
                      onClick={() => handleExportExpenses("csv")}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-t-lg"
                    >
                      {t("detail_csv")}
                    </button>
                    <button
                      onClick={() => handleExportExpenses("xlsx")}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-b-lg"
                    >
                      {t("detail_xlsx")}
                    </button>
                  </div>
                </>
              )}
            </div>
            {!report.signed_at &&
              user &&
              report.user_id === user.id &&
              (user.has_signature ? (
                <button
                  onClick={() => sign.mutate()}
                  disabled={sign.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <PenLine className="w-4 h-4" />
                  {sign.isPending
                    ? t("detail_signing")
                    : t("detail_sign_report")}
                </button>
              ) : (
                <Link
                  href="/profile/signature"
                  className="flex items-center gap-2 px-3 py-1.5 border border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 text-sm font-medium rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                >
                  <PenLine className="w-4 h-4" />
                  {t("detail_record_signature")}
                </Link>
              ))}
          </div>
        </div>
      </div>

      <DelegationReportDetails report={report} />

      {/* Mutation error banner */}
      {mutationError && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{mutationError}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Rejection banner */}
      {report.status === "rejected" && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
          <div className="flex items-start gap-2 flex-1">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {t("detail_rejection_heading")}
              </p>
              {report.rejected_reason && (
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                  {report.rejected_reason}
                </p>
              )}
            </div>
          </div>
          {report.user_id === user?.id && (
            <button
              onClick={() => recall.mutate()}
              disabled={recall.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 shrink-0"
            >
              <Undo2 className="w-4 h-4" />
              {recall.isPending
                ? t("detail_recalling")
                : t("detail_recall_draft")}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-muted-foreground uppercase mb-1">
            {t("detail_card_total")}
          </p>
          <p className="text-xl font-bold text-foreground">
            {formatAmount(displayTotal, "EUR")}
          </p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-muted-foreground uppercase mb-1">
            {t("detail_card_count")}
          </p>
          <p className="text-xl font-bold text-foreground">
            {report.expenses.length}
          </p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-purple-400 dark:text-purple-500 uppercase mb-1">
            {t("detail_card_allowance")}
          </p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
            {formatAmount(report.daily_allowance || 0, "EUR")}
          </p>
        </div>
        <Link
          href={`/reports/${id}/advances`}
          className="bg-card rounded-xl shadow-sm p-4 hover:ring-2 hover:ring-orange-300 dark:hover:ring-orange-700 transition-all"
        >
          <p className="text-xs text-orange-400 dark:text-orange-500 uppercase mb-1">
            {t("detail_card_advances")}
          </p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
            {formatAmount(report.total_advances, "EUR")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">View details →</p>
        </Link>
        <Link
          href={`/reports/${id}/mileage`}
          className="bg-card rounded-xl shadow-sm p-4 hover:ring-2 hover:ring-teal-300 dark:hover:ring-teal-700 transition-all"
        >
          <p className="text-xs text-teal-400 dark:text-teal-500 uppercase mb-1">
            {t("detail_card_mileage")}
          </p>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400">
            {formatAmount(report.total_mileage_eur || 0, "EUR")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">View details →</p>
        </Link>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-emerald-400 dark:text-emerald-500 uppercase mb-1">
            {t("detail_card_reimbursable")}
          </p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatAmount(report.total_reimbursable, "EUR")}
          </p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-muted-foreground uppercase mb-1">
            {t("detail_card_period")}
          </p>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {report.date_from && report.date_to
              ? `${report.date_from} — ${report.date_to}`
              : "—"}
          </p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-muted-foreground uppercase mb-1">
            {t("detail_card_submitted")}
          </p>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {report.submitted_at
              ? new Date(report.submitted_at).toLocaleDateString()
              : "—"}
          </p>
        </div>
      </div>

      {/* Attach expenses */}
      {report.status === "draft" && (
        <div className="bg-slate-50 dark:bg-slate-800 border border-border rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("detail_attach_text")}
            </p>
            <Link
              href={`/expenses/new?reportId=${id}&currency=${report.currency}`}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("detail_add_expense")}
            </Link>
          </div>
          {availableDrafts.length > 0 ? (
            <>
              <div className="space-y-1 mb-3">
                <label className="flex items-center gap-3 cursor-pointer py-1 border-b border-border mb-2">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === availableDrafts.length &&
                      availableDrafts.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-xs font-semibold text-muted uppercase">
                    {selectedIds.size === availableDrafts.length
                      ? t("detail_deselect_all")
                      : t("detail_select_all")}
                  </span>
                </label>
                {availableDrafts.map((e) => (
                  <label
                    key={e.id}
                    className="min-h-12 flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-background hover:bg-card-hover cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(e.id)}
                        onChange={() => toggleExpense(e.id)}
                        className="w-5 h-5 rounded accent-blue-600 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {e.merchant || e.description || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {e.date}{" "}
                          {e.category_name ? `· ${e.category_name}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground shrink-0">
                      {formatAmount(e.amount_eur, "EUR")}
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => attach.mutate(Array.from(selectedIds))}
                disabled={attach.isPending || selectedIds.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {attach.isPending
                  ? t("detail_adding")
                  : t("detail_add_to_report")}
              </button>
            </>
          ) : (
            <p className="text-sm text-muted italic">
              {t("detail_empty_unattached")}
            </p>
          )}
        </div>
      )}

      {/* Submit report */}
      {report.status === "draft" && report.expenses.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6 flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {report.expenses.length === 1
              ? t("detail_submit_expense_one")
              : t("detail_submit_expense_other", {
                  count: report.expenses.length,
                })}{" "}
            {t("detail_submit_suffix")}
          </p>
          <button
            type="button"
            onClick={() => setShowPreflightDrawer(true)}
            disabled={submit.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {submit.isPending
              ? t("detail_submitting")
              : t("detail_submit_report")}
          </button>
        </div>
      )}

      {/* Submitted: awaiting approval */}
      {report.status === "submitted" && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">
              {t("detail_awaiting_approval")}
            </p>
            <div className="flex flex-wrap gap-2">
              {report.user_id === user?.id && (
                <button
                  onClick={() => recall.mutate()}
                  disabled={recall.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  <Undo2 className="w-4 h-4" />
                  {recall.isPending
                    ? t("detail_recalling")
                    : t("detail_recall_draft")}
                </button>
              )}
              {canApproveOrReject && (
                <>
                  <button
                    onClick={() => approve.mutate()}
                    disabled={approve.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {approve.isPending ? t("detail_approving") : tc("approve")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectInput((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
                  >
                    <X className="w-4 h-4" />
                    {tc("reject")}
                  </button>
                </>
              )}
            </div>
          </div>
          {showRejectInput && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder={t("detail_rejection_placeholder")}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-base sm:text-sm bg-input text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-red-400"
              />
              <button
                onClick={() => reject.mutate()}
                disabled={reject.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 shrink-0"
              >
                {reject.isPending
                  ? t("detail_rejecting")
                  : t("detail_confirm_reject")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Approved: awaiting payment */}
      {report.status === "approved" && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6 flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("detail_awaiting_payment")}
          </p>
          {user?.role === "chef_finance" && (
            <button
              onClick={() => pay.mutate()}
              disabled={pay.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <DollarSign className="w-4 h-4" />
              {pay.isPending ? t("detail_processing") : t("detail_mark_paid")}
            </button>
          )}
        </div>
      )}

      {/* Signature */}
      {report.signed_at && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t("detail_signature_heading")}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("detail_signature_signed")}{" "}
            {new Date(report.signed_at).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}

      {/* Expense list */}
      <div className="bg-card rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("detail_expenses_heading")} ({report.expenses.length})
          </h2>
        </div>
        {!report.expenses.length ? (
          <EmptyState message={t("detail_expenses_empty")} />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {report.expenses.map((e) => (
                <div key={e.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">
                        {e.merchant || "—"}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {e.date} · {e.category_name || "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-foreground">
                        {formatAmount(e.amount_eur, "EUR")}
                      </p>
                      {e.currency_original !== "EUR" && (
                        <p className="text-xs text-muted-foreground">
                          {formatAmount(e.amount_original, e.currency_original)}
                        </p>
                      )}
                    </div>
                  </div>
                  {e.description && (
                    <p className="text-sm text-muted mt-2">{e.description}</p>
                  )}
                  {e.receipts?.length > 0 && (
                    <div className="flex items-center gap-2 mt-3">
                      {e.receipts.map((r) => (
                        <button
                          key={r.id}
                          onClick={() =>
                            downloadBlob(
                              `/expenses/${e.id}/receipts/${r.id}`,
                              {},
                              r.original_name || `receipt_${r.id}`,
                            )
                          }
                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs cursor-pointer"
                        >
                          {e.receipts.length === 1
                            ? t("detail_receipt_view")
                            : r.original_name
                                ?.split(".")
                                .pop()
                                ?.toUpperCase() || t("detail_receipt_view")}
                        </button>
                      ))}
                    </div>
                  )}
                  {report.status === "draft" && (
                    <div className="flex items-center justify-end gap-1 mt-3">
                      <button
                        onClick={() => duplicate.mutate(e.id)}
                        disabled={duplicate.isPending}
                        title={te("duplicate_tooltip")}
                        aria-label={`${te("duplicate_tooltip")} ${e.merchant || e.id}`}
                        className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Copy className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <Link
                        href={`/expenses/${e.id}/edit`}
                        aria-label={`${t("detail_expense_edit")} ${e.merchant || e.id}`}
                        className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Pencil
                          className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                          aria-hidden="true"
                        />
                      </Link>
                      <button
                        type="button"
                        onClick={() => confirmDeleteExpense(e.id)}
                        disabled={delExpense.isPending}
                        aria-label={`${t("detail_expense_delete")} ${e.merchant || e.id}`}
                        className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Trash2
                          className="w-4 h-4 text-slate-400 hover:text-red-500"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-muted uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">
                      {t("detail_table_date")}
                    </th>
                    <th className="text-left px-4 py-3">
                      {t("detail_table_merchant")}
                    </th>
                    <th className="text-left px-4 py-3 hidden sm:table-cell">
                      {t("detail_table_category")}
                    </th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">
                      {t("detail_table_description")}
                    </th>
                    <th className="text-right px-4 py-3 hidden sm:table-cell">
                      {t("detail_table_original")}
                    </th>
                    <th className="text-right px-4 py-3">
                      {t("detail_table_eur")}
                    </th>
                    <th className="text-right px-4 py-3">
                      {t("detail_table_receipt")}
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {report.expenses.map((e) => (
                    <tr
                      key={e.id}
                      className="border-t border-slate-100 dark:border-slate-700"
                    >
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {e.date}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {e.merchant || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted hidden sm:table-cell">
                        {e.category_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted hidden md:table-cell">
                        {e.description || "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted hidden sm:table-cell">
                        {e.currency_original !== "EUR" ? (
                          <>
                            {formatAmount(
                              e.amount_original,
                              e.currency_original,
                            )}
                            {e.fx_rate_manual && (
                              <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                manual
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {formatAmount(e.amount_eur, "EUR")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.receipts?.length > 0 ? (
                          <div className="flex items-center justify-end gap-1">
                            {e.receipts.map((r) => (
                              <button
                                key={r.id}
                                onClick={() =>
                                  downloadBlob(
                                    `/expenses/${e.id}/receipts/${r.id}`,
                                    {},
                                    r.original_name || `receipt_${r.id}`,
                                  )
                                }
                                className="text-blue-600 dark:text-blue-400 hover:underline text-xs cursor-pointer"
                              >
                                {e.receipts.length === 1
                                  ? t("detail_receipt_view")
                                  : r.original_name
                                      ?.split(".")
                                      .pop()
                                      ?.toUpperCase() ||
                                    t("detail_receipt_view")}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-xs">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {report.status === "draft" && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => duplicate.mutate(e.id)}
                              disabled={duplicate.isPending}
                              title={te("duplicate_tooltip")}
                              aria-label={`${te("duplicate_tooltip")} ${e.merchant || e.id}`}
                              className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <Copy className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <Link
                              href={`/expenses/${e.id}/edit`}
                              aria-label={`${t("detail_expense_edit")} ${e.merchant || e.id}`}
                              className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <Pencil
                                className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                                aria-hidden="true"
                              />
                            </Link>
                            <button
                              type="button"
                              onClick={() => confirmDeleteExpense(e.id)}
                              disabled={delExpense.isPending}
                              aria-label={`${t("detail_expense_delete")} ${e.merchant || e.id}`}
                              className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <Trash2
                                className="w-4 h-4 text-slate-400 hover:text-red-500"
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <PreflightSubmissionDrawer
        isOpen={showPreflightDrawer}
        onClose={() => setShowPreflightDrawer(false)}
        report={report}
        displayTotal={displayTotal}
        onSubmit={() => submit.mutate()}
        isSubmitting={submit.isPending}
      />
    </AppShell>
  );
}

/** Shows delegation email import details when present on a report */
function DelegationReportDetails({ report }: { report: Report }) {
  const t = useTranslations("reports");
  const hasAny = !!(
    report.kundenauftrag ||
    report.auftragsart ||
    report.positionstyp ||
    report.technplatz_raw ||
    report.kunde_code ||
    report.kunde_name ||
    report.adresse ||
    report.vorgang ||
    report.arbeitsplatz ||
    report.techniker
  );
  if (!hasAny) return null;

  const Row = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex gap-2 py-1.5 border-b border-border-subtle last:border-0">
        <span className="text-[11px] font-medium text-muted-foreground w-28 shrink-0 pt-px">
          {label}
        </span>
        <span className="text-[12px] text-foreground leading-snug">
          {value}
        </span>
      </div>
    ) : null;

  return (
    <div className="mt-6 mb-6 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-100/60 dark:bg-indigo-900/30 border-b border-indigo-100 dark:border-indigo-900/40">
        <svg
          className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2zm4 0v1h4V2H6zm-1 3a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2H5zm0 3a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2H5z" />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          {t("detail_delegation_heading")}
        </span>
        <span className="ml-auto text-[10px] text-indigo-400 dark:text-indigo-500 font-medium">
          {t("detail_delegation_email")}
        </span>
      </div>

      {/* Two-column layout for compact fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 px-4 py-3">
        {/* Column 1: Order identifiers */}
        <div>
          <Row label={t("delegation_order_nr")} value={report.kundenauftrag} />
          <Row label={t("delegation_order_type")} value={report.auftragsart} />
          <Row label={t("delegation_task")} value={report.positionstyp} />
          <Row label={t("delegation_operation")} value={report.vorgang} />
          <Row
            label={t("delegation_location")}
            value={
              report.technplatz_raw
                ? report.technplatz_line
                  ? `${report.technplatz_raw} · ${t("delegation_production_line")}`
                  : report.technplatz_raw
                : null
            }
          />
        </div>
        {/* Column 2: Client + personnel */}
        <div>
          <Row label={t("delegation_customer_nr")} value={report.kunde_code} />
          <Row label={t("delegation_customer")} value={report.kunde_name} />
          <Row label={t("delegation_address")} value={report.adresse} />
          <Row label={t("delegation_workplace")} value={report.arbeitsplatz} />
          <Row label={t("delegation_technician")} value={report.techniker} />
        </div>
      </div>
    </div>
  );
}

function PreflightSubmissionDrawer({
  isOpen,
  onClose,
  report,
  displayTotal,
  onSubmit,
  isSubmitting,
}: {
  isOpen: boolean;
  onClose: () => void;
  report: Report;
  displayTotal: number;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const expensesWithReceipts = report.expenses.filter(
    (e) => (e.receipts?.length || 0) > 0,
  ).length;
  const missingReceipts = report.expenses.length - expensesWithReceipts;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preflight-heading"
      className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl flex flex-col max-h-[90vh] max-h-[90dvh] overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="preflight-heading"
                className="text-base font-bold text-foreground"
              >
                {t("preflight_title")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("preflight_subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc("close")}
            className="min-w-10 min-h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto min-h-0 text-sm">
          {/* Report summary card */}
          <div className="p-4 rounded-xl border border-border bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="font-semibold text-foreground">{report.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {report.date_from && report.date_to
                    ? `${report.date_from} — ${report.date_to}`
                    : "—"}{" "}
                  · {report.expenses.length}{" "}
                  {report.expenses.length === 1
                    ? t("detail_submit_expense_one")
                    : t("detail_submit_expense_other")}
                </p>
              </div>
            </div>
            <hr className="border-border my-2" />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">
                  {t("preflight_total")}:
                </span>
                <p className="font-bold text-base text-foreground mt-0.5">
                  {formatAmount(displayTotal, "EUR")}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t("preflight_reimbursable")}:
                </span>
                <p className="font-bold text-base text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatAmount(report.total_reimbursable, "EUR")}
                </p>
              </div>
            </div>
          </div>

          {/* Receipt Attachment Audit */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t("preflight_receipts_audit")}
            </p>
            {missingReceipts === 0 ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {t("preflight_all_receipts", { count: expensesWithReceipts })}
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    {t("preflight_missing_receipts", {
                      count: missingReceipts,
                    })}
                  </span>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 pl-6">
                  {t("preflight_missing_receipts_hint")}
                </p>
              </div>
            )}
          </div>

          {/* Final Notice */}
          <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300">
            {t("preflight_notice")}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-border bg-card flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-11 px-4 py-2 text-sm font-medium rounded-xl border border-input-border text-slate-700 dark:text-slate-300 hover:bg-card-hover transition-colors cursor-pointer"
          >
            {t("preflight_cancel")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="min-h-11 px-5 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? t("detail_submitting") : t("preflight_confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
