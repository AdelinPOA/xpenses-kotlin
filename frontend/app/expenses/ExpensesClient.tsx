"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import api, {
  Expense,
  Category,
  duplicateExpense,
  downloadBlob,
  isPagedResponse,
  PagedResponse,
  API_BASE_URL,
} from "@/lib/api";
import { expenseKeys, dashboardKeys, categoryKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import QueryErrorNotice from "@/components/ui/QueryErrorNotice";
import { useToast } from "@/components/ToastProvider";
import { useOfflineSync } from "@/components/OfflineSyncProvider";
import OfflineQueuePanel from "@/components/expenses/OfflineQueuePanel";
import { useAllowNavigation } from "@/lib/navigationGuard";
import dynamic from "next/dynamic";
import BulkUploadZone from "@/components/expenses/BulkUploadZone";
import ReceiptLightbox from "@/components/expenses/ReceiptLightbox";
import {
  Plus,
  Trash2,
  Pencil,
  Copy,
  Download,
  Search,
  FileText,
  SlidersHorizontal,
  MoreHorizontal,
} from "lucide-react";
import { formatAmount } from "@/lib/format";
import clsx from "clsx";
import { useTranslations } from "next-intl";

const BulkReviewDrawer = dynamic(
  () => import("@/components/expenses/BulkReviewDrawer"),
  {
    loading: () => <div className="animate-pulse bg-card h-96 rounded-xl" />,
  },
);

const STATUS_PILLS = [
  "",
  "draft",
  "submitted",
  "approved",
  "rejected",
  "paid",
] as const;
const PAGE_SIZE = 20;

type ExportRange = "this_month" | "last_month" | "this_year" | "all";

function exportRangeToParams(range: ExportRange): {
  from?: string;
  to?: string;
} {
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
      return {
        from: `${now.getFullYear()}-01-01`,
        to: `${now.getFullYear()}-12-31`,
      };
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
  const highlightId = Math.max(0, parseInt(searchParams.get("highlight") ?? "", 10) || 0);
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const toffline = useTranslations("offline");
  const offline = useOfflineSync();
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRange, setExportRange] = useState<ExportRange>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);
  const [showOfflineQueue, setShowOfflineQueue] = useState(false);
  const [lightboxReceipt, setLightboxReceipt] = useState<{
    url: string;
    title: string;
    expenseId: number;
    receiptId: number;
    filename: string;
  } | null>(null);
  const dragCounterRef = useRef(0); // track nested drag-enter/leave pairs
  // Two-step inline delete ("Confirm delete?" for 3s) instead of window.confirm.
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local text for the debounced search box; URL param `q` stays authoritative.
  const [searchText, setSearchText] = useState(qParam);

  useEffect(() => setSearchText(qParam), [qParam]);

  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<number>>(
    new Set(),
  );

  const toggleSelectExpense = useCallback((id: number) => {
    setSelectedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedExpenseIds(new Set());
  }, []);

  const updateParams = useCallback(
    (updates: Record<string, string | null>, resetPage = false) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        // Prune defaults so URLs stay clean.
        if (v === null || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      if (resetPage) sp.delete("page");
      const qs = sp.toString();
      router.replace(`/expenses${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router],
  );

  // Debounce search input → URL param.
  useEffect(() => {
    if (searchText === qParam) return;
    const timer = setTimeout(
      () => updateParams({ q: searchText.trim() || null }, true),
      400,
    );
    return () => clearTimeout(timer);
  }, [searchText, qParam, updateParams]);

  useEffect(
    () => () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    },
    [],
  );

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
        `expenses_${today}.${format}`,
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

  const {
    data: expensesPayload,
    isLoading,
    isError: expensesError,
    isFetching: expensesFetching,
    refetch: refetchExpenses,
  } = useQuery<Expense[] | PagedResponse<Expense>>({
    queryKey: [...expenseKeys.all, "list", paramsForRequest],
    queryFn: () =>
      api.get("/expenses", { params: paramsForRequest }).then((r) => r.data),
  });
  const paged =
    expensesPayload && isPagedResponse(expensesPayload)
      ? expensesPayload
      : null;
  const pageExpenses: Expense[] = paged
    ? paged.data
    : Array.isArray(expensesPayload)
      ? expensesPayload
      : [];
  // Confirmation pins the authoritative Expense independently of the user's
  // normal filter/sort/page, without rewriting that list context.
  const { data: highlightedExpense, isError: highlightError, isFetching: highlightFetching, refetch: refetchHighlight } = useQuery<Expense>({
    queryKey: expenseKeys.detail(highlightId),
    queryFn: () => api.get<Expense>(`/expenses/${highlightId}`).then((response) => response.data),
    enabled: highlightId > 0 && !isLoading && !pageExpenses.some((expense) => expense.id === highlightId),
  });
  const expenses = highlightedExpense && !pageExpenses.some((expense) => expense.id === highlightId)
    ? [highlightedExpense, ...pageExpenses]
    : pageExpenses;
  const totalPages = paged?.total_pages ?? 1;
  const totalElements = paged?.total_elements ?? expenses.length;

  const selectedExpensesList = expenses.filter((e) =>
    selectedExpenseIds.has(e.id),
  );
  const selectedTotalEur = selectedExpensesList.reduce(
    (sum, e) => sum + (e.amount_eur || 0),
    0,
  );

  const hasActiveFilters = !!(statusFilter || categoryFilter || qParam);
  const activeFilterCount = [statusFilter, categoryFilter].filter(
    Boolean,
  ).length;

  useEffect(() => {
    if (statusFilter || categoryFilter) setFiltersOpen(true);
  }, [statusFilter, categoryFilter]);

  // When filters yield nothing, check once whether there's any data at all,
  // so we can show "No results + Clear filters" instead of the cold empty state.
  const shouldProbeAnyData =
    !isLoading &&
    !expensesError &&
    expensesPayload !== undefined &&
    expenses.length === 0 &&
    hasActiveFilters;
  const {
    data: anyDataExists,
    isError: anyDataError,
    isFetching: anyDataFetching,
    refetch: refetchAnyData,
  } = useQuery<boolean>({
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
  const activeAnyDataError = shouldProbeAnyData && anyDataError;
  const activeAnyDataFetching = shouldProbeAnyData && anyDataFetching;

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
    onSuccess: () => {
      invalidateLists();
      toast.success(t("deleted_toast"));
    },
    onError: () => toast.error(t("delete_failed")),
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
      aria-label={
        pendingDeleteId === expense.id
          ? t("confirm_delete")
          : `${t("delete_tooltip")} ${expense.merchant || expense.id}`
      }
      className={clsx(
        "min-h-11 inline-flex items-center justify-center gap-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        pendingDeleteId === expense.id
          ? "px-3 min-w-11 bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
          : "min-w-11 text-slate-400 hover:text-red-500 disabled:opacity-50",
        !iconOnly && "",
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

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              {t("title")}
            </h1>
            <p className="text-muted text-sm mt-0.5 truncate">
              {totalElements} {t("total")}
              {offline.pendingCount > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <button
                    type="button"
                    onClick={() => setShowOfflineQueue((value) => !value)}
                    className={clsx(
                      "font-semibold hover:underline",
                      offline.failedCount > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-blue-600 dark:text-blue-400",
                    )}
                    aria-expanded={showOfflineQueue}
                  >
                    {toffline("drafts_badge", { count: offline.pendingCount })}
                    {offline.failedCount > 0
                      ? ` · ${toffline("needs_attention")}`
                      : ""}
                  </button>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <details
              className="relative"
              onToggle={(event) => {
                if (!event.currentTarget.open) setExportOpen(false);
              }}
            >
              <summary
                aria-label={t("more_actions")}
                className="list-none min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-border text-muted hover:bg-card-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
                <span className="sr-only">{t("more_actions")}</span>
              </summary>
              <div className="absolute right-0 top-full mt-2 z-20 min-w-52 rounded-xl border border-border bg-card p-2 shadow-xl">
                <BulkUploadZone
                  isDragging={isDragging}
                  onFilesDropped={handleFilesDropped}
                />
                <div className="relative mt-2">
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => setExportOpen((v) => !v)}
                    aria-expanded={exportOpen}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-card-hover disabled:opacity-50 cursor-pointer"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    {exporting ? t("exporting") : t("export")}
                  </button>
                  {exportOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setExportOpen(false)}
                      />
                      <div
                        role="menu"
                        aria-label={t("export_range_label")}
                        className="absolute right-0 top-full mt-1 w-48 bg-input border border-border rounded-lg shadow-lg z-50 py-1"
                      >
                        <p className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {t("export_range_label")}
                        </p>
                        {(
                          [
                            ["this_month", t("export_this_month")],
                            ["last_month", t("export_last_month")],
                            ["this_year", t("export_this_year")],
                            ["all", t("export_all_time")],
                          ] as [ExportRange, string][]
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setExportRange(value)}
                            role="menuitemradio"
                            aria-checked={exportRange === value}
                            className={clsx(
                              "w-full min-h-11 text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between",
                              exportRange === value
                                ? "text-primary font-semibold"
                                : "text-slate-700 dark:text-slate-200",
                            )}
                          >
                            {label}
                            {exportRange === value && (
                              <span aria-hidden="true">✓</span>
                            )}
                          </button>
                        ))}
                        <hr className="my-1 border-border" />
                        <button
                          type="button"
                          onClick={() => handleExport("csv")}
                          className="w-full min-h-11 text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          {t("download_csv")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExport("xlsx")}
                          className="w-full min-h-11 text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          {t("download_xlsx")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </details>
            <Link
              href="/expenses/new"
              onClick={(e) => {
                if (!allowNavigation()) e.preventDefault();
              }}
              className="min-h-11 inline-flex items-center gap-2 rounded-lg bg-primary px-3 sm:px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover w-fit"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t("add_expense")}
            </Link>
          </div>
        </div>

        {showOfflineQueue && (
          <OfflineQueuePanel onClose={() => setShowOfflineQueue(false)} />
        )}

        <div className="bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                />
                <label htmlFor="expense-search" className="sr-only">
                  {t("search_placeholder_expenses")}
                </label>
                <input
                  id="expense-search"
                  type="search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={t("search_placeholder_expenses")}
                  className="w-full min-h-11 pl-9 pr-3 border border-border rounded-lg text-base lg:text-sm bg-input text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                type="button"
                aria-expanded={filtersOpen}
                aria-controls="expense-filters"
                onClick={() => setFiltersOpen((value) => !value)}
                className="min-h-11 shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-muted hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                {t("filters")}
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
            </div>
            {filtersOpen && (
              <div
                id="expense-filters"
                role="region"
                aria-label={t("filters")}
                className="mt-3 rounded-lg border border-border-subtle bg-background p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    {t("filter_by_status")}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="min-h-11 px-2 text-sm text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
                  >
                    {tc("close")}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {STATUS_PILLS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateParams({ status: s || null }, true)}
                      aria-pressed={statusFilter === s}
                      className={clsx(
                        "min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors",
                        statusFilter === s
                          ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                          : "bg-card text-muted hover:bg-card-hover border border-border",
                      )}
                    >
                      {pillLabels[s]}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <label
                    htmlFor="expense-category-filter"
                    className="mb-1 block text-sm font-medium text-muted"
                  >
                    {t("all_categories")}
                  </label>
                  <select
                    id="expense-category-filter"
                    value={categoryFilter}
                    onChange={(e) =>
                      updateParams(
                        { category_id: e.target.value || null },
                        true,
                      )
                    }
                    className="w-full min-h-11 px-3 py-2 border border-border rounded-lg text-base lg:text-sm bg-input text-slate-700 dark:text-slate-300"
                  >
                    <option value="">{t("all_categories")}</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() =>
                      router.replace("/expenses", { scroll: false })
                    }
                    className="mt-3 min-h-11 px-3 text-sm font-semibold text-primary hover:underline rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {t("clear_filters")}
                  </button>
                )}
              </div>
            )}
          </div>

          {(expensesError || activeAnyDataError) && (
            <QueryErrorNotice
              isFetching={expensesFetching || activeAnyDataFetching}
              onRetry={() => {
                void (expensesError ? refetchExpenses() : refetchAnyData());
              }}
            />
          )}

          {isLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="p-8 text-center text-muted-foreground text-sm"
            >
              {tc("loading")}
            </div>
          ) : !expenses.length ? (
            expensesError || activeAnyDataError ? null : hasActiveFilters &&
              anyDataExists ? (
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
              {highlightError && <QueryErrorNotice isFetching={highlightFetching} onRetry={() => { void refetchHighlight(); }} />}
              {highlightId > 0 && expenses.some((expense) => expense.id === highlightId && expense.verification_state === "VERIFIED") && (
                <p role="status" className="border-b border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
                  {t("expense_confirmed_highlight")}
                </p>
              )}

              {/* Mobile: stacked cards */}
              <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
                {expenses.map((e) => (
                  <div
                    key={e.id}
                    data-expense-row
                    aria-current={highlightId === e.id ? "true" : undefined}
                    onClick={() =>
                      router.push(
                        e.status === "draft"
                          ? `/expenses/${e.id}/edit`
                          : `/expenses/${e.id}`,
                      )
                    }
                    className={clsx(
                      "p-3 active:bg-muted/10 transition-colors cursor-pointer",
                      highlightId === e.id && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {e.status === "draft" && (
                          <input
                            type="checkbox"
                            checked={selectedExpenseIds.has(e.id)}
                            aria-label={t("bundle_checkbox_aria", {
                              name: e.merchant || e.description || String(e.id),
                            })}
                            onChange={() => toggleSelectExpense(e.id)}
                            onClick={(ev) => ev.stopPropagation()}
                            className="w-5 h-5 mt-0.5 rounded accent-blue-600 cursor-pointer shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {e.merchant || "—"}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            {e.date} · {e.category_name || "—"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-foreground">
                          {formatAmount(e.amount_eur, "EUR")}
                        </p>
                        {e.currency_original !== "EUR" && (
                          <p className="text-xs text-muted-foreground">
                            {formatAmount(
                              e.amount_original,
                              e.currency_original,
                            )}
                            {e.fx_rate_manual && (
                              <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                {t("manual_rate")}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    {e.description && (
                      <p className="text-sm text-muted mt-2">{e.description}</p>
                    )}
                    <div
                      className="flex items-center justify-between mt-3"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <Badge status={e.status} />
                      <div className="flex items-center gap-1">
                        {e.receipts?.length > 0 && (
                          <div className="flex items-center gap-2">
                            {e.receipts!.map(
                              (r: {
                                id: number;
                                original_name?: string | null;
                              }) => {
                                const isImg = /\.(jpg|jpeg|png|webp)$/i.test(
                                  r.original_name || "",
                                );
                                const filename =
                                  r.original_name || `receipt_${r.id}`;
                                const receiptUrl = `${API_BASE_URL}/expenses/${e.id}/receipts/${r.id}`;
                                return (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => {
                                      if (isImg) {
                                        setLightboxReceipt({
                                          url: receiptUrl,
                                          title: filename,
                                          expenseId: e.id,
                                          receiptId: r.id,
                                          filename,
                                        });
                                      } else {
                                        downloadBlob(
                                          `/expenses/${e.id}/receipts/${r.id}`,
                                          {},
                                          filename,
                                        );
                                      }
                                    }}
                                    className="min-h-11 px-2 inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline text-xs cursor-pointer"
                                  >
                                    {e.receipts!.length === 1
                                      ? t("view_receipt")
                                      : r.original_name
                                          ?.split(".")
                                          .pop()
                                          ?.toUpperCase() || t("view_receipt")}
                                  </button>
                                );
                              },
                            )}
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
                            <Link
                              href={`/expenses/${e.id}/edit`}
                              aria-label={`${t("edit_expense")} ${e.merchant || e.id}`}
                              className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <Pencil
                                className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                                aria-hidden="true"
                              />
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
                      <th className="w-10 px-4 py-3 text-center">
                        <span className="sr-only">
                          {t("bundle_toolbar_aria")}
                        </span>
                      </th>
                      <th className="text-left px-4 py-3">{t("table_date")}</th>
                      <th className="text-left px-4 py-3">
                        {t("table_merchant")}
                      </th>
                      <th className="text-left px-4 py-3">
                        {t("table_category")}
                      </th>
                      <th className="text-left px-4 py-3">
                        {t("table_description")}
                      </th>
                      <th className="text-right px-4 py-3">{t("table_eur")}</th>
                      <th className="text-center px-4 py-3">
                        {t("table_status")}
                      </th>
                      <th className="text-right px-4 py-3">
                        {t("table_receipt")}
                      </th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr
                        key={e.id}
                        aria-current={highlightId === e.id ? "true" : undefined}
                        className={clsx(
                          "border-t border-slate-100 dark:border-slate-700 hover:bg-card-hover/50",
                          highlightId === e.id && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                        )}
                      >
                        <td className="px-4 py-3 text-center">
                          {e.status === "draft" && (
                            <input
                              type="checkbox"
                              checked={selectedExpenseIds.has(e.id)}
                              aria-label={t("bundle_checkbox_aria", {
                                name:
                                  e.merchant || e.description || String(e.id),
                              })}
                              onChange={() => toggleSelectExpense(e.id)}
                              className="w-4 h-4 mx-auto rounded accent-blue-600 cursor-pointer block"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {e.date}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {e.merchant || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {e.category_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted max-w-[180px] truncate">
                          {e.description || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-foreground">
                            {formatAmount(e.amount_eur, "EUR")}
                          </span>
                          {e.currency_original !== "EUR" && (
                            <span className="block text-xs text-muted-foreground font-normal">
                              {formatAmount(
                                e.amount_original,
                                e.currency_original,
                              )}
                              {e.fx_rate_manual && (
                                <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                  {t("manual_rate")}
                                </span>
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
                              {e.receipts!.map(
                                (r: {
                                  id: number;
                                  original_name?: string | null;
                                }) => {
                                  const isImg = /\.(jpg|jpeg|png|webp)$/i.test(
                                    r.original_name || "",
                                  );
                                  const filename =
                                    r.original_name || `receipt_${r.id}`;
                                  const receiptUrl = `${API_BASE_URL}/expenses/${e.id}/receipts/${r.id}`;
                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => {
                                        if (isImg) {
                                          setLightboxReceipt({
                                            url: receiptUrl,
                                            title: filename,
                                            expenseId: e.id,
                                            receiptId: r.id,
                                            filename,
                                          });
                                        } else {
                                          downloadBlob(
                                            `/expenses/${e.id}/receipts/${r.id}`,
                                            {},
                                            filename,
                                          );
                                        }
                                      }}
                                      className="min-h-11 px-2 inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline text-xs cursor-pointer"
                                    >
                                      {e.receipts!.length === 1
                                        ? t("view_receipt")
                                        : r.original_name
                                            ?.split(".")
                                            .pop()
                                            ?.toUpperCase() ||
                                          t("view_receipt")}
                                    </button>
                                  );
                                },
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 text-xs">
                              —
                            </span>
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
                                <Link
                                  href={`/expenses/${e.id}/edit`}
                                  aria-label={`${t("edit_expense")} ${e.merchant || e.id}`}
                                  className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  <Pencil
                                    className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                                    aria-hidden="true"
                                  />
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
                <nav
                  aria-label="Pagination"
                  className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-700"
                >
                  <button
                    type="button"
                    disabled={page <= 0}
                    onClick={() => updateParams({ page: String(page - 1) })}
                    aria-label={t("prev_page")}
                    className="min-h-11 px-4 py-2 text-sm font-medium rounded-lg border border-input-border text-slate-600 dark:text-slate-300 hover:bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← {tc("previous")}
                  </button>
                  <span className="text-xs text-muted">
                    {t("pager_page", { page: page + 1, totalPages })}
                  </span>
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
      </div>{" "}
      {/* end drag wrapper */}
      {selectedExpenseIds.size > 0 && (
        <div
          role="region"
          aria-label={t("bundle_toolbar_aria")}
          className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-40 bg-slate-900/95 dark:bg-slate-800/95 text-white rounded-2xl shadow-2xl p-3 px-4 flex items-center justify-between gap-3 border border-slate-700/60 backdrop-blur-md animate-in slide-in-from-bottom duration-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full w-6 h-6 shrink-0">
              {selectedExpenseIds.size}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">
                {t("bundle_selected", { count: selectedExpenseIds.size })}
              </p>
              <p className="text-[11px] text-slate-300 truncate">
                {t("bundle_total", {
                  amount: formatAmount(selectedTotalEur, "EUR"),
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-1.5 text-xs text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              {t("bundle_clear")}
            </button>
            <button
              type="button"
              onClick={() => {
                const ids = Array.from(selectedExpenseIds).join(",");
                router.push(`/reports/new?expense_ids=${ids}`);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-transform active:scale-95 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              {t("bundle_create_report")}
            </button>
          </div>
        </div>
      )}
      {lightboxReceipt && (
        <ReceiptLightbox
          isOpen={!!lightboxReceipt}
          onClose={() => setLightboxReceipt(null)}
          imageUrl={lightboxReceipt.url}
          title={lightboxReceipt.title}
          onDownload={() =>
            downloadBlob(
              `/expenses/${lightboxReceipt.expenseId}/receipts/${lightboxReceipt.receiptId}`,
              {},
              lightboxReceipt.filename,
            )
          }
        />
      )}
    </AppShell>
  );
}

export default function ExpensesClient() {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-label="Loading expenses"
          className="flex items-center justify-center min-h-[50vh]"
        >
          <div
            className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
        </div>
      }
    >
      <ExpensesPageContent />
    </Suspense>
  );
}
