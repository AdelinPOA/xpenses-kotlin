"use client";

import { useQuery } from "@tanstack/react-query";
import api, { DashboardStats } from "@/lib/api";
import { dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import StatCard from "@/components/dashboard/StatCard";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: dashboardKeys.all,
    queryFn: () => api.get("/dashboard").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="text-slate-400 dark:text-slate-500 text-sm mt-8">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Overview of your expenses this month</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Spent this month"
          value={formatEur(data?.total_month_eur ?? 0)}
          sub={`${data?.expense_count_month ?? 0} expenses`}
          color="blue"
        />
        <StatCard
          label="Draft reports"
          value={data?.draft_count ?? 0}
          color="slate"
        />
        <StatCard
          label="Submitted reports"
          value={data?.submitted_count ?? 0}
          color="violet"
        />
        <StatCard
          label="Paid reports"
          value={data?.paid_count ?? 0}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Spend by Category (this month)</h2>
          {!data?.spend_by_category.length ? (
            <EmptyState message="No expenses this month" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 dark:text-slate-500 uppercase">
                    <th className="text-left pb-2">Category</th>
                    <th className="text-right pb-2">Count</th>
                    <th className="text-right pb-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spend_by_category.map((s, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-2 text-slate-700 dark:text-slate-300">{s.category_name}</td>
                      <td className="py-2 text-right text-slate-500 dark:text-slate-400">{s.count}</td>
                      <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                        {formatEur(s.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recent Expenses</h2>
            <Link href="/expenses" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              View all
            </Link>
          </div>
          {!data?.recent_expenses.length ? (
            <EmptyState message="No expenses yet" />
          ) : (
            <div className="space-y-2">
              {data.recent_expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-700">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {e.merchant || e.description || "—"}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {e.date} · {e.category_name || "Uncategorized"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatEur(e.amount_eur)}
                    </p>
                    {e.currency_original !== "EUR" && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {e.amount_original} {e.currency_original}
                      </p>
                    )}
                    <Badge status={e.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
