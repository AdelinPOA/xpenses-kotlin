"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import api, { DashboardStats } from "@/lib/api";
import { dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import StatCard from "@/components/dashboard/StatCard";
import DashboardGreeting from "@/components/dashboard/DashboardGreeting";
import DashboardActionCard from "@/components/dashboard/DashboardActionCard";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import clsx from "clsx";
import { CheckSquare, Banknote, FileText } from "lucide-react";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [showAll, setShowAll] = useState(false);
  const isPrivileged = user?.role === "chef_finance" || user?.role === "mod";

  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: [...dashboardKeys.all, { all: showAll }],
    queryFn: () => api.get("/dashboard", { params: { all: showAll } }).then((r) => r.data),
  });

  if (isLoading) {
    return (
      <AppShell>
        <div role="status" aria-live="polite" className="animate-pulse space-y-6 mt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 h-20" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 h-48" />
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 h-48" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <DashboardGreeting name={user?.display_name || "Guest"} />
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {showAll ? "Organization-wide overview" : "Here is what's happening with your expenses."}
          </p>
        </div>
        {isPrivileged && (
          <button
            onClick={() => setShowAll(!showAll)}
            className={clsx(
              "px-4 py-2 text-sm font-semibold rounded-lg transition-colors border shadow-sm",
              showAll
                ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-700 dark:border-slate-600"
                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
            )}
          >
            {showAll ? "Switch to My View" : "View Company Overview"}
          </button>
        )}
      </div>
      {showAll && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-300 w-fit">
          <span>Viewing all company data</span>
          <button type="button" onClick={() => setShowAll(false)} aria-label="Switch to my view" className="ml-1 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 font-bold">×</button>
        </div>
      )}

      {!showAll && user && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <DashboardActionCard
            title="Draft Reports"
            description="You have reports that haven't been submitted yet."
            count={data?.draft_count ?? 0}
            href="/reports?status=draft"
            icon={FileText}
            role="technician"
          />
          {(user.role === "manager" || user.role === "chef_finance") && (
            <DashboardActionCard
              title="Awaiting Approval"
              description="Reports from your team waiting for your review."
              count={data?.pending_approval_count ?? 0}
              href="/approvals"
              icon={CheckSquare}
              role="manager"
            />
          )}
          {user.role === "chef_finance" && (
            <DashboardActionCard
              title="Pending Payments"
              description="Approved reports that need to be processed for payment."
              count={data?.pending_payment_count ?? 0}
              href="/payments"
              icon={Banknote}
              role="chef_finance"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={showAll ? "Total spent this month" : "Spent this month"}
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
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                      <td className="py-2 text-slate-700 dark:text-slate-300">
                        <Link href={s.category_id ? `/expenses?category_id=${s.category_id}` : "/expenses"} className="hover:text-blue-600 dark:hover:text-blue-400">
                          {s.category_name}
                        </Link>
                      </td>
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
                <Link key={e.id} href={`/expenses/${e.id}`} className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors -mx-2 px-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {e.merchant || e.description || "—"}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                      {e.date} · {e.category_name || "Uncategorized"}
                      {showAll && e.user_display_name && ` · ${e.user_display_name}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatEur(e.amount_eur)}
                    </p>
                    <Badge status={e.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
