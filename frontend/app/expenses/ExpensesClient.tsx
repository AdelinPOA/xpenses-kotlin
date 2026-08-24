"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import api, { Expense, Category, duplicateExpense, downloadBlob, isPagedResponse, PagedResponse } from "@/lib/api";
import { expenseKeys, dashboardKeys, categoryKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ToastProvider";
import { useOfflineSync } from "@/components/OfflineSyncProvider";
import { useAllowNavigation } from "@/lib/navigationGuard";
import dynamic from "next/dynamic";
import BulkUploadZone from "@/components/expenses/BulkUploadZone";
import { Plus, Trash2, Pencil, Copy, Download, Search } from "lucide-react";
import { formatAmount } from "@/lib/format";
import clsx from "clsx";
import { useTranslations } from "next-intl";

const BulkReviewDrawer = dynamic(() => import("@/components/expenses/BulkReviewDrawer"), {
  loading: () => <div className="animate-pulse bg-card h-96 rounded-xl" />,
});

const STATUS_PILLS = ["", "draft", "submitted", "approved", "rejected", "paid"] as const;
const PAGE_SIZE = 20;

type ExportRange = "this_month" | "last_month" | "this_year" | "all";

function exportRangeToParams(range: ExportRange): { from?: string; to?: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (range) {
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: iso(from), to: iso(to) };
    }
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(from), to: iso(to) };
    }
    case "this_year":
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    default:
      return {};
  }
}

function ExpensesPageContent() {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const allowNavigation = useAllowNavigation();
  // URL search params are the single source of truth for list state —
  // deep links and back button work everywhere.
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") ?? "";
  const categoryFilter = searchParams.get("category_id") ?? "";
  const qParam = searchParams.get("q") ?? "";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "", 10) || 0);
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const toffline = useTranslations("offline");
  const offline = useOfflineSync();
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRange, setExportRange] = useState<ExportRange>("all");
  const [isDragging, setIsDragging] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);
  const dragCounterRef = useRef(0); // track nested drag-enter/leave pairs
  // Two-step inline delete ("Confirm delete?" for 3s) instead of window.confirm.
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local text for the debounced search box; URL param `q` stays authoritative.
  const [searchText, setSearchText] = useState(qParam);

  useEffect(() => setSearchText(qParam), [qParam]);

  const updateParams = useCallback((updates: Record<string, string | null>, resetPage = false) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      // Prune defaults so URLs stay clean.
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (resetPage) sp.delete("page");
    const qs = sp.toString();
    router.replace(`/expenses${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router]);

  // Debounce search input → URL param.
  useEffect(() => {
    if (searchText === qParam) return;
    const timer = setTimeout(() => updateParams({ q: searchText.trim() || null }, true), 400);
    return () => clearTimeout(timer);
  }, [searchText, qParam, updateParams]);

  useEffect(() => () => { if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); }, []);

  // Page-level drag handlers — useCallback so they're stable refs for event listeners
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
  }, []);

  function handleFilesDropped(files: File[]) {
    setBulkFiles(files);
    setShowBulkDrawer(true);
  }

  async function handleExport(format: "csv" | "xlsx") {
    setExporting(true);
    setExportOpen(false);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadBlob(
        "/expenses/export",
        {
          format,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(categoryFilter ? { category_id: categoryFilter } : {}),
          ...exportRangeToParams(exportRange),
        },
        `expenses_${today}.${format}`
      );
    } catch {
      toast.error(t("export_failed"));
    } finally {
      setExporting(false);
    }
  }

  const paramsForRequest = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(categoryFilter ? { category_id: categoryFilter } : {}),
    ...(qParam ? { q: qParam } : {}),
    page,
    size: PAGE_SIZE,
  };

  const { data: expensesPayload, isLoading } = useQuery<Expense[] | PagedResponse<Expense>>({
    queryKey: [...expenseKeys.all, "list", paramsForRequest],
    queryFn: () => api.get("/expenses", { params: paramsForRequest }).then((r) => r.data),
  });
  const paged = expensesPayload && isPagedResponse(expensesPayload) ? expensesPayload : null;
  const expenses: Expense[] = paged ? paged.data : (Array.isArray(expensesPayload) ? expensesPayload : []);
  const totalPages = paged?.total_pages ?? 1;
  const totalElements = paged?.total_elements ?? expenses.length;

  const hasActiveFilters = !!(statusFilter || categoryFilter || qParam);

  // When filters yield nothing, check once whether there's any data at all,
  // so we can show "No results + Clear filters" instead of the cold empty state.
  const shouldProbeAnyData = !isLoading && expenses.length === 0 && hasActiveFilters;
  const { data: anyDataExists } = useQuery<boolean>({
    queryKey: [...expenseKeys.all, "any-check"],
    enabled: shouldProbeAnyData,
    staleTime: 30_000,
    gcTime: 60_000,
    queryFn: () =>
      api.get("/expenses", { params: { page: 0, size: 1 } }).then((r) => {
        const p = r.data as Expense[] | PagedResponse<Expense>;
        return isPagedResponse(p) ? p.total_elements > 0 : p.length > 0;
      }),
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const invalidateLists = useCallback(() => {
    qc.invalidateQueries({ queryKey: expenseKeys.all });
    qc.invalidateQueries({ queryKey: dashboardKeys.all });
  }, [qc]);

  const del = useMutation({
    mutationFn: async (expense: Expense) => {
      await api.delete(`/expenses/${expense.id}`);
      return expense;
    },
    onSuccess: (exp) => {
      invalidateLists();
      // Undo re-POSTs a copy captured pre-delete; offered for drafts only.
      const undoable = exp.status === "draft"
        ? {
            label: tc("undo"),
            onClick: () => restoreDeleted.mutate(exp),
          }
        : undefined;
      toast.success(t("deleted_toast"), undoable);
    },
    onError: () => toast.error(t("delete_failed")),
  });

  const restoreDeleted = useMutation({
    mutationFn: async (exp: Expense) => {
      await api.post("/expenses", {
        amount: exp.amount_original,
        currency: exp.currency_original,
        date: exp.date,
        merchant: exp.merchant ?? null,
        description: exp.description ?? null,
        category_id: exp.category_id ?? null,
        tax_amount: exp.tax_amount ?? 0,
        tax_rate: exp.tax_rate ?? null,
      });
    },
    onSuccess: () => {
      invalidateLists();
      toast.success(t("restored_toast"));
    },
    onError: () => toast.error(t("restore_failed")),
  });

  const tapDelete = (expense: Expense) => {
    if (pendingDeleteId === expense.id) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setPendingDeleteId(null);
      del.mutate(expense);
      return;
    }
    setPendingDeleteId(expense.id);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000);
  };

  const duplicate = useMutation({
    mutationFn: duplicateExpense,
    onSuccess: (newExpense) => {
      invalidateLists();
      toast.success(t("duplicated_toast"));
      router.push(`/expenses/${newExpense.id}/edit`);
    },
    onError: () => toast.error(t("error_save_generic")),
  });

  const pillLabels: Record<(typeof STATUS_PILLS)[number], string> = {
    "": t("status_all"),
    draft: t("status_draft"),
    submitted: t("status_submitted"),
    approved: t("status_approved"),
    rejected: t("status_rejected"),
    paid: t("status_paid"),
  };

  const deleteButton = (expense: Expense, iconOnly = false) => (
    <button
      type="button"
      onClick={() => tapDelete(expense)}
      disabled={del.isPending}
      aria-label={pendingDeleteId === expense.id ? t("confirm_delete") : `${t("delete_tooltip")} ${expense.merchant || expense.id}`}
      className={clsx(
        "min-h-11 inline-flex items-center justify-center gap-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        pendingDeleteId === expense.id
          ? "px-3 min-w-11 bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
          : "min-w-11 text-slate-400 hover:text-red-500 disabled:opacity-50",
        !iconOnly && ""
      )}
    >
      <Trash2 className="w-4 h-4" aria-hidden="true" />
      {pendingDeleteId === expense.id && <span>{t("confirm_delete")}</span>}
    </button>
  );

  return (
    <AppShell>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
      <BulkReviewDrawer
        files={bulkFiles}
        isOpen={showBulkDrawer}
        onClose={() => setShowBulkDrawer(false)}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-muted text-sm mt-1">
            {totalElements} {t("total")}
            {offline.pendingCount > 0 && (
              <> · <span className={clsx("font-semibold", offline.failedCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400")}>
                {toffline("drafts_badge", { count: offline.pendingCount })}
                {offline.failedCount > 0 ? ` · ${toffline("needs_attention")}` : ""}
              </span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BulkUploadZone isDragging={isDragging} onFilesDropped={handleFilesDropped} />
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
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-input border border-border rounded-lg shadow-lg z-50 py-1">
                  <p className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("export_range_label")}</p>
                  {([
                    ["this_month", t("export_this_month")],
                    ["last_month", t("export_last_month")],
                    ["this_year", t("export_this_year")],
                    ["all", t("export_all_time")],
                  ] as [ExportRange, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setExportRange(value)}
                      role="menuitemradio"
                      aria-checked={exportRange === value}
                      className={clsx(
                        "w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between",
                        exportRange === value ? "text-primary font-semibold" : "text-slate-700 dark:text-slate-200"
                      )}
                    >
                      {label}
                      {exportRange === value && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                  <hr className="my-1 border-border" />
                  <button
                    onClick={() => handleExport("csv")}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    {t("download_csv")}
                  </button>
                  <button
                    onClick={() => handleExport("xlsx")}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    {t("download_xlsx")}
                  </button>
                </div>
              </>
            )}
          </div>
          <Link
            href="/expenses/new"
            onClick={(e) => {
              if (!allowNavigation()) e.preventDefault();
            }}
            className="flex min-h-11 items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover w-fit"
          >
            <Plus className="w-4 h-4" />
            {t("add_expense")}
          </Link>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-2 items-center">
          {STATUS_PILLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateParams({ status: s || null }, true)}
              aria-pressed={statusFilter === s}
              className={`min-h-11 px-4 py-2 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {pillLabels[s]}
            </button>
          ))}
          <div className="relative w-full sm:w-auto sm:ml-auto">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <label htmlFor="expense-search" className="sr-only">{t("search_placeholder_expenses")}</label>
            <input
              id="expense-search"
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t("search_placeholder_expenses")}
              className="w-full sm:w-56 min-h-11 pl-9 pr-3 border border-border rounded-lg text-xs bg-input text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <label htmlFor="expense-category-filter" className="sr-only">{t("all_categories")}</label>
          <select
            id="expense-category-filter"
            aria-label={t("all_categories")}
            value={categoryFilter}
            onChange={(e) => updateParams({ category_id: e.target.value || null }, true)}
            className="w-full sm:w-auto min-h-11 px-3 py-2 border border-border rounded-lg text-xs bg-input text-slate-700 dark:text-slate-300"
          >
            <option value="">{t("all_categories")}</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div role="status" aria-live="polite" className="p-8 text-center text-muted-foreground text-sm">{tc("loading")}</div>
        ) : !expenses.length ? (
          hasActiveFilters && anyDataExists ? (
            <EmptyState
              message={t("no_results_filtered")}
              actionLabel={t("clear_filters")}
              onAction={() => router.replace("/expenses", { scroll: false })}
            />
          ) : (
            <EmptyState message={t("no_expenses_found")} />
          )
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {expenses.map((e) => (
                <div key={e.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{e.merchant || "—"}</p>
                      <p className="text-xs text-muted mt-0.5">{e.date} · {e.category_name || "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-foreground">{formatAmount(e.amount_eur, "EUR")}</p>
                      {e.currency_original !== "EUR" && (
                        <p className="text-xs text-muted-foreground">
                          {formatAmount(e.amount_original, e.currency_original)}
                          {e.fx_rate_manual && (
                            <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">{t("manual_rate")}</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  {e.description && (
                    <p className="text-sm text-muted mt-2">{e.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <Badge status={e.status} />
                    <div className="flex items-center gap-1">
                      {e.receipts?.length > 0 && (
                        <div className="flex items-center gap-2">
                          {e.receipts!.map((r: { id: number; original_name?: string | null }) => (
                            <button
                              key={r.id}
                              onClick={() => downloadBlob(`/expenses/${e.id}/receipts/${r.id}`, {}, r.original_name || `receipt_${r.id}`)}
                              className="min-h-11 px-2 inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline text-xs cursor-pointer"
                            >
                              {e.receipts!.length === 1 ? t("view_receipt") : (r.original_name?.split(".").pop()?.toUpperCase() || t("view_receipt"))}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => duplicate.mutate(e.id)}
                        disabled={duplicate.isPending}
                        title={t("duplicate_tooltip")}
                        aria-label={`${t("duplicate_tooltip")} ${e.merchant || e.id}`}
                        className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Copy className="w-4 h-4" aria-hidden="true" />
                      </button>
                      {e.status === "draft" && (
                        <>
                          <Link href={`/expenses/${e.id}/edit`} aria-label={`${t("edit_expense")} ${e.merchant || e.id}`} className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                            <Pencil className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" aria-hidden="true" />
                          </Link>
                          {deleteButton(e)}
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
                    <th className="text-left px-4 py-3">{t("table_date")}</th>
                    <th className="text-left px-4 py-3">{t("table_merchant")}</th>
                    <th className="text-left px-4 py-3">{t("table_category")}</th>
                    <th className="text-left px-4 py-3">{t("table_description")}</th>
                    <th className="text-right px-4 py-3">{t("table_eur")}</th>
                    <th className="text-center px-4 py-3">{t("table_status")}</th>
                    <th className="text-right px-4 py-3">{t("table_receipt")}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-card-hover/50">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.date}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{e.merchant || "—"}</td>
                      <td className="px-4 py-3 text-muted">{e.category_name || "—"}</td>
                      <td className="px-4 py-3 text-muted max-w-[180px] truncate">{e.description || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-foreground">
                          {formatAmount(e.amount_eur, "EUR")}
                        </span>
                        {e.currency_original !== "EUR" && (
                          <span className="block text-xs text-muted-foreground font-normal">
                            {formatAmount(e.amount_original, e.currency_original)}
                            {e.fx_rate_manual && (
                              <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">{t("manual_rate")}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge status={e.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.receipts?.length > 0 ? (
                          <div className="flex items-center justify-end gap-1">
                            {e.receipts!.map((r: { id: number; original_name?: string | null }) => (
                              <button
                                key={r.id}
                                onClick={() => downloadBlob(`/expenses/${e.id}/receipts/${r.id}`, {}, r.original_name || `receipt_${r.id}`)}
                                className="min-h-11 px-2 inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline text-xs cursor-pointer"
                              >
                                {e.receipts!.length === 1 ? t("view_receipt") : (r.original_name?.split(".").pop()?.toUpperCase() || t("view_receipt"))}
                              </button>
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
                            title={t("duplicate_tooltip")}
                            aria-label={`${t("duplicate_tooltip")} ${e.merchant || e.id}`}
                            className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <Copy className="w-4 h-4" aria-hidden="true" />
                          </button>
                          {e.status === "draft" && (
                            <>
                              <Link href={`/expenses/${e.id}/edit`} aria-label={`${t("edit_expense")} ${e.merchant || e.id}`} className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                <Pencil className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" aria-hidden="true" />
                              </Link>
                              {deleteButton(e)}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pager */}
            {paged && totalPages > 1 && (
              <nav aria-label="Pagination" className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  disabled={page <= 0}
                  onClick={() => updateParams({ page: String(page - 1) })}
                  aria-label={t("prev_page")}
                  className="min-h-11 px-4 py-2 text-sm font-medium rounded-lg border border-input-border text-slate-600 dark:text-slate-300 hover:bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← {tc("previous")}
                </button>
                <span className="text-xs text-muted">{t("pager_page", { page: page + 1, totalPages })}</span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => updateParams({ page: String(page + 1) })}
                  aria-label={t("next_page")}
                  className="min-h-11 px-4 py-2 text-sm font-medium rounded-lg border border-input-border text-slate-600 dark:text-slate-300 hover:bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {tc("next")} →
                </button>
              </nav>
            )}
          </>
        )}
      </div>
      </div>  {/* end drag wrapper */}
    </AppShell>
  );
}

export default function ExpensesClient() {
  return (
    <Suspense fallback={
      <div role="status" aria-label="Loading expenses" className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      </div>
    }>
      <ExpensesPageContent />
    </Suspense>
  );
}
