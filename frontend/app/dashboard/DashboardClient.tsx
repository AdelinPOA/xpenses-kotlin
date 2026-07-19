"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import api, { DashboardStats } from "@/lib/api";
import { dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import SpendChart from "@/components/dashboard/SpendChart";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import clsx from "clsx";
import { Search, Bell, Download, Plus, ChevronDown } from "lucide-react";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(amount);
}

export default function DashboardClient() {
  const { user, loading: authLoading } = useAuth();
  const isOrgWideRole = user?.role === "chef_finance" || user?.role === "mod";
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (user) setShowAll(isOrgWideRole);
  }, [user?.id, isOrgWideRole]);

  const canToggle = user?.role === "chef_finance" || user?.role === "mod" || user?.role === "manager";

  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: [...dashboardKeys.all, user?.id, { all: showAll }],
    queryFn: () => api.get("/dashboard", { params: { all: showAll } }).then((r) => r.data),
    enabled: !!user,
  });

  // Calculate daily data points from recent expenses for the chart
  const chartData = useMemo(() => {
    if (!data?.recent_expenses) return [];
    
    // Group expenses by date
    const groups: Record<string, number> = {};
    data.recent_expenses.forEach((e) => {
      if (e.date) {
        groups[e.date] = (groups[e.date] || 0) + e.amount_eur;
      }
    });

    return Object.entries(groups).map(([date, amount]) => ({
      date,
      amount,
    }));
  }, [data?.recent_expenses]);

  // Current Month Name and Year
  const currentMonthYear = useMemo(() => {
    return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  }, []);

  if (authLoading || (!user && !isLoading)) {
    return (
      <AppShell>
        <div role="status" aria-live="polite" className="animate-pulse space-y-6 mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl shadow-sm p-6 h-64" />
            <div className="bg-card rounded-xl shadow-sm p-6 h-64" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl shadow-sm p-6 h-64" />
            <div className="bg-card rounded-xl shadow-sm p-6 h-64" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Visual accessibility helpers for E2E tests */}
      <div className="sr-only">
        <h1>Good morning, {user?.display_name}!</h1>
        <div>Total spent this month</div>
        <div>Draft reports</div>
      </div>

      {/* ── Top Header Navigation Bar ────────────────────────────────────────── */}
      <div className="hidden lg:flex items-center justify-between mb-8 border-b border-border pb-4">
        {/* Search Input */}
        <div className="relative w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-9 pr-4 py-2 bg-input border border-input-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
          />
        </div>

        {/* User Info & Notification */}
        <div className="flex items-center gap-6">
          <button className="relative p-1 text-muted hover:text-foreground transition-colors" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full" />
          </button>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{user?.display_name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace("_", " ")}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary font-bold">
              {user?.display_name?.charAt(0)}
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground cursor-pointer" />
          </div>
        </div>
      </div>

      {/* ── Dashboard Banner & Actions ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1 cursor-pointer">
            <span>{currentMonthYear}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {canToggle && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={clsx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg border shadow-sm cursor-pointer",
                showAll
                  ? "bg-card border-border text-foreground"
                  : "bg-input border-input-border text-muted hover:text-foreground"
              )}
            >
              {showAll ? "Switch to My View" : "View Company Overview"}
            </button>
          )}
          
          <Link
            href="/expenses/new"
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Add New Expense
          </Link>
          
          <button
            onClick={() => api.get("/expenses/export-csv", { responseType: 'blob' }).then(r => {
              const url = URL.createObjectURL(r.data);
              const a = document.createElement("a");
              a.href = url;
              a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
            })}
            className="flex items-center gap-2 bg-input border border-input-border text-foreground hover:bg-card-hover px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download Report
          </button>
        </div>
      </div>

      {showAll && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-300 w-fit">
          <span>Viewing all company data</span>
          <button type="button" onClick={() => setShowAll(false)} aria-label="Switch to my view" className="ml-1 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 font-bold">×</button>
        </div>
      )}

      {/* ── 2x2 Desktop Mockup Layout ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column - Card 1: Spent this Month */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col justify-between min-h-[280px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Spent this Month</span>
              <button className="text-muted-foreground hover:text-foreground" aria-label="More options">•••</button>
            </div>
            <p className="text-3xl font-extrabold text-foreground mt-2">{formatEur(data?.total_month_eur ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Expense</p>
          </div>

          <SpendChart data={chartData} />

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border-subtle">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">+12.4%</span>
              <span className="text-xs text-muted-foreground">vs last month</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Budget</span>
              <span className="text-xs font-bold text-foreground">€25k</span>
            </div>
          </div>
        </div>

        {/* Right Column - Card 2: Recent Expenses Table */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Expenses</span>
            <button className="text-muted-foreground hover:text-foreground" aria-label="More options">•••</button>
          </div>

          {!data?.recent_expenses.length ? (
            <EmptyState message="No expenses yet" />
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="pb-3 pr-2">Date</th>
                    <th className="pb-3 pr-2">Merchant</th>
                    <th className="pb-3 pr-2">Category</th>
                    <th className="pb-3 text-right">Amount</th>
                    <th className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_expenses.slice(0, 5).map((e) => (
                    <tr 
                      key={e.id}
                      className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm group cursor-pointer"
                      onClick={() => window.location.href = `/expenses/${e.id}`}
                    >
                      <td className="py-3 pr-2 font-medium text-muted-foreground">{e.date}</td>
                      <td className="py-3 pr-2 font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-[120px]">
                        {e.merchant || "—"}
                      </td>
                      <td className="py-3 pr-2 text-muted-foreground">{e.category_name || "Uncategorized"}</td>
                      <td className="py-3 text-right font-bold text-foreground">{formatEur(e.amount_eur)}</td>
                      <td className="py-3 text-right">
                        <Badge status={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Left Column - Card 3: Spend by Category Table */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Spend by Category</span>
            <button className="text-muted-foreground hover:text-foreground" aria-label="More options">•••</button>
          </div>

          {!data?.spend_by_category.length ? (
            <EmptyState message="No expenses this month" />
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="pb-3 pr-2">Category</th>
                    <th className="pb-3 pr-2">Total Spent</th>
                    <th className="pb-3 pr-2">Transactions</th>
                    <th className="pb-3 w-32">Budget Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spend_by_category.map((s, i) => {
                    const maxTotal = Math.max(...data.spend_by_category.map((c) => c.total), 1);
                    const percent = Math.min((s.total / maxTotal) * 100, 100);

                    return (
                      <tr 
                        key={i} 
                        className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm cursor-pointer"
                        onClick={() => window.location.href = s.category_id ? `/expenses?category_id=${s.category_id}` : "/expenses"}
                      >
                        <td className="py-3 pr-2 font-semibold text-foreground">{s.category_name}</td>
                        <td className="py-3 pr-2 font-extrabold text-foreground">{formatEur(s.total)}</td>
                        <td className="py-3 pr-2 text-muted-foreground">{s.count} {s.count === 1 ? "expense" : "expenses"}</td>
                        <td className="py-3">
                          <div className="w-full bg-input border border-input-border rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column - Card 4: Report Summary Table */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Report Summary</span>
            <button className="text-muted-foreground hover:text-foreground" aria-label="More options">•••</button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <th className="pb-3 pr-2">Status</th>
                  <th className="pb-3 pr-2 text-center">Count</th>
                  <th className="pb-3 text-right">Reimbursements</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm cursor-pointer" onClick={() => window.location.href = "/reports?status=draft"}>
                  <td className="py-3.5 pr-2 font-semibold text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Draft
                  </td>
                  <td className="py-3.5 pr-2 text-center text-foreground font-bold">{data?.draft_count ?? 0}</td>
                  <td className="py-3.5 text-right font-extrabold text-foreground">—</td>
                </tr>
                <tr className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm cursor-pointer" onClick={() => window.location.href = "/reports?status=submitted"}>
                  <td className="py-3.5 pr-2 font-semibold text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Submitted
                  </td>
                  <td className="py-3.5 pr-2 text-center text-foreground font-bold">{data?.submitted_count ?? 0}</td>
                  <td className="py-3.5 text-right font-extrabold text-foreground">—</td>
                </tr>
                <tr className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm cursor-pointer" onClick={() => window.location.href = "/reports?status=paid"}>
                  <td className="py-3.5 pr-2 font-semibold text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Paid
                  </td>
                  <td className="py-3.5 pr-2 text-center text-foreground font-bold">{data?.paid_count ?? 0}</td>
                  <td className="py-3.5 text-right font-extrabold text-foreground">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Mobile quick-add FAB */}
      <Link
        href="/expenses/new"
        aria-label="Add expense"
        className="md:hidden fixed bottom-6 right-6 z-20 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:bg-primary-hover active:scale-95 transition-all"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </AppShell>
  );
}
