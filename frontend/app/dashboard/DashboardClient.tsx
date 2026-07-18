"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
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
import { CheckSquare, Banknote, FileText, Plus } from "lucide-react";
import SegmentedControl from "@/components/ui/SegmentedControl";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(amount);
}

export default function DashboardClient() {
  const { user, loading: authLoading } = useAuth();
  // chef_finance and mod default to org-wide view; everyone else defaults to personal view.
  const isOrgWideRole = user?.role === "chef_finance" || user?.role === "mod";
  const [showAll, setShowAll] = useState(false);
  // Once the user is known, set the correct default without causing an extra render loop.
  useEffect(() => {
    if (user) setShowAll(isOrgWideRole);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // All privileged roles (chef_finance, mod, manager) can toggle between personal and org view.
  const canToggle = user?.role === "chef_finance" || user?.role === "mod" || user?.role === "manager";

  const { data, isLoading } = useQuery<DashboardStats>({
    // Include user.id in the key so the cache is never shared across different logged-in users.
    queryKey: [...dashboardKeys.all, user?.id, { all: showAll }],
    queryFn: () => api.get("/dashboard", { params: { all: showAll } }).then((r) => r.data),
    enabled: !!user,
  });

  if (authLoading || (!user && !isLoading)) {
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
      <div className="page-transition">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <DashboardGreeting name={user?.display_name || "Guest"} />
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {showAll ? "Organization-wide overview" : "Here is what's happening with your expenses."}
          </p>
        </div>
        {canToggle && (
          <div className="flex justify-start sm:justify-center w-full sm:w-auto">
            <SegmentedControl
              options={[
                { label: "My View", value: false },
                { label: "Company View", value: true },
              ]}
              value={showAll}
              onChange={setShowAll}
            />
          </div>
        )}
      </div>
      {showAll && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-300 w-fit">
          <span>Viewing all company data</span>
          <button type="button" onClick={() => setShowAll(false)} aria-label="Switch to my view" className="ml-1 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 font-bold">×</button>
        </div>
      )}

      {!showAll && user && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
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
        <div className="glass-panel rounded-3xl p-7">
          <h2 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-6 uppercase tracking-[0.2em]">Spend by Category</h2>
          {!data?.spend_by_category.length ? (
            <EmptyState message="No expenses this month" />
          ) : (
            <div className="space-y-5">
              {data.spend_by_category.map((s, i) => {
                const maxTotal = Math.max(...data.spend_by_category.map((c) => c.total), 1);
                const percent = Math.min((s.total / maxTotal) * 100, 100);
                
                // Color cycle for category progress bars
                const colors = [
                  "from-blue-500 to-indigo-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]",
                  "from-emerald-500 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]",
                  "from-violet-500 to-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.4)]",
                  "from-amber-500 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]",
                  "from-rose-500 to-pink-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]",
                ];
                const gradient = colors[i % colors.length];

                return (
                  <div key={i} className="group relative p-2 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                      <Link
                        href={s.category_id ? `/expenses?category_id=${s.category_id}` : "/expenses"}
                        className="text-sm font-bold text-zinc-800 dark:text-zinc-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        {s.category_name}
                      </Link>
                      <span className="text-sm font-black text-zinc-950 dark:text-zinc-50 tracking-tight">
                        {formatEur(s.total)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-full h-2 overflow-hidden shadow-inner">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-1000 ease-out`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 shrink-0 w-20 text-right">
                        {s.count} {s.count === 1 ? "exp" : "exps"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-3xl p-7">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">Recent Expenses</h2>
            <Link href="/expenses" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors">
              View all
            </Link>
          </div>
          {!data?.recent_expenses.length ? (
            <EmptyState message="No expenses yet" />
          ) : (
            <div className="space-y-3">
              {data.recent_expenses.slice(0, 5).map((e) => (
                <Link key={e.id} href={`/expenses/${e.id}`} className="group flex items-center justify-between p-4 border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/30 dark:hover:border-indigo-400/30 hover:bg-white/60 dark:hover:bg-zinc-800/40 rounded-2xl transition-colors duration-200 shadow-sm">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {e.merchant || e.description || "—"}
                    </p>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate mt-1">
                      {e.date} <span className="mx-1.5 opacity-50">•</span> {e.category_name || "Uncategorized"}
                      {showAll && e.user_display_name && <><span className="mx-1.5 opacity-50">•</span> {e.user_display_name}</>}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4 flex flex-col items-end">
                    <p className="text-lg font-black text-zinc-900 dark:text-zinc-50 tracking-tighter">
                      {formatEur(e.amount_eur)}
                    </p>
                    <div className="mt-1.5 scale-90 origin-right">
                      <Badge status={e.status} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile quick-add: skips drilling through the sidebar to reach the expense form */}
      <Link
        href="/expenses/new"
        aria-label="Add expense"
        className="md:hidden fixed bottom-6 right-6 z-20 flex items-center justify-center w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
      >
        <Plus className="w-6 h-6" />
      </Link>
      </div>
    </AppShell>
  );
}
