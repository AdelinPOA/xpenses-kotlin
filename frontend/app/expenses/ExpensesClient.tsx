"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import api, { Expense, Category, API_BASE_URL, duplicateExpense, downloadBlob, isPagedResponse, PagedResponse } from "@/lib/api";
import { expenseKeys, dashboardKeys, categoryKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ToastProvider";
import dynamic from "next/dynamic";
import BulkUploadZone from "@/components/expenses/BulkUploadZone";
import { Plus, Trash2, Pencil, Copy, Download } from "lucide-react";
import { formatAmount } from "@/lib/format";
import { useTranslations } from "next-intl";

const BulkReviewDrawer = dynamic(() => import("@/components/expenses/BulkReviewDrawer"), {
  loading: () => <div className="animate-pulse bg-card h-96 rounded-xl" />,
});

function ExpensesPageContent() {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);
  const dragCounterRef = useRef(0); // track nested drag-enter/leave pairs

  useEffect(() => {
    const catId = searchParams.get("category_id");
    if (catId) setCategoryFilter(catId);
  }, [searchParams]);

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
        { format, ...(statusFilter ? { status: statusFilter } : {}), ...(categoryFilter ? { category_id: categoryFilter } : {}) },
        `expenses_${today}.${format}`
      );
    } catch {
      toast.error(t("export_failed"));
    } finally {
      setExporting(false);
    }
  }

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: [...expenseKeys.all, "list", statusFilter, categoryFilter],
    queryFn: () =>
      api.get("/expenses", { params: { ...(statusFilter ? { status: statusFilter } : {}), ...(categoryFilter ? { category_id: categoryFilter } : {}) } }).then((r) => {
        const payload = r.data as Expense[] | PagedResponse<Expense>;
        return isPagedResponse(payload) ? payload.data : payload;
      }),
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });

  const confirmDelete = (id: number) => {
    if (window.confirm(t("delete_confirm"))) {
      del.mutate(id);
    }
  };

  const duplicate = useMutation({
    mutationFn: duplicateExpense,
    onSuccess: (newExpense) => {
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      router.push(`/expenses/${newExpense.id}/edit`);
    },
  });

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
          <p className="text-muted text-sm mt-1">{expenses?.length ?? 0} {t("total")}</p>
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
                <div className="absolute right-0 top-full mt-1 w-36 bg-input border border-border rounded-lg shadow-lg z-50">
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
            href="/expenses/new"
            className="flex min-h-11 items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover w-fit"
          >
            <Plus className="w-4 h-4" />
            {t("add_expense")}
          </Link>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-2">
          {["", "draft", "submitted", "paid"].map((s) => (
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
              {s === "" ? t("status_all") : s === "draft" ? t("status_draft") : s === "submitted" ? t("status_submitted") : t("status_paid")}
            </button>
          ))}
          <label htmlFor="expense-category-filter" className="sr-only">{t("all_categories")}</label>
          <select
            id="expense-category-filter"
            aria-label={t("all_categories")}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-auto sm:ml-auto min-h-11 px-3 py-2 border border-border rounded-lg text-xs bg-input text-slate-700 dark:text-slate-300"
          >
            <option value="">{t("all_categories")}</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div role="status" aria-live="polite" className="p-8 text-center text-muted-foreground text-sm">{tc("loading")}</div>
        ) : !expenses?.length ? (
          <EmptyState message={t("no_expenses_found")} />
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
                          {e.receipts.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => downloadBlob(`/expenses/${e.id}/receipts/${r.id}`, {}, r.original_name || `receipt_${r.id}`)}
                              className="min-h-11 px-2 inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline text-xs cursor-pointer"
                            >
                              {e.receipts.length === 1 ? t("view_receipt") : (r.original_name?.split(".").pop()?.toUpperCase() || t("view_receipt"))}
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
                          <Link href={`/expenses/${e.id}/edit`} aria-label={`Edit expense ${e.merchant || e.id}`} className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                            <Pencil className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" aria-hidden="true" />
                          </Link>
                          <button type="button" onClick={() => confirmDelete(e.id)} disabled={del.isPending} aria-label={`Delete expense ${e.merchant || e.id}`} className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" aria-hidden="true" />
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
                            {e.receipts.map((r) => (
                              <button
                                key={r.id}
                                onClick={() => downloadBlob(`/expenses/${e.id}/receipts/${r.id}`, {}, r.original_name || `receipt_${r.id}`)}
                                className="min-h-11 px-2 inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline text-xs cursor-pointer"
                              >
                                {e.receipts.length === 1 ? t("view_receipt") : (r.original_name?.split(".").pop()?.toUpperCase() || t("view_receipt"))}
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
                            className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
                          >
                            <Copy className="w-4 h-4" aria-hidden="true" />
                          </button>
                          {e.status === "draft" && (
                            <>
                              <Link href={`/expenses/${e.id}/edit`}>
                                <Pencil className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                              </Link>
                              <button
                                onClick={() => confirmDelete(e.id)}
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
