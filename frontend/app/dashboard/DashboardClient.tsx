"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import api, { DashboardStats, Report, downloadBlob, ManagerDashboardStats } from "@/lib/api";
import type { MobileUiConfig } from "@/lib/types/admin";
import { dashboardKeys, reportKeys, settingsKeys } from "@/lib/queryKeys";
import { triggerHaptic } from "@/lib/haptics";
import AppShell from "@/components/layout/AppShell";
import SpendChart from "@/components/dashboard/SpendChart";
import ExpenseStatusOverview from "@/components/dashboard/ExpenseStatusOverview";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { useAllowNavigation } from "@/lib/navigationGuard";
import { useReviewQueueActions } from "@/lib/reviewQueueActions";
import clsx from "clsx";
import { 
  Bell, Download, Plus, ChevronDown, 
  Briefcase, Utensils, Plane, Car, Building, FileText, LucideIcon,
  Search, Camera, ArrowUpRight, Clock, CheckCircle2, FileEdit
} from "lucide-react";
import { formatEur } from "@/lib/format";
import { useTranslations } from "next-intl";
import PendingReportsTable from "@/components/dashboard/PendingReportsTable";
import PendingAdvancesList from "@/components/dashboard/PendingAdvancesList";
import RecentActivityStream from "@/components/dashboard/RecentActivityStream";
import SearchDropdown from "@/components/ui/SearchDropdown";
import ReimbursementFlowLedger from "@/components/dashboard/ReimbursementFlowLedger";

function getCategoryMeta(categoryName: string | null): { Icon: LucideIcon; colorClass: string; bgClass: string } {
  const name = (categoryName || "").toLowerCase();
  if (name.includes("accommodation") || name.includes("hotel") || name.includes("stay") || name.includes("cazare")) {
    return { Icon: Building, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10" };
  }
  if (name.includes("meal") || name.includes("food") || name.includes("dinner") || name.includes("restaurant") || name.includes("masa") || name.includes("mancare")) {
    return { Icon: Utensils, colorClass: "text-orange-500", bgClass: "bg-orange-500/10" };
  }
  if (name.includes("flight") || name.includes("travel") || name.includes("airline") || name.includes("avion") || name.includes("transport aerian")) {
    return { Icon: Plane, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10" };
  }
  if (name.includes("taxi") || name.includes("transport") || name.includes("car") || name.includes("ride") || name.includes("combustibil") || name.includes("comb")) {
    return { Icon: Car, colorClass: "text-rose-500", bgClass: "bg-rose-500/10" };
  }
  if (name.includes("supplies") || name.includes("office") || name.includes("hardware") || name.includes("consumabile") || name.includes("scule")) {
    return { Icon: Briefcase, colorClass: "text-blue-500", bgClass: "bg-blue-500/10" };
  }
  return { Icon: FileText, colorClass: "text-slate-500", bgClass: "bg-slate-500/10" };
}

export default function DashboardClient() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const tcap = useTranslations("capture");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const allowNavigation = useAllowNavigation();

  const isOrgWideRole = user?.role === "chef_finance" || user?.role === "mod";
  const [showAll, setShowAll] = useState(true);

  const canToggle = user?.role === "chef_finance" || user?.role === "mod";
  const isManagerRole = user?.role === "manager" || (user?.role === "chef_finance" && showAll);
  const canManageReviews = user?.role === "manager" || user?.role === "chef_finance";
  const [recentExpensesSearch, setRecentExpensesSearch] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const { data: mobileUiConfig } = useQuery<MobileUiConfig>({
    queryKey: settingsKeys.mobileUi(),
    queryFn: () => api.get("/settings/ui").then((r) => r.data),
    enabled: !!user,
    staleTime: 300_000,
    gcTime: 600_000,
  });

  // Fetch standard dashboard stats
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: [...dashboardKeys.all, user?.id, "all", showAll],
    queryFn: () => api.get("/dashboard", { params: { all: showAll } }).then((r) => r.data),
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // Fetch reports list to compute accurate status EUR totals for technician summary
  const { data: userReports } = useQuery<Report[]>({
    queryKey: reportKeys.list(),
    queryFn: () => api.get("/reports").then((r) => r.data),
    enabled: !!user && !isManagerRole,
    staleTime: 60_000,
  });

  // Fetch manager workflow data when manager role
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
      refetchManagerStats();
      toast.success(action === "approve" ? tc("approve") : tc("reject"));
    },
    onError: (message) => {
      toast.error(message);
    },
    onBulkSuccess: (result, action) => {
      refetchManagerStats();
      const okCount = result.succeeded.length;
      if (result.failed.length === 0) {
        toast.success(
          action === "approve"
            ? t("bulk_approve_success", { count: okCount })
            : t("bulk_reject_success", { count: okCount })
        );
      } else {
        toast.error(t("bulk_partial_failure", { ok: okCount, failed: result.failed.length }));
      }
    },
  });

  const handleApproveReport = (reportId: number) => {
    triggerHaptic(15);
    reviewActions.approve.mutate(reportId);
  };

  const handleRejectReport = (reportId: number, reason: string) => {
    triggerHaptic(15);
    reviewActions.reject.mutate({ id: reportId, reason });
  };

  const handleBulkApproveReports = (ids: number[]) => {
    triggerHaptic(15);
    reviewActions.bulkApprove.mutate(ids);
  };

  const handleBulkRejectReports = (ids: number[], reason: string) => {
    triggerHaptic(15);
    reviewActions.bulkReject.mutate({ ids, reason });
  };

  const handlePayAdvance = async (reportId: number, advanceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic(15);
    try {
      await api.post(`/reports/${reportId}/advances/${advanceId}/pay`);
      refetchManagerStats();
      toast.success(tc("approve"));
    } catch (err) {
      console.error("Pay advance error", err);
      toast.error(tc("error"));
    }
  };

  const handleRejectAdvance = async (reportId: number, advanceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic(15);
    try {
      await api.post(`/reports/${reportId}/advances/${advanceId}/reject`);
      refetchManagerStats();
      toast.success(tc("reject"));
    } catch (err) {
      console.error("Reject advance error", err);
      toast.error(tc("error"));
    }
  };

  // Compute calculated amounts for reports summary (replaces hardcoded dashes)
  const reportStatusTotals = useMemo(() => {
    if (!userReports) {
      return {
        draftCount: data?.draft_count ?? 0,
        draftEur: 0,
        submittedCount: data?.submitted_count ?? 0,
        submittedEur: 0,
        paidCount: data?.paid_count ?? 0,
        paidEur: 0,
      };
    }

    let draftEur = 0;
    let submittedEur = 0;
    let paidEur = 0;

    userReports.forEach((r) => {
      const amount = r.total_reimbursable ?? r.total_amount ?? 0;
      if (r.status === "draft") draftEur += amount;
      else if (r.status === "submitted" || r.status === "approved") submittedEur += amount;
      else if (r.status === "paid") paidEur += amount;
    });

    return {
      draftCount: data?.draft_count ?? userReports.filter((r) => r.status === "draft").length,
      draftEur,
      submittedCount: data?.submitted_count ?? userReports.filter((r) => r.status === "submitted" || r.status === "approved").length,
      submittedEur,
      paidCount: data?.paid_count ?? userReports.filter((r) => r.status === "paid").length,
      paidEur,
    };
  }, [userReports, data]);

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

  const filteredRecentExpenses = useMemo(() => {
    if (!data?.recent_expenses) return [];
    if (!recentExpensesSearch.trim()) return data.recent_expenses;
    const q = recentExpensesSearch.toLowerCase();
    return data.recent_expenses.filter(
      (e) =>
        e.merchant?.toLowerCase().includes(q) ||
        e.category_name?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.date?.includes(q)
    );
  }, [data?.recent_expenses, recentExpensesSearch]);

  const currentMonthYear = useMemo(() => {
    return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  }, []);

  // Real pending-work count for the manager notification bell.
  const pendingNotificationCount = useMemo(
    () => (managerStats?.pending_reports?.length ?? 0) + (managerStats?.pending_advances?.length ?? 0),
    [managerStats]
  );

  if (authLoading || (!user && !isLoading)) {
    return (
      <AppShell>
        {/* Mobile High-Fidelity Skeleton */}
        <div role="status" aria-live="polite" className="lg:hidden flex flex-col gap-5 pt-1 animate-pulse">
          {/* Top Greeting Skeleton */}
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-6 w-36 bg-muted/20 rounded-lg" />
              <div className="h-3.5 w-24 bg-muted/15 rounded-md" />
            </div>
            <div className="h-8 w-16 bg-muted/20 rounded-full" />
          </div>

          {/* Spend KPI Card Skeleton */}
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-2.5 w-20 bg-muted/20 rounded" />
              <div className="h-6 w-24 bg-muted/25 rounded-md" />
            </div>
            <div className="space-y-1 flex flex-col items-end">
              <div className="h-2.5 w-16 bg-muted/20 rounded" />
              <div className="h-6 w-10 bg-muted/25 rounded-md" />
            </div>
          </div>

          {/* 3 Status Cards Carousel Skeleton */}
          <div className="flex sm:grid sm:grid-cols-3 gap-2.5 overflow-x-auto no-scrollbar">
            {[1, 2, 3].map((i) => (
              <div key={i} className="min-w-[115px] flex-1 bg-card border border-border rounded-xl p-3 shadow-2xs space-y-3">
                <div className="h-3.5 w-16 bg-muted/20 rounded" />
                <div className="space-y-1">
                  <div className="h-5 w-8 bg-muted/25 rounded" />
                  <div className="h-3 w-14 bg-muted/15 rounded" />
                </div>
              </div>
            ))}
          </div>

          {/* Recent Expenses Feed Skeleton */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-28 bg-muted/20 rounded" />
              <div className="h-3.5 w-12 bg-muted/20 rounded" />
            </div>
            <div className="divide-y divide-border">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-9 h-9 rounded-xl bg-muted/20 shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 w-28 bg-muted/25 rounded" />
                      <div className="h-3 w-20 bg-muted/15 rounded" />
                    </div>
                  </div>
                  <div className="h-4 w-14 bg-muted/20 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop Master-Detail Skeleton */}
        <div role="status" aria-live="polite" className="hidden lg:block animate-pulse space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-muted/20 rounded-xl" />
              <div className="h-4 w-28 bg-muted/15 rounded-md" />
            </div>
            <div className="flex gap-3">
              <div className="h-9 w-32 bg-muted/20 rounded-xl" />
              <div className="h-9 w-32 bg-muted/20 rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-7 bg-card rounded-2xl border border-border p-6 h-96" />
            <div className="col-span-5 space-y-6">
              <div className="bg-card rounded-2xl border border-border p-6 h-36" />
              <div className="bg-card rounded-2xl border border-border p-6 h-56" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* ── 1. TOP GLOBAL HEADER (DESKTOP) ────────────────────────────────────────── */}
      <div className="hidden lg:flex items-center justify-between border-b border-border pb-4 mb-6">
        <SearchDropdown className="w-80" />

        <div className="flex items-center gap-6">
          {/* Real notification indicator (Phase 3.3): managers see pending work;
              technicians have no notification source yet, so no fake dot. */}
          {isManagerRole && (
            <button
              onClick={() => router.push("/approvals")}
              className="relative p-1 text-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label={t("notifications_count", { count: pendingNotificationCount })}
            >
              <Bell className="w-5 h-5" />
              {pendingNotificationCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {pendingNotificationCount > 99 ? "99+" : pendingNotificationCount}
                </span>
              )}
            </button>
          )}

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">{user?.display_name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace("_", " ")}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center text-primary font-bold text-sm">
              {user?.display_name?.charAt(0) || "U"}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. MANAGER WORKSPACE (ACTION-ONLY REVIEW DESK) ────────────────────── */}
      {isManagerRole ? (
        <div className="space-y-6">
          {/* Manager Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card rounded-2xl p-5 sm:p-6 border border-border shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary">
                  {t("review_desk")}
                </span>
                <span className="text-xs text-muted-foreground">{currentMonthYear}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-foreground mt-1">{t("manager_work_hub")}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t("manager_work_hub_subtitle")}</p>
            </div>

            <div className="flex items-center gap-3">
              {canToggle && (
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-bold rounded-xl border shadow-xs cursor-pointer transition-colors",
                    showAll
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-background border-border text-muted hover:text-foreground"
                  )}
                >
                  {showAll ? t("toggle_my_view") : t("toggle_company_overview")}
                </button>
              )}

              <Link
                href="/approvals"
                className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors shadow-xs"
              >
                {t("open_review_queue")}
              </Link>
            </div>
          </div>

          {/* Manager Pending Queues */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            <div className="xl:col-span-2">
              <PendingReportsTable
                reports={canManageReviews && managerStats ? managerStats.pending_reports : []}
                onApprove={handleApproveReport}
                onReject={handleRejectReport}
                actionPending={reviewActions.approve.isPending || reviewActions.reject.isPending}
                onBulkApprove={handleBulkApproveReports}
                onBulkReject={handleBulkRejectReports}
                bulkPending={reviewActions.bulkApprove.isPending || reviewActions.bulkReject.isPending}
              />
            </div>

            <div className="xl:col-span-1">
              <PendingAdvancesList
                advances={managerStats?.pending_advances ?? []}
                onPay={handlePayAdvance}
                onReject={handleRejectAdvance}
              />
            </div>
          </div>

          {/* Full-width Team Activity Stream */}
          {managerStats && managerStats.recent_activity.length > 0 && (
            <RecentActivityStream activities={managerStats.recent_activity} />
          )}
        </div>
      ) : (
        /* ── 3. TECHNICIAN WORKSPACE ────────────────────────────────────────────── */
        <div>
          {/* ── DESKTOP TECHNICIAN VIEW (Master-Detail 2-Column Layout) ─────────────── */}
          <div className="hidden lg:block space-y-6">
            {/* Title & Action Bar */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-foreground">{t("title")}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{currentMonthYear}</p>
              </div>

              <div className="flex items-center gap-3">
                {canToggle && (
                  <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className={clsx(
                      "px-3.5 py-2 text-xs font-bold rounded-xl border shadow-xs cursor-pointer transition-colors",
                      showAll
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-background border-border text-muted hover:text-foreground"
                    )}
                  >
                    {showAll ? t("toggle_my_view") : t("toggle_company_overview")}
                  </button>
                )}

                <button
                  onClick={() => downloadBlob("/expenses/export-csv", {}, `expenses-${new Date().toISOString().slice(0, 10)}.csv`)}
                  className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-card-hover px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4 text-muted-foreground" />
                  {t("download_report")}
                </button>

                <Link
                  href="/expenses/new"
                  aria-label={t("add_expense")}
                  className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  {t("add_expense")}
                </Link>
              </div>
            </div>

            {/* Master-Detail 2-Column Grid */}
            <div className="grid grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN: Main Recent Expenses Table (7 / 12 width) */}
              <div className="col-span-12 xl:col-span-7 space-y-4">
                <div className="bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/10">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-foreground">{t("recent_expenses")}</h2>
                        <p className="text-xs text-muted-foreground">
                          {data?.expense_count_month ? `${data.expense_count_month} ${t("transactions").toLowerCase()}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={recentExpensesSearch}
                          onChange={(e) => setRecentExpensesSearch(e.target.value)}
                          placeholder={t("filter_expenses")}
                          className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary w-44"
                        />
                      </div>
                      <Link href="/expenses" className="text-xs font-bold text-primary hover:underline px-2 py-1">
                        {t("see_all")}
                      </Link>
                    </div>
                  </div>

                  {!filteredRecentExpenses.length ? (
                    <div className="p-8">
                      <EmptyState
                        message={t("no_expenses")}
                        actionLabel={t("add_expense")}
                        onAction={() => router.push("/expenses/new")}
                      />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/20">
                            <th className="py-3 px-4">{t("date")}</th>
                            <th className="py-3 px-3">{t("merchant")}</th>
                            <th className="py-3 px-3">{t("category")}</th>
                            <th className="py-3 px-3 text-right">{t("amount")}</th>
                            <th className="py-3 px-4 text-right">{t("status")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredRecentExpenses.slice(0, 8).map((e) => {
                            const { Icon, colorClass, bgClass } = getCategoryMeta(e.category_name);
                            return (
                              <tr
                                key={e.id}
                                onClick={() => router.push(`/expenses/${e.id}`)}
                                className="hover:bg-muted/30 transition-colors text-sm cursor-pointer group"
                              >
                                <td className="py-3 px-4 font-medium text-xs text-muted-foreground whitespace-nowrap">
                                  {e.date}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", bgClass, colorClass)}>
                                      <Icon className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="font-bold text-foreground group-hover:text-primary transition-colors truncate max-w-[140px]">
                                      {e.merchant || "—"}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-xs text-muted-foreground">
                                  {e.category_name || tc("uncategorized")}
                                </td>
                                <td className="py-3 px-3 text-right font-semibold text-foreground tabular-nums tracking-tight whitespace-nowrap">
                                  {formatEur(e.amount_eur)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <Badge status={e.status} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Reimbursement Status Flow & Categories (5 / 12 width) */}
              <div className="col-span-12 xl:col-span-5 space-y-6">
                {/* Signature Element: Reimbursement Lifecycle Flow */}
                <ReimbursementFlowLedger totals={reportStatusTotals} />

                {/* 2. Spend by Category Card */}
                <div className="bg-card rounded-2xl border border-border p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">{t("spend_by_category")}</h2>
                    <span className="text-xs font-bold text-foreground">{formatEur(data?.total_last_report_eur ?? 0)}</span>
                  </div>

                  {!data?.spend_by_category.length ? (
                    <p className="text-xs text-muted-foreground text-center py-4">{t("no_expenses_this_month")}</p>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const totalCatSpend = data.spend_by_category.reduce((sum, c) => sum + c.total, 0) || 1;
                        return data.spend_by_category.slice(0, 5).map((s, i) => {
                          const percent = Math.min((s.total / totalCatSpend) * 100, 100);
                          return (
                            <div 
                              key={i} 
                              onClick={() => router.push(s.category_id ? `/expenses?category_id=${s.category_id}` : "/expenses")}
                              className="group cursor-pointer space-y-1"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-foreground group-hover:text-primary transition-colors">{s.category_name}</span>
                                <span className="font-extrabold text-foreground">{formatEur(s.total)} ({percent.toFixed(0)}%)</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary transition-all duration-500"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                {/* 3. Monthly Spend Trend Chart */}
                <div className="bg-card rounded-2xl border border-border p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("total_spend")}</span>
                      <p className="text-xl font-black text-foreground">{formatEur(data?.total_last_report_eur ?? 0)}</p>
                    </div>
                  </div>
                  <SpendChart data={chartData} />
                </div>
              </div>
            </div>
          </div>

          {/* ── MOBILE TECHNICIAN VIEW (Action-Oriented Feed) ───────────────────────── */}
          <div className="lg:hidden flex flex-col gap-5 pt-1">
            {/* Top Greeting */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black text-foreground">
                  {t("greeting", { name: user?.display_name?.split(" ")[0] ?? "" })}
                </h1>
                <p className="text-xs text-muted-foreground">{currentMonthYear}</p>
              </div>

              <Link
                href="/expenses/capture"
                aria-label={tcap("title")}
                onClick={(e) => {
                  triggerHaptic(10);
                  if (!allowNavigation()) e.preventDefault();
                }}
                className="inline-flex items-center gap-1 bg-primary text-white text-xs font-bold px-3.5 py-2 rounded-full shadow-xs active:scale-95 transition-transform"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{tc("new")}</span>
              </Link>
            </div>

            {/* Mobile Total Spend Stat Card */}
            <div className="bg-card border border-border rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("total_spend")}</span>
                <p className="text-lg font-black text-foreground">{formatEur(data?.total_last_report_eur ?? 0)}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("expenses_count_label", { fallback: "Expenses" })}</span>
                <p className="text-lg font-black text-foreground tabular-nums">{data?.expense_count_month ?? 0}</p>
              </div>
            </div>

            {/* Active Reimbursement Status Summary Cards (Draft / Submitted / Paid €) - Mobile Snap Carousel */}
            <div className="flex sm:grid sm:grid-cols-3 gap-2.5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1 -mx-1 px-1">
              <Link
                href="/reports?status=draft"
                onClick={() => triggerHaptic(10)}
                className="min-w-[115px] flex-1 snap-start bg-card border border-border rounded-xl p-3 shadow-2xs flex flex-col justify-between active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <FileEdit className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{t("draft_summary_title")}</span>
                </div>
                <div className="mt-2">
                  <p className="text-base font-bold text-foreground leading-none tabular-nums">{reportStatusTotals.draftCount}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground mt-1 tabular-nums tracking-tight">{formatEur(reportStatusTotals.draftEur)}</p>
                </div>
              </Link>

              <Link
                href="/reports?status=submitted"
                onClick={() => triggerHaptic(10)}
                className="min-w-[115px] flex-1 snap-start bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 shadow-2xs flex flex-col justify-between active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t("pending_summary_title")}</span>
                </div>
                <div className="mt-2">
                  <p className="text-base font-bold text-amber-700 dark:text-amber-400 leading-none tabular-nums">{reportStatusTotals.submittedCount}</p>
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mt-1 tabular-nums tracking-tight">{formatEur(reportStatusTotals.submittedEur)}</p>
                </div>
              </Link>

              <Link
                href="/reports?status=paid"
                onClick={() => triggerHaptic(10)}
                className="min-w-[115px] flex-1 snap-start bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 shadow-2xs flex flex-col justify-between active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t("approved_summary_title")}</span>
                </div>
                <div className="mt-2">
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-400 leading-none tabular-nums">{reportStatusTotals.paidCount}</p>
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums tracking-tight">{formatEur(reportStatusTotals.paidEur)}</p>
                </div>
              </Link>
            </div>

            {/* Mobile Recent Expenses Feed */}
            <div className="bg-card border border-border rounded-2xl p-4 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("recent_expenses")}</span>
                <Link href="/expenses" className="text-xs font-bold text-primary hover:underline">
                  {t("see_all")}
                </Link>
              </div>

              {!data?.recent_expenses.length ? (
                <EmptyState
                  message={t("no_expenses")}
                  actionLabel={t("add_expense")}
                  onAction={() => router.push("/expenses/new")}
                />
              ) : (
                <div className="divide-y divide-border">
                  {data.recent_expenses.slice(0, 6).map((e) => {
                    const { Icon, colorClass, bgClass } = getCategoryMeta(e.category_name);
                    return (
                      <Link 
                        key={e.id} 
                        href={`/expenses/${e.id}`}
                        onClick={() => triggerHaptic(10)}
                        className="flex items-center justify-between py-3 gap-3 first:pt-1 last:pb-1 active:bg-muted/30 rounded-lg px-1 -mx-1 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", bgClass, colorClass)}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-foreground truncate">{e.merchant || "—"}</p>
                            <p className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">
                              {e.date} · {e.category_name || tc("uncategorized")}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end shrink-0 pl-2">
                          <p className="text-sm font-semibold text-foreground tabular-nums tracking-tight whitespace-nowrap">{formatEur(e.amount_eur)}</p>
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

            {/* Expense Status Donut Gauge */}
            <ExpenseStatusOverview 
              approved={data?.paid_count ?? 0}
              pending={data?.submitted_count ?? 0}
              total={data?.expense_count_month ?? 0}
            />

            {/* Optional quick-add FAB; the bottom navigation Capture action is always available. */}
            {mobileUiConfig?.mobile_quick_add_fab_enabled === true && (
              <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)] right-4 z-20">
                <Link
                  href="/expenses/new"
                  aria-label={t("add_expense")}
                  onClick={() => triggerHaptic(15)}
                  className={clsx(
                    "flex items-center justify-center bg-primary hover:bg-primary-hover text-white shadow-lg font-bold text-xs uppercase tracking-wider transition-all duration-300 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    isScrolled
                      ? "w-12 h-12 rounded-full p-0"
                      : "h-12 px-4 py-3 rounded-full gap-2"
                  )}
                >
                  <Camera className="w-5 h-5 shrink-0" />
                  {!isScrolled && <span className="whitespace-nowrap transition-opacity duration-200">{t("quick_add_expense")}</span>}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

