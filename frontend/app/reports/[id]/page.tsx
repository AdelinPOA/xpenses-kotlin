"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Report, Expense, API_BASE_URL } from "@/lib/api";
import { reportKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { AlertTriangle, ArrowLeft, Check, DollarSign, FileDown, FolderDown, PenLine, Pencil, Plus, Send, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(amount);
}

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mutationError, setMutationError] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const clearError = () => setMutationError("");
  const onError = (msg: string) => () => setMutationError(msg);

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: reportKeys.detail(parseInt(id)),
    queryFn: () => api.get(`/reports/${id}`).then((r) => r.data),
  });

  const { data: draftExpenses } = useQuery<Expense[]>({
    queryKey: expenseKeys.list({ status: "draft", no_report: true }),
    queryFn: () => api.get("/expenses", { params: { status: "draft" } }).then((r) => r.data),
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
    onError: onError("Failed to attach expenses. Please try again."),
  });

  const submit = useMutation({
    mutationFn: () => api.post(`/reports/${id}/submit`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      clearError();
    },
    onError: onError("Failed to submit report. Please try again."),
  });

  const pay = useMutation({
    mutationFn: () => api.post(`/reports/${id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      clearError();
    },
    onError: onError("Failed to mark as paid. You may not have permission."),
  });

  const recall = useMutation({
    mutationFn: () => api.post(`/reports/${id}/recall`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      clearError();
    },
    onError: onError("Failed to recall report. Please try again."),
  });

  const sign = useMutation({
    mutationFn: () => api.post(`/reports/${id}/sign`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      clearError();
    },
    onError: onError("Failed to sign report. Please try again."),
  });

  const approve = useMutation({
    mutationFn: () => api.post(`/reports/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      clearError();
    },
    onError: onError("Failed to approve report. You may not have permission or cannot approve your own report."),
  });

  const reject = useMutation({
    mutationFn: () => api.post(`/reports/${id}/reject`, { reason: rejectionReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      setShowRejectInput(false);
      setRejectionReason("");
      clearError();
    },
    onError: onError("Failed to reject report. You may not have permission or cannot reject your own report."),
  });

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
        <div role="status" aria-live="polite" className="animate-pulse space-y-4 mt-8">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-64" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700 rounded-xl" />)}
          </div>
          <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        </div>
      </AppShell>
    );
  }
  if (!report) return <AppShell><p className="text-red-500 text-sm">Report not found</p></AppShell>;

  const availableDrafts = draftExpenses?.filter((e) => !e.report_id) ?? [];
  const computedTotal = report.expenses.reduce((sum, e) => sum + e.amount_eur, 0);
  const displayTotal = computedTotal || report.total_amount;

  const canApproveOrReject =
    (user?.role === "manager" || user?.role === "chef_finance") &&
    report.user_id !== user?.id;

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/reports" className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to reports
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{report.title}</h1>
            {report.description && <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{report.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={report.status} />
            {report.status === "approved" && report.approved_at && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                Approved on {new Date(report.approved_at).toLocaleDateString()}
              </span>
            )}
            {report.status === "draft" && (
              <Link
                href={`/reports/${id}/edit`}
                className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
            )}
            <a
              href={`${API_BASE_URL}/reports/${id}/export`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <FileDown className="w-4 h-4" />
              Export PDF
            </a>
            <a
              href={`${API_BASE_URL}/reports/${id}/receipts-zip`}
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <FolderDown className="w-4 h-4" />
              Download receipts
            </a>
            {!report.signed_at && user && report.user_id === user.id && (
              user.signature_path ? (
                <button
                  onClick={() => sign.mutate()}
                  disabled={sign.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <PenLine className="w-4 h-4" />
                  {sign.isPending ? "Signing..." : "Sign Report"}
                </button>
              ) : (
                <Link
                  href="/profile/signature"
                  className="flex items-center gap-2 px-3 py-1.5 border border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 text-sm font-medium rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                >
                  <PenLine className="w-4 h-4" />
                  Record Signature
                </Link>
              )
            )}
          </div>
        </div>
      </div>

      {/* Mutation error banner */}
      {mutationError && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{mutationError}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss error"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Rejection banner */}
      {report.status === "rejected" && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
          <div className="flex items-start gap-2 flex-1">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Report rejected</p>
              {report.rejected_reason && (
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">{report.rejected_reason}</p>
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
              {recall.isPending ? "Recalling..." : "Recall to draft"}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 uppercase mb-1">Total Expenses</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatAmount(displayTotal, "EUR")}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 uppercase mb-1">Expenses</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{report.expenses.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-purple-400 dark:text-purple-500 uppercase mb-1">Daily Allowance</p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{formatAmount(report.daily_allowance || 0, "EUR")}</p>
        </div>
        <Link href={`/reports/${id}/advances`} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 hover:ring-2 hover:ring-orange-300 dark:hover:ring-orange-700 transition-all">
          <p className="text-xs text-orange-400 dark:text-orange-500 uppercase mb-1">Advances</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{formatAmount(report.total_advances, "EUR")}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">View details →</p>
        </Link>
        <Link href={`/reports/${id}/mileage`} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 hover:ring-2 hover:ring-teal-300 dark:hover:ring-teal-700 transition-all">
          <p className="text-xs text-teal-400 dark:text-teal-500 uppercase mb-1">Mileage</p>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{formatAmount(report.total_mileage_eur || 0, "EUR")}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">View details →</p>
        </Link>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-emerald-400 dark:text-emerald-500 uppercase mb-1">Reimbursable</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(report.total_reimbursable, "EUR")}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 uppercase mb-1">Period</p>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {report.date_from && report.date_to
              ? `${report.date_from} — ${report.date_to}`
              : "—"}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 uppercase mb-1">Submitted</p>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {report.submitted_at ? new Date(report.submitted_at).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>

      {/* Attach expenses */}
      {report.status === "draft" && (
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Attach existing draft expenses or add new:
            </p>
            <Link
              href={`/expenses/new?reportId=${id}&currency=${report.currency}`}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add New Expense
            </Link>
          </div>
          {availableDrafts.length > 0 ? (
            <>
              <div className="space-y-1 mb-3">
                <label className="flex items-center gap-3 cursor-pointer py-1 border-b border-slate-200 dark:border-slate-700 mb-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === availableDrafts.length && availableDrafts.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    {selectedIds.size === availableDrafts.length ? "Deselect all" : "Select all"}
                  </span>
                </label>
                {availableDrafts.map((e) => (
                  <label key={e.id} className="flex items-center gap-3 cursor-pointer py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleExpense(e.id)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {e.merchant || e.description || "—"} — {e.date} — {formatAmount(e.amount_eur, "EUR")}
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => attach.mutate(Array.from(selectedIds))}
                disabled={attach.isPending || selectedIds.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {attach.isPending ? "Adding..." : "Add to report"}
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">No unattached draft expenses available. You can add a new expense directly.</p>
          )}
        </div>
      )}

      {/* Submit report */}
      {report.status === "draft" && report.expenses.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-6 flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {report.expenses.length} expense{report.expenses.length !== 1 ? "s" : ""} attached — ready to submit?
          </p>
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submit.isPending ? "Submitting..." : "Submit report"}
          </button>
        </div>
      )}

      {/* Submitted: awaiting approval */}
      {report.status === "submitted" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">
              This report is awaiting manager approval.
            </p>
            <div className="flex flex-wrap gap-2">
              {report.user_id === user?.id && (
                <button
                  onClick={() => recall.mutate()}
                  disabled={recall.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  <Undo2 className="w-4 h-4" />
                  {recall.isPending ? "Recalling..." : "Recall to draft"}
                </button>
              )}
              {canApproveOrReject && (
                <>
                  <button
                    onClick={() => approve.mutate()}
                    disabled={approve.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {approve.isPending ? "Approving..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectInput((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
          {showRejectInput && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Rejection reason (optional)"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-red-400"
              />
              <button
                onClick={() => reject.mutate()}
                disabled={reject.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 shrink-0"
              >
                {reject.isPending ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Approved: awaiting payment */}
      {report.status === "approved" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-6 flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This report has been approved and is awaiting payment.
          </p>
          {user?.role === "chef_finance" && (
            <button
              onClick={() => pay.mutate()}
              disabled={pay.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <DollarSign className="w-4 h-4" />
              {pay.isPending ? "Processing..." : "Mark as paid"}
            </button>
          )}
        </div>
      )}

      {/* Signature */}
      {report.signed_at && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Signed</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Signed on {new Date(report.signed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      )}

      {/* Expense list */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Expenses ({report.expenses.length})</h2>
        </div>
        {!report.expenses.length ? (
          <EmptyState message="No expenses attached to this report" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Merchant</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Category</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Description</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Original</th>
                  <th className="text-right px-4 py-3">EUR</th>
                  <th className="text-right px-4 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {report.expenses.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{e.merchant || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{e.category_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden md:table-cell">{e.description || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                      {e.currency_original !== "EUR"
                        ? formatAmount(e.amount_original, e.currency_original)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatAmount(e.amount_eur, "EUR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.receipts?.length > 0 ? (
                        <div className="flex items-center justify-end gap-1">
                          {e.receipts.map((r) => (
                            <a
                              key={r.id}
                              href={`${API_BASE_URL}/expenses/${e.id}/receipts/${r.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                            >
                              {e.receipts.length === 1 ? "View" : (r.original_name?.split(".").pop()?.toUpperCase() || "View")}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </AppShell>
  );
}
