"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import api, { Report, downloadBlob, isPagedResponse, PagedResponse } from "@/lib/api";
import { reportKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Trash2, Eye, Send, ChevronUp, ChevronDown, Search, Download, SlidersHorizontal, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { formatEur } from "@/lib/format";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useTranslations } from "next-intl";

type SortKey = "title" | "total" | "submitted_at";
type SortDir = "asc" | "desc";

function ReportsPageContent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [delError, setDelError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useTranslations("reports");

  const isPrivileged = user?.role === "chef_finance" || user?.role === "mod" || user?.role === "manager";

  useEffect(() => {
    const status = searchParams.get("status");
    if (status) setStatusFilter(status);
  }, [searchParams]);

  useBodyScrollLock(confirmDeleteId !== null);

  useEffect(() => {
    if (confirmDeleteId === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDeleteId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDeleteId]);

  useEffect(() => {
    if (isPrivileged && user?.role === "manager") setShowAll(true);
  }, [user?.role]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: [...reportKeys.all, "list", statusFilter, showAll],
    queryFn: () =>
      api.get("/reports", { params: {
        status: statusFilter || undefined,
        all: showAll
      }}).then((r) => {
        const payload = r.data as Report[] | PagedResponse<Report>;
        return isPagedResponse(payload) ? payload.data : payload;
      }),
  });

  const del = useMutation({
    mutationFn: ({ id, deleteExpenses }: { id: number; deleteExpenses?: boolean }) =>
      api.delete(`/reports/${id}`, { params: { delete_expenses: deleteExpenses } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
    onError: () => setDelError(t("error_delete")),
  });

  const quickSubmit = useMutation({
    mutationFn: (id: number) => api.post(`/reports/${id}/submit`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });

  async function handleExport(format: "csv" | "xlsx") {
    setExporting(true);
    setExportOpen(false);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadBlob(
        "/reports/export",
        { format, all: showAll, ...(statusFilter ? { status: statusFilter } : {}) },
        `reports_${today}.${format}`
      );
    } catch {
      toast.error(t("error_export"));
    } finally {
      setExporting(false);
    }
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronDown className="w-3 h-3 opacity-30 inline ml-1" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 inline ml-1" />
      : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  const uniqueOwners = Array.from(
    new Set((reports ?? []).map((r) => r.user_display_name).filter(Boolean))
  ).sort() as string[];
  const statuses = ["", "draft", "submitted", "approved", "rejected", "paid"];
  const activeFilterCount = [statusFilter, ownerFilter, debouncedSearch].filter(Boolean).length;

  const filtered = (reports ?? []).filter((r) => {
    if (ownerFilter && r.user_display_name !== ownerFilter) return false;
    if (debouncedSearch === "") return true;
    const q = debouncedSearch.toLowerCase();
    return r.title.toLowerCase().includes(q) || (r.user_display_name ?? "").toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "title") cmp = a.title.localeCompare(b.title);
    else if (sortKey === "total") {
      const aT = a.expenses.reduce((s, e) => s + e.amount_eur, 0) || a.total_amount;
      const bT = b.expenses.reduce((s, e) => s + e.amount_eur, 0) || b.total_amount;
      cmp = aT - bT;
    } else if (sortKey === "submitted_at") {
      cmp = (a.submitted_at ?? "").localeCompare(b.submitted_at ?? "");
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {showAll ? t("company_reports") : t("my_reports")}
          </h1>
          <p className="text-muted text-sm mt-1">{reports?.length ?? 0} {t("total")}</p>
        </div>
        <div className="flex items-center gap-3">
          {isPrivileged && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={clsx(
                "min-h-11 px-3 py-2 text-xs font-semibold rounded-lg transition-colors border",
                showAll
                  ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-700 dark:border-slate-600"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
              )}
            >
              {showAll ? t("toggle_my") : t("toggle_all")}
            </button>
          )}
          <div className="relative">
            <button
              disabled={exporting}
              onClick={() => setExportOpen((v) => !v)}
              aria-expanded={exportOpen}
              className="flex min-h-11 items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {exporting ? t("exporting") : t("export")}
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-input border border-border rounded-lg shadow-lg z-20">
                  <button
                    onClick={() => handleExport("csv")}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-t-lg"
                  >
                    {t("download_csv")}
                  </button>
                  <button
                    onClick={() => handleExport("xlsx")}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-b-lg"
                  >
                    {t("download_xlsx")}
                  </button>
                </div>
              </>
            )}
          </div>
          <Link
            href="/reports/new"
            className="flex min-h-11 items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover w-fit"
          >
            <Plus className="w-4 h-4" />
            {t("new_report")}
          </Link>
        </div>
      </div>

      {delError && (
        <div className="mb-4 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
          {delError}
          <button type="button" onClick={() => setDelError("")} className="ml-2 font-bold">×</button>
        </div>
      )}

      <div className="mb-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((v) => !v)}
          aria-expanded={mobileFiltersOpen}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {t("filters")}
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-white">{activeFilterCount}</span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {statusFilter && (
              <button onClick={() => setStatusFilter("")} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                {t(`status_${statusFilter}` as any)}
                <X className="w-3 h-3" />
              </button>
            )}
            {ownerFilter && (
              <button onClick={() => setOwnerFilter("")} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                {ownerFilter}
                <X className="w-3 h-3" />
              </button>
            )}
            {debouncedSearch && (
              <button onClick={() => setSearch("")} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                {debouncedSearch}
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl shadow-sm">
        <div className={clsx(
          "p-4 border-b border-slate-100 dark:border-slate-700 flex-wrap gap-3 items-center",
          mobileFiltersOpen ? "flex" : "hidden md:flex"
        )}>
          <div className="flex w-full flex-wrap gap-2 md:w-auto">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              aria-pressed={statusFilter === s}
              className={`min-h-11 px-4 py-2 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {s === "" ? t("filter_all") : t(`status_${s}` as any)}
            </button>
          ))}
          </div>
          <div className="flex w-full min-h-11 items-center gap-2 border border-border rounded-lg px-3 py-2 text-sm bg-input md:ml-auto md:w-auto md:py-1">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              id="report-search"
              name="report_search"
              aria-label={t("search_placeholder")}
              type="text"
              placeholder={t("search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="outline-none bg-transparent text-slate-700 dark:text-slate-300 placeholder-slate-400 w-full md:w-40"
            />
          </div>
        </div>
        {showAll && uniqueOwners.length > 1 && (
          <div className={clsx(
            "px-4 py-2 border-b border-slate-100 dark:border-slate-700 flex-wrap gap-2 items-center",
            mobileFiltersOpen ? "flex" : "hidden md:flex"
          )}>
            <span className="text-xs text-muted-foreground font-medium mr-1">{t("employee_filter")}</span>
            <button
              onClick={() => setOwnerFilter("")}
              className={`min-h-11 px-4 py-2 rounded-full text-xs font-medium transition-colors ${
                ownerFilter === ""
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {t("filter_all")}
            </button>
            {uniqueOwners.map((name) => (
              <button
                key={name}
                onClick={() => setOwnerFilter(ownerFilter === name ? "" : name)}
                className={`min-h-11 px-4 py-2 rounded-full text-xs font-medium transition-colors ${
                  ownerFilter === name
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div role="status" aria-live="polite" className="animate-pulse p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded flex-1" />
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24" />
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16" />
              </div>
            ))}
          </div>
        ) : !sorted.length ? (
          <EmptyState
            message={
              debouncedSearch ? t("empty_no_match") :
              ownerFilter ? `${t("empty_no_owner")} ${ownerFilter}` :
              statusFilter ? t("empty_no_status") : t("empty_no_reports")
            }
            actionLabel={
              debouncedSearch ? t("clear_search") :
              ownerFilter ? t("clear_employee") :
              statusFilter ? t("clear_filter") : t("create_first")
            }
            onAction={
              debouncedSearch ? () => setSearch("") :
              ownerFilter ? () => setOwnerFilter("") :
              statusFilter ? () => setStatusFilter("") :
              () => router.push("/reports/new")
            }
          />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {sorted.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/reports/${r.id}`} className="font-medium text-foreground hover:text-blue-600 dark:hover:text-blue-400">
                        {r.title}
                      </Link>
                      <p className="text-xs text-muted mt-0.5">
                        {showAll && r.user_display_name ? `${r.user_display_name} · ` : ""}
                        {r.date_from && r.date_to ? `${r.date_from} — ${r.date_to}` : "—"}
                      </p>
                    </div>
                    <p className="font-semibold text-foreground shrink-0">
                      {formatEur(r.expenses.reduce((s, e) => s + e.amount_eur, 0) || r.total_amount)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <Badge status={r.status} />
                      <span className="text-xs text-muted-foreground">
                        {r.expenses.length === 1 ? t("expense_count_one", { count: r.expenses.length }) : t("expense_count_other", { count: r.expenses.length })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link href={`/reports/${r.id}`} aria-label={`View report ${r.title}`} className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <Eye className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" aria-hidden="true" />
                      </Link>
                      {r.status === "draft" && r.user_id === user?.id && (
                        <>
                          <button type="button" title={t("submit_tooltip")} aria-label={`${t("submit_tooltip")} ${r.title}`} onClick={() => quickSubmit.mutate(r.id)} disabled={quickSubmit.isPending} className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg">
                            <Send aria-hidden="true" className="w-4 h-4 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400" />
                          </button>
                          <button type="button" aria-label={`Delete report ${r.title}`} onClick={() => setConfirmDeleteId(r.id)} disabled={del.isPending} className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg">
                            <Trash2 aria-hidden="true" className="w-4 h-4 text-slate-400 hover:text-red-500" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-muted uppercase">
                <tr>
                  <th
                    className="text-left px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort("title")}
                  >
                    {t("table_title")} <SortIcon k="title" />
                  </th>
                  {showAll && <th className="text-left px-4 py-3">{t("table_owner")}</th>}
                  <th className="text-left px-4 py-3">{t("table_period")}</th>
                  <th className="text-left px-4 py-3">{t("table_expenses")}</th>
                  <th
                    className="text-right px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort("total")}
                  >
                    {t("table_total")} <SortIcon k="total" />
                  </th>
                  <th className="text-center px-4 py-3">{t("table_status")}</th>
                  <th
                    className="text-left px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort("submitted_at")}
                  >
                    {t("table_submitted")} <SortIcon k="submitted_at" />
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 dark:border-slate-700 hover:bg-card-hover/50 cursor-pointer"
                    onClick={() => router.push(`/reports/${r.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{r.title}</td>
                    {showAll && (
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">
                        {r.user_display_name || "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted text-xs">
                      {r.date_from && r.date_to ? `${r.date_from} — ${r.date_to}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{r.expenses.length}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {formatEur(r.expenses.reduce((s, e) => s + e.amount_eur, 0) || r.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/reports/${r.id}`} onClick={(e) => e.stopPropagation()}>
                          <Eye className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                        </Link>
                        {r.status === "draft" && r.user_id === user?.id && (
                          <>
                            <button
                              title={t("submit_tooltip")}
                              onClick={(e) => { e.stopPropagation(); quickSubmit.mutate(r.id); }}
                              disabled={quickSubmit.isPending}
                            >
                              <Send aria-hidden="true" className="w-4 h-4 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(r.id); }}
                              disabled={del.isPending}
                              aria-label={t("delete_report") || "Delete report"}
                              className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                            >
                              <Trash2 aria-hidden="true" className="w-4 h-4" />
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
          </>
        )}
      </div>

      {confirmDeleteId !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-report-title"
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteId(null);
          }}
        >
          <div className="bg-card rounded-xl border border-border shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 id="delete-report-title" className="text-lg font-bold text-foreground">{t("delete_title")}</h3>
            <p className="text-sm text-muted">
              {t("delete_description")}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  del.mutate({ id: confirmDeleteId, deleteExpenses: false });
                  setConfirmDeleteId(null);
                }}
                className="w-full min-h-11 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer text-left flex items-center justify-between"
              >
                <span>{t("delete_keep")}</span>
                <span className="text-xs opacity-75">{t("delete_recommended")}</span>
              </button>
              <button
                onClick={() => {
                  del.mutate({ id: confirmDeleteId, deleteExpenses: true });
                  setConfirmDeleteId(null);
                }}
                className="w-full min-h-11 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer text-left"
              >
                {t("delete_all")}
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="w-full min-h-11 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer text-center mt-1"
              >
                {t("delete_cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function ReportsClient() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ReportsPageContent />
    </Suspense>
  );
}
