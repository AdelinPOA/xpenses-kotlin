"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api, { Expense, API_BASE_URL, duplicateExpense } from "@/lib/api";
import { expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Trash2, Pencil, Copy } from "lucide-react";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(amount);
}

export default function ExpensesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: expenseKeys.list({ status: statusFilter }),
    queryFn: () =>
      api.get("/expenses", { params: statusFilter ? { status: statusFilter } : {} }).then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });

  const duplicate = useMutation({
    mutationFn: duplicateExpense,
    onSuccess: (newExpense) => {
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      router.push(`/expenses/${newExpense.id}/edit`);
    },
  });

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Expenses</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{expenses?.length ?? 0} total</p>
        </div>
        <Link
          href="/expenses/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 w-fit"
        >
          <Plus className="w-4 h-4" />
          Add expense
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-2">
          {["", "draft", "submitted", "paid"].map((s) => (
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
        ) : !expenses?.length ? (
          <EmptyState message="No expenses found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Merchant</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-right px-4 py-3">EUR</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Receipt</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{e.merchant || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.category_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[180px] truncate">{e.description || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {formatAmount(e.amount_eur, "EUR")}
                      </span>
                      {e.currency_original !== "EUR" && (
                        <span className="block text-xs text-slate-400 dark:text-slate-500 font-normal">
                          {formatAmount(e.amount_original, e.currency_original)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge status={e.status} />
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => duplicate.mutate(e.id)}
                          disabled={duplicate.isPending}
                          title="Duplicate Expense"
                          className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {e.status === "draft" && (
                          <>
                            <Link href={`/expenses/${e.id}/edit`}>
                              <Pencil className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                            </Link>
                            <button
                              onClick={() => del.mutate(e.id)}
                              disabled={del.isPending}
                            >
                              <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                            </button>
                          </>
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
