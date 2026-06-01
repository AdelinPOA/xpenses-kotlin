"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import api, { Report } from "@/lib/api";
import { reportKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Trash2, Eye } from "lucide-react";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
}

export default function ReportsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: reportKeys.list({ status: statusFilter }),
    queryFn: () =>
      api.get("/reports", { params: statusFilter ? { status: statusFilter } : {} }).then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/reports/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Expense Reports</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{reports?.length ?? 0} total</p>
        </div>
        <Link
          href="/reports/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 w-fit"
        >
          <Plus className="w-4 h-4" />
          New report
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-2">
          {["", "draft", "submitted", "approved", "rejected", "paid"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">Loading...</div>
        ) : !reports?.length ? (
          <EmptyState message="No reports found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Period</th>
                  <th className="text-left px-4 py-3">Expenses</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Submitted</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.title}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                      {r.date_from && r.date_to ? `${r.date_from} — ${r.date_to}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.expenses.length}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatEur(r.expenses.reduce((s, e) => s + e.amount_eur, 0) || r.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/reports/${r.id}`}>
                          <Eye className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                        </Link>
                        {r.status === "draft" && (
                          <button onClick={() => del.mutate(r.id)} disabled={del.isPending}>
                            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                          </button>
                        )}
                      </div>
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
