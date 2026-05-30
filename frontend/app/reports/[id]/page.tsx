"use client";

import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Report, Expense } from "@/lib/api";
import { reportKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { ArrowLeft, CheckCircle, DollarSign, FileDown, FolderDown, Pencil, Plus, Send, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(amount);
}

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  const toggleExpense = (eid: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(eid) ? next.delete(eid) : next.add(eid);
      return next;
    });
  };

  if (isLoading) return <AppShell><p className="text-slate-400 text-sm mt-8">Loading...</p></AppShell>;
  if (!report) return <AppShell><p className="text-red-500 text-sm">Report not found</p></AppShell>;

  const availableDrafts = draftExpenses?.filter((e) => !e.report_id) ?? [];

  const computedTotal = report.expenses.reduce((sum, e) => sum + e.amount_eur, 0);
  const displayTotal = computedTotal || report.total_amount;

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/reports" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to reports
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{report.title}</h1>
            {report.description && <p className="text-slate-500 text-sm mt-1">{report.description}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Badge status={report.status} />
            {report.status === "draft" && (
              <Link
                href={`/reports/${id}/edit`}
                className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
            )}
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/reports/${id}/export`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50"
            >
              <FileDown className="w-4 h-4" />
              Export PDF
            </a>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/reports/${id}/receipts-zip`}
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50"
            >
              <FolderDown className="w-4 h-4" />
              Download receipts
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 uppercase mb-1">Total</p>
          <p className="text-xl font-bold text-slate-900">{formatAmount(displayTotal, "EUR")}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 uppercase mb-1">Expenses</p>
          <p className="text-xl font-bold text-slate-900">{report.expenses.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 uppercase mb-1">Period</p>
          <p className="text-sm font-medium text-slate-700">
            {report.date_from && report.date_to
              ? `${report.date_from} — ${report.date_to}`
              : "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-400 uppercase mb-1">Submitted</p>
          <p className="text-sm font-medium text-slate-700">
            {report.submitted_at ? new Date(report.submitted_at).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>

      {/* Attach expenses */}
      {report.status === "draft" && availableDrafts.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-slate-700 mb-3">
            Select draft expenses to attach to report:
          </p>
          <div className="space-y-2 mb-3">
            {availableDrafts.map((e) => (
              <label key={e.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.has(e.id)}
                  onChange={() => toggleExpense(e.id)}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm text-slate-700">
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
        </div>
      )}

      {/* Submit report */}
      {report.status === "draft" && report.expenses.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <p className="text-sm text-slate-600">
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
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <p className="text-sm text-slate-600">This report is awaiting payment.</p>
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
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Expenses ({report.expenses.length})</h2>
        </div>
        {!report.expenses.length ? (
          <EmptyState message="No expenses attached to this report" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
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
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-600">{e.date}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{e.merchant || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{e.category_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{e.description || "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {e.currency_original !== "EUR"
                      ? formatAmount(e.amount_original, e.currency_original)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatAmount(e.amount_eur, "EUR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.receipts?.length > 0 ? (
                      <div className="flex items-center justify-end gap-1">
                        {e.receipts.map((r) => (
                          <a
                            key={r.id}
                            href={`${process.env.NEXT_PUBLIC_API_URL}/expenses/${e.id}/receipts/${r.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline text-xs"
                          >
                            {e.receipts.length === 1 ? "View" : (r.original_name?.split(".").pop()?.toUpperCase() || "View")}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
