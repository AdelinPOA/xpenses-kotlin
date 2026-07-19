"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import api, { Report, downloadBlob, isPagedResponse, PagedResponse } from "@/lib/api";
import { reportKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Trash2, Eye, Send, ChevronUp, ChevronDown, Search, Download } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(amount);
}

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPrivileged = user?.role === "chef_finance" || user?.role === "mod" || user?.role === "manager";

  useEffect(() => {
    const status = searchParams.get("status");
    if (status) setStatusFilter(status);
  }, [searchParams]);

  useEffect(() => {
    if (isPrivileged && user?.role === "manager") setShowAll(true);
  }, [user?.role]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: reportKeys.list({ status: statusFilter, all: showAll }),
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
    mutationFn: (id: number) => api.delete(`/reports/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
    onError: () => setDelError("Failed to delete report. Please try again."),
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
      toast.error("Export failed. Please try again.");
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
            {showAll ? "Company Reports" : "My Reports"}
          </h1>
          <p className="text-muted text-sm mt-1">{reports?.length ?? 0} total</p>
        </div>
        <div className="flex items-center gap-3">
          {isPrivileged && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={clsx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border",
                showAll
                  ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-700 dark:border-slate-600"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
              )}
            >
              {showAll ? "Show My Reports" : "Show All Reports"}
            </button>
          )}
          <div className="relative">
            <button
              disabled={exporting}
              onClick={() => setExportOpen((v) => !v)}
              aria-expanded={exportOpen}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {exporting ? "Exporting…" : "Export"}
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-input border border-border rounded-lg shadow-lg z-20">
                  <button
                    onClick={() => handleExport("csv")}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-t-lg"
                  >
                    Download CSV
                  </button>
                  <button
                    onClick={() => handleExport("xlsx")}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-b-lg"
                  >
                    Download XLSX
                  </button>
                </div>
              </>
            )}
          </div>
          <Link
            href="/reports/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover w-fit"
          >
            <Plus className="w-4 h-4" />
            New report
          </Link>
        </div>
      </div>

      {delError && (
        <div className="mb-4 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
          {delError}
          <button type="button" onClick={() => setDelError("")} className="ml-2 font-bold">×</button>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-2 items-center">
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
          <div className="ml-auto flex items-center gap-2 border border-border rounded-lg px-3 py-1 text-sm bg-input">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="outline-none bg-transparent text-slate-700 dark:text-slate-300 placeholder-slate-400 w-40"
            />
          </div>
        </div>
        {showAll && uniqueOwners.length > 1 && (
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium mr-1">Employee:</span>
            <button
              onClick={() => setOwnerFilter("")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                ownerFilter === ""
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              All
            </button>
            {uniqueOwners.map((name) => (
              <button
                key={name}
                onClick={() => setOwnerFilter(ownerFilter === name ? "" : name)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
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
              debouncedSearch ? `No reports matching "${debouncedSearch}"` :
              ownerFilter ? `No reports from ${ownerFilter}` :
              statusFilter ? "No reports with this status" : "No reports found"
            }
            actionLabel={
              debouncedSearch ? "Clear search" :
              ownerFilter ? "Clear employee filter" :
              statusFilter ? "Clear filter" : "Create your first report"
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
                        {r.expenses.length} expense{r.expenses.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link href={`/reports/${r.id}`}>
                        <Eye className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                      </Link>
                      {r.status === "draft" && r.user_id === user?.id && (
                        <>
                          <button title="Submit report" onClick={() => quickSubmit.mutate(r.id)} disabled={quickSubmit.isPending}>
                            <Send className="w-4 h-4 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(r.id)} disabled={del.isPending}>
                            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
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
                    Title <SortIcon k="title" />
                  </th>
                  {showAll && <th className="text-left px-4 py-3">Owner</th>}
                  <th className="text-left px-4 py-3">Period</th>
                  <th className="text-left px-4 py-3">Expenses</th>
                  <th
                    className="text-right px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort("total")}
                  >
                    Total <SortIcon k="total" />
                  </th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th
                    className="text-left px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort("submitted_at")}
                  >
                    Submitted <SortIcon k="submitted_at" />
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-card-hover/50">
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
                        <Link href={`/reports/${r.id}`}>
                          <Eye className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                        </Link>
                        {r.status === "draft" && r.user_id === user?.id && (
                          <>
                            <button
                              title="Submit report"
                              onClick={() => quickSubmit.mutate(r.id)}
                              disabled={quickSubmit.isPending}
                            >
                              <Send className="w-4 h-4 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(r.id)}
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
          </>
        )}
      </div>

      {confirmDeleteId !== null && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-card rounded-xl border border-border shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-foreground">Delete Report</h3>
            <p className="text-sm text-muted">
              Are you sure you want to delete this report? This action is permanent and cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  del.mutate(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function ReportsPage() {
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
