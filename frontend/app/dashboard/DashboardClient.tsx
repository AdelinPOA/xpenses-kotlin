"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import api, { DashboardStats, downloadBlob } from "@/lib/api";
import { dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import SpendChart from "@/components/dashboard/SpendChart";
import ExpenseStatusOverview from "@/components/dashboard/ExpenseStatusOverview";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { useReviewQueueActions } from "@/lib/reviewQueueActions";
import clsx from "clsx";
import { 
  Bell, Download, Plus, ChevronDown, 
  Briefcase, Utensils, Plane, Car, Building, FileText, LucideIcon 
} from "lucide-react";
import { formatEur } from "@/lib/format";
import { useTranslations } from "next-intl";
import PendingReportsTable from "@/components/dashboard/PendingReportsTable";
import PendingAdvancesList from "@/components/dashboard/PendingAdvancesList";
import SlideOverReviewDrawer from "@/components/dashboard/SlideOverReviewDrawer";
import RecentActivityStream from "@/components/dashboard/RecentActivityStream";
import SearchDropdown from "@/components/ui/SearchDropdown";
import { ManagerDashboardStats } from "@/lib/api";

// Maps category names to circles & icons matching mobile mockup specs
function getCategoryMeta(categoryName: string | null): { Icon: LucideIcon; colorClass: string; bgClass: string } {
  const name = (categoryName || "").toLowerCase();
  if (name.includes("accommodation") || name.includes("hotel") || name.includes("stay")) {
    return { Icon: Building, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10" };
  }
  if (name.includes("meal") || name.includes("food") || name.includes("dinner") || name.includes("restaurant")) {
    return { Icon: Utensils, colorClass: "text-orange-500", bgClass: "bg-orange-500/10" };
  }
  if (name.includes("flight") || name.includes("travel") || name.includes("airline")) {
    return { Icon: Plane, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10" };
  }
  if (name.includes("taxi") || name.includes("transport") || name.includes("car") || name.includes("ride")) {
    return { Icon: Car, colorClass: "text-rose-500", bgClass: "bg-rose-500/10" };
  }
  if (name.includes("supplies") || name.includes("office") || name.includes("hardware")) {
    return { Icon: Briefcase, colorClass: "text-blue-500", bgClass: "bg-blue-500/10" };
  }
  return { Icon: FileText, colorClass: "text-slate-500", bgClass: "bg-slate-500/10" };
}

export default function DashboardClient() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const isOrgWideRole = user?.role === "chef_finance" || user?.role === "mod";
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (user) setShowAll(isOrgWideRole);
  }, [user?.id, isOrgWideRole]);

  const canToggle = user?.role === "chef_finance" || user?.role === "mod" || user?.role === "manager";
  const isManagerRole = user?.role === "manager" || user?.role === "chef_finance" || user?.role === "mod";
  const canManageReviews = user?.role === "manager" || user?.role === "chef_finance";
  const isManagerWorkHub = user?.role === "manager";
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: [...dashboardKeys.all, user?.id, "all", showAll],
    queryFn: () => api.get("/dashboard", { params: { all: showAll } }).then((r) => r.data),
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: managerStats, refetch: refetchManagerStats } = useQuery<ManagerDashboardStats>({
    queryKey: dashboardKeys.manager(),
    queryFn: () => api.get("/dashboard/manager").then((r) => r.data),
    enabled: !!user && isManagerRole,
    staleTime: 30_000,
  });

  const reviewActions = useReviewQueueActions({
    approveErrorMessage: t("failed_approve"),
    rejectErrorMessage: t("failed_reject"),
    onSuccess: (action) => {
      setReviewActionError(null);
      setSelectedReportId(null);
      toast.success(action === "approve" ? tc("approve") : tc("reject"));
    },
    onError: (message) => {
      setReviewActionError(message);
      toast.error(message);
    },
  });

  const handleApproveReport = (reportId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    reviewActions.approve.mutate(reportId);
  };

  const handleRejectReport = (reportId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedReportId(reportId);
  };

  const handlePayAdvance = async (reportId: number, advanceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post(`/reports/${reportId}/advances/${advanceId}/pay`);
      refetchManagerStats();
    } catch (err) {
      console.error("Pay advance error", err);
    }
  };

  const handleRejectAdvance = async (reportId: number, advanceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post(`/reports/${reportId}/advances/${advanceId}/reject`);
      refetchManagerStats();
    } catch (err) {
      console.error("Reject advance error", err);
    }
  };

  // Calculate daily data points for desktop chart
  const chartData = useMemo(() => {
    if (!data?.recent_expenses) return [];
    const groups: Record<string, number> = {};
    data.recent_expenses.forEach((e) => {
      if (e.date) {
        groups[e.date] = (groups[e.date] || 0) + e.amount_eur;
      }
    });
    return Object.entries(groups).map(([date, amount]) => ({ date, amount }));
  }, [data?.recent_expenses]);

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
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* ── DESKTOP VIEW ONLY ────────────────────────────────────────────────── */}
      <div className="hidden lg:block space-y-8">
        {/* Top Header Navigation Bar */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <SearchDropdown className="w-80" />

          <div className="flex items-center gap-6">
            <button className="relative p-1 text-muted hover:text-foreground transition-colors" aria-label={t("notifications")}>
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

        {/* Dashboard Title & Action Row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
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
                {showAll ? t("toggle_my_view") : t("toggle_company_overview")}
              </button>
            )}
            
            <Link
              href="/expenses/new"
              className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {t("add_expense")}
            </Link>
            
            <button
              onClick={() => downloadBlob("/expenses/export-csv", {}, `expenses-${new Date().toISOString().slice(0, 10)}.csv`)}
              className="flex items-center gap-2 bg-input border border-input-border text-foreground hover:bg-card-hover px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {t("download_report")}
            </button>
          </div>
        </div>

        {/* ── MANAGER WORKFLOW DASHBOARD ────────────────────────────────────────── */}
        {isManagerRole && managerStats && (
          <section className="space-y-5 border-b border-border pb-8">
            <div className="flex flex-col gap-4 border-l-4 border-primary pl-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("review_desk")}</p>
                <h2 className="mt-1 text-2xl font-bold text-foreground">{t("manager_work_hub")}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("manager_work_hub_subtitle")}</p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <span className="border-l border-border pl-3 font-semibold text-foreground">
                  {t("reports_ready", { count: canManageReviews ? managerStats.pending_reports.length : 0 })}
                </span>
                <span className="border-l border-border pl-3 font-semibold text-foreground">
                  {t("advances_ready", { count: managerStats.pending_advances.length })}
                </span>
              </div>
            </div>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.85fr)]">
              <PendingReportsTable
                reports={canManageReviews ? managerStats.pending_reports : []}
                onSelectReport={(id) => setSelectedReportId(id)}
                onApprove={handleApproveReport}
                onReject={handleRejectReport}
              />

              <PendingAdvancesList
                advances={managerStats.pending_advances}
                onSelectAdvance={(reportId) => setSelectedReportId(reportId)}
                onPay={handlePayAdvance}
                onReject={handleRejectAdvance}
              />
            </div>

            <RecentActivityStream activities={managerStats.recent_activity} />
          </section>
        )}

        {/* 2x2 Desktop Grid */}
        {!isManagerWorkHub && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Card 1: Spent this Month */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col justify-between min-h-[280px]">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("total_spend")}</span>
                <button className="text-muted-foreground hover:text-foreground">•••</button>
              </div>
              <p className="text-3xl font-extrabold text-foreground mt-2">{formatEur(data?.total_last_report_eur ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("total_expense")}</p>
            </div>

            <SpendChart data={chartData} />


          </div>

          {/* Card 2: Recent Expenses Table */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col min-h-[280px]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("recent_expenses")}</span>
              <button className="text-muted-foreground hover:text-foreground">•••</button>
            </div>

            {!data?.recent_expenses.length ? (
              <EmptyState message={t("no_expenses")} />
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="pb-3 pr-2">{t("date")}</th>
                      <th className="pb-3 pr-2">{t("merchant")}</th>
                      <th className="pb-3 pr-2">{t("category")}</th>
                      <th className="pb-3 text-right">{t("amount")}</th>
                      <th className="pb-3 text-right">{t("status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_expenses.slice(0, 5).map((e) => (
                      <tr 
                        key={e.id}
                        className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm group cursor-pointer"
                        onClick={() => router.push(`/expenses/${e.id}`)}
                      >
                        <td className="py-3 pr-2 font-medium text-muted-foreground">{e.date}</td>
                        <td className="py-3 pr-2 font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-[120px]">
                          {e.merchant || "—"}
                        </td>
                        <td className="py-3 pr-2 text-muted-foreground">{e.category_name || tc("uncategorized")}</td>
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

          {/* Card 3: Spend by Category Table */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col min-h-[280px]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("spend_by_category")}</span>
              <button className="text-muted-foreground hover:text-foreground">•••</button>
            </div>

            {!data?.spend_by_category.length ? (
              <EmptyState message={t("no_expenses_this_month")} />
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="pb-3 pr-2">{t("category")}</th>
                      <th className="pb-3 pr-2">{t("total_spent")}</th>
                      <th className="pb-3 pr-2">{t("transactions")}</th>
                      <th className="pb-3 w-32">{t("share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totalCategorySpend = data.spend_by_category.reduce((sum, c) => sum + c.total, 0) || 1;
                      return data.spend_by_category.map((s, i) => {
                        const percent = Math.min((s.total / totalCategorySpend) * 100, 100);

                        return (
                          <tr 
                            key={i} 
                            className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm cursor-pointer"
                            onClick={() => router.push(s.category_id ? `/expenses?category_id=${s.category_id}` : "/expenses")}
                          >
                            <td className="py-3 pr-2 font-semibold text-foreground">{s.category_name}</td>
                            <td className="py-3 pr-2 font-extrabold text-foreground">{formatEur(s.total)}</td>
                            <td className="py-3 pr-2 text-muted-foreground">{s.count === 1 ? t("expense_count_one", { count: s.count }) : t("expense_count_other", { count: s.count })}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-input border border-input-border rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary transition-all duration-500"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-muted-foreground w-8 text-right">{percent.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Card 4: Report Summary Table */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col min-h-[280px]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("report_summary")}</span>
              <button className="text-muted-foreground hover:text-foreground">•••</button>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="pb-3 pr-2">{t("status")}</th>
                    <th className="pb-3 pr-2 text-center">{t("count")}</th>
                    <th className="pb-3 text-right">{t("reimbursements")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm cursor-pointer" onClick={() => router.push("/reports?status=draft")}>
                    <td className="py-3.5 pr-2 font-semibold text-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      {t("draft_reports")}
                    </td>
                    <td className="py-3.5 pr-2 text-center text-foreground font-bold">{data?.draft_count ?? 0}</td>
                    <td className="py-3.5 text-right font-extrabold text-foreground">—</td>
                  </tr>
                  <tr className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm cursor-pointer" onClick={() => router.push("/reports?status=submitted")}>
                    <td className="py-3.5 pr-2 font-semibold text-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      {t("submitted_reports")}
                    </td>
                    <td className="py-3.5 pr-2 text-center text-foreground font-bold">{data?.submitted_count ?? 0}</td>
                    <td className="py-3.5 text-right font-extrabold text-foreground">—</td>
                  </tr>
                  <tr className="border-b border-border-subtle hover:bg-card-hover transition-colors text-sm cursor-pointer" onClick={() => router.push("/reports?status=paid")}>
                    <td className="py-3.5 pr-2 font-semibold text-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {t("paid_reports")}
                    </td>
                    <td className="py-3.5 pr-2 text-center text-foreground font-bold">{data?.paid_count ?? 0}</td>
                    <td className="py-3.5 text-right font-extrabold text-foreground">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
        )}
      </div>

      {/* ── MOBILE VIEW ONLY (Restructured matching mockup) ────────────────── */}
      <div className="lg:hidden flex flex-col gap-6 pt-2">
        {/* Greeting & Quick Action Row */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">
            {t("greeting", { name: user?.display_name ?? "" })}
          </h1>
          <Link
            href="/expenses/new"
            className="min-h-11 bg-primary hover:bg-primary-hover text-white text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-full transition-colors flex items-center gap-1 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {t("quick_add_expense")} <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        {isManagerWorkHub && managerStats ? (
          <>
            <div className="border-l-4 border-primary pl-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{t("review_desk")}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {t("reports_ready", { count: managerStats.pending_reports.length })}
              </p>
            </div>
            <PendingReportsTable
              reports={canManageReviews ? managerStats.pending_reports : []}
              onSelectReport={(id) => setSelectedReportId(id)}
              onApprove={handleApproveReport}
              onReject={handleRejectReport}
            />
            <PendingAdvancesList
              advances={managerStats.pending_advances}
              onSelectAdvance={(reportId) => setSelectedReportId(reportId)}
              onPay={handlePayAdvance}
              onReject={handleRejectAdvance}
            />
            <RecentActivityStream activities={managerStats.recent_activity} />
          </>
        ) : (
          <>
        <div className="grid grid-cols-2 gap-4">
          {/* Card 1: Spending */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between min-h-[92px]">
            <div>
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">{t("total_spend")}</span>
              <p className="text-lg font-black text-foreground mt-1.5 leading-none">{formatEur(data?.total_last_report_eur ?? 0)}</p>
            </div>

          </div>

          {/* Card 2: Requests */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between min-h-[92px]">
            <div>
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">{t("pending_approval")}</span>
              <p className="text-lg font-black text-foreground mt-1.5 leading-none">{data?.pending_approval_count ?? 0} {t("requests")}</p>
            </div>

          </div>
        </div>

        {/* Recent Expenses List Cards */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t("recent_expenses")}</span>
            <Link href="/expenses" className="min-h-11 px-3 inline-flex items-center text-[10px] font-bold text-primary uppercase tracking-widest hover:underline rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {t("see_all")}
            </Link>
          </div>

          {!data?.recent_expenses.length ? (
            <EmptyState message={t("no_expenses")} />
          ) : (
            <div className="space-y-4">
              {data.recent_expenses.slice(0, 5).map((e) => {
                const { Icon, colorClass, bgClass } = getCategoryMeta(e.category_name);
                return (
                  <Link 
                    key={e.id} 
                    href={`/expenses/${e.id}`}
                    className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Circle Category Icon */}
                      <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center shrink-0", bgClass, colorClass)}>
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{e.merchant || "—"}</p>
                        <p className="text-[10px] font-semibold text-muted-foreground truncate mt-0.5">
                          {e.date} · {e.category_name || tc("uncategorized")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0 pl-2">
                      <p className="text-sm font-black text-foreground whitespace-nowrap">- {formatEur(e.amount_eur)}</p>
                      <div className="mt-1">
                        <Badge status={e.status} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Expense Status Donut Chart Overview */}
        <ExpenseStatusOverview 
          approved={data?.paid_count ?? 0}
          pending={data?.submitted_count ?? 0}
          total={data?.expense_count_month ?? 0}
        />
          </>
        )}
      </div>

      <SlideOverReviewDrawer
        reportId={selectedReportId}
        onClose={() => {
          setSelectedReportId(null);
          refetchManagerStats();
        }}
        onApprove={() => selectedReportId !== null && reviewActions.approve.mutate(selectedReportId)}
        onReject={(reason) => selectedReportId !== null && reviewActions.reject.mutate({ id: selectedReportId, reason })}
        actionPending={reviewActions.approve.isPending || reviewActions.reject.isPending}
        actionError={reviewActionError}
      />
    </AppShell>
  );
}
