"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import api, { Report } from "@/lib/api";
import { reportKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Trash2, Eye, Send, ChevronUp, ChevronDown, Search } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import clsx from "clsx";
import { useRouter } from "next/navigation";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
}

type SortKey = "title" | "total" | "submitted_at";
type SortDir = "asc" | "desc";

export default function ReportsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [delError, setDelError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPrivileged = user?.role === "chef_finance" || user?.role === "mod";

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
      }}).then((r) => r.data),
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

  const filtered = (reports ?? []).filter((r) =>
    debouncedSearch === "" || r.title.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {showAll ? "Company Reports" : "My Reports"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{reports?.length ?? 0} total</p>
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
          <Link
            href="/reports/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 w-fit"
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

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm">
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
          <div className="ml-auto flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1 text-sm bg-white dark:bg-slate-800">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="outline-none bg-transparent text-slate-700 dark:text-slate-300 placeholder-slate-400 w-40"
            />
          </div>
        </div>

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
            message={debouncedSearch ? `No reports matching "${debouncedSearch}"` : statusFilter ? "No reports with this status" : "No reports found"}
            actionLabel={debouncedSearch ? "Clear search" : statusFilter ? "Clear filter" : "Create your first report"}
            onAction={debouncedSearch ? () => setSearch("") : statusFilter ? () => setStatusFilter("") : () => router.push("/reports/new")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
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
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.title}</td>
                    {showAll && (
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">
                        {r.user_display_name || "—"}
                      </td>
                    )}
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
                              onClick={() => {
                                if (window.confirm(`Delete report "${r.title}"?`)) {
                                  del.mutate(r.id);
                                }
                              }}
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
