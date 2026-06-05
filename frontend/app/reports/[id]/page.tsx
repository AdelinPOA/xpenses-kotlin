"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Report, Expense, API_BASE_URL, CURRENCIES } from "@/lib/api";
import { reportKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { ArrowLeft, DollarSign, FileDown, FolderDown, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(amount);
}

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [advDate, setAdvDate] = useState("");
  const [advAmount, setAdvAmount] = useState("");
  const [advCurrency, setAdvCurrency] = useState("EUR");
  const [advDescription, setAdvDescription] = useState("");

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
    },
  });

  const submit = useMutation({
    mutationFn: () => api.post(`/reports/${id}/submit`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });

  const pay = useMutation({
    mutationFn: () => api.post(`/reports/${id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });

  const recall = useMutation({
    mutationFn: () => api.post(`/reports/${id}/recall`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });

  const addAdvance = useMutation({
    mutationFn: (data: { amount: number; currency: string; date: string; description: string | null }) =>
      api.post(`/reports/${id}/advances`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.detail(parseInt(id)) });
      setAdvDate("");
      setAdvAmount("");
      setAdvCurrency("EUR");
      setAdvDescription("");
    },
  });

  const deleteAdvance = useMutation({
    mutationFn: (advanceId: number) =>
      api.delete(`/reports/${id}/advances/${advanceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.detail(parseInt(id)) });
    },
  });

  const toggleExpense = (eid: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(eid) ? next.delete(eid) : next.add(eid);
      return next;
    });
  };

  const handleAddAdvance = () => {
    const amount = parseFloat(advAmount);
    if (!advDate || isNaN(amount) || amount <= 0) return;
    addAdvance.mutate({
      amount,
      currency: advCurrency,
      date: advDate,
      description: advDescription || null,
    });
  };

  if (isLoading) return <AppShell><p className="text-slate-400 dark:text-slate-500 text-sm mt-8">Loading...</p></AppShell>;
  if (!report) return <AppShell><p className="text-red-500 text-sm">Report not found</p></AppShell>;

  const availableDrafts = draftExpenses?.filter((e) => !e.report_id) ?? [];

  const computedTotal = report.expenses.reduce((sum, e) => sum + e.amount_eur, 0);
  const displayTotal = computedTotal || report.total_amount;

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
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex flex-col items-end gap-1">
              <Badge status={report.status} />
              {report.status === "approved" && report.approved_at && (
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  Approved on {new Date(report.approved_at).toLocaleDateString()}
                </span>
              )}
              {report.status === "rejected" && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  Rejected{report.rejected_reason ? `: ${report.rejected_reason}` : ""}
                </span>
              )}
            </div>
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
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 uppercase mb-1">Total Expenses</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatAmount(displayTotal, "EUR")}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 uppercase mb-1">Expenses</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{report.expenses.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-orange-400 dark:text-orange-500 uppercase mb-1">Advances</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{formatAmount(report.total_advances, "EUR")}</p>
        </div>
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
              <div className="space-y-2 mb-3">
            {availableDrafts.map((e) => (
              <label key={e.id} className="flex items-center gap-3 cursor-pointer">
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

      {/* Add advance payments */}
      {report.status === "draft" && (
        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Add advance payment received from company:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="date"
              value={advDate}
              onChange={(e) => setAdvDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              value={advAmount}
              onChange={(e) => setAdvAmount(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-32"
            />
            <select
              value={advCurrency}
              onChange={(e) => setAdvCurrency(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Description (optional)"
              value={advDescription}
              onChange={(e) => setAdvDescription(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 flex-1"
            />
            <button
              onClick={handleAddAdvance}
              disabled={addAdvance.isPending || !advDate || !advAmount}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {addAdvance.isPending ? "Adding..." : "Add advance"}
            </button>
          </div>
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

      {report.status === "submitted" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-6 flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">This report is awaiting payment.</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => recall.mutate()}
              disabled={recall.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" />
              {recall.isPending ? "Recalling..." : "Recall to draft"}
            </button>
            <button
              onClick={() => pay.mutate()}
              disabled={pay.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <DollarSign className="w-4 h-4" />
              {pay.isPending ? "Processing..." : "Mark as paid"}
            </button>
          </div>
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
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-right px-4 py-3">Original</th>
                  <th className="text-right px-4 py-3">EUR</th>
                  <th className="text-right px-4 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {report.expenses.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{e.merchant || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.category_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.description || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
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

      {/* Advance payments list */}
      {report.advances.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm mt-6">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Advance Payments ({report.advances.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-right px-4 py-3">Original</th>
                  <th className="text-right px-4 py-3">EUR</th>
                  {report.status === "draft" && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {report.advances.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{a.date}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{a.description || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                      {a.currency_original !== "EUR"
                        ? formatAmount(a.amount_original, a.currency_original)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-orange-600 dark:text-orange-400">
                      {formatAmount(a.amount_eur, "EUR")}
                    </td>
                    {report.status === "draft" && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteAdvance.mutate(a.id)}
                          disabled={deleteAdvance.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
