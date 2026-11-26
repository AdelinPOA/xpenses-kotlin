"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import api, {
  Report,
  downloadBlob,
  isPagedResponse,
  PagedResponse,
  importOrder,
  previewImportOrder,
  createReport,
  type ImportOrderPreview,
} from "@/lib/api";
import { reportKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import QueryErrorNotice from "@/components/ui/QueryErrorNotice";
import { Plus, Trash2, Eye, Send, ChevronUp, ChevronDown, Search, Download, SlidersHorizontal, X, FileText, Loader2, Users } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { formatEur } from "@/lib/format";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useTranslations } from "next-intl";

type SortKey = "title" | "total" | "submitted_at";
type SortDir = "asc" | "desc";

function extractAxiosErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { detail?: string; message?: string } } };
  return axiosErr?.response?.data?.detail || axiosErr?.response?.data?.message || fallback;
}

function htmlClipboardToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, head, meta, link").forEach((el) => el.remove());
  doc.querySelectorAll("tr").forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("th, td"))
      .map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    tr.replaceWith(doc.createTextNode(cells.length ? `${cells.join(" | ")}\n` : ""));
  });
  doc.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode("\n")));
  doc.querySelectorAll("p, div, li").forEach((el) => el.append(doc.createTextNode("\n")));
  return (doc.body.textContent || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ImportOrderPreview | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useTranslations("reports");

  const isPrivileged = user?.role === "chef_finance" || user?.role === "mod" || user?.role === "manager";

  const closeImportModal = () => {
    setIsImportOpen(false);
    setImportText("");
    setImportError(null);
    setReviewDraft(null);
  };

  const finishImportSuccess = (newReport: Report) => {
    qc.invalidateQueries({ queryKey: reportKeys.all });
    qc.invalidateQueries({ queryKey: dashboardKeys.all });
    toast.success(t("import_order_success"));
    closeImportModal();
    router.push(`/reports/${newReport.id}`);
  };

  const importMutation = useMutation({
    mutationFn: (bodyText: string) => importOrder(bodyText),
    onSuccess: finishImportSuccess,
    onError: (err: unknown) => {
      setImportError(extractAxiosErrorMessage(err, t("import_order_error")));
    },
  });

  const previewMutation = useMutation({
    mutationFn: (bodyText: string) => previewImportOrder(bodyText),
    onSuccess: (preview) => {
      setImportError(null);
      setReviewDraft(preview);
    },
    onError: (err: unknown) => {
      setImportError(extractAxiosErrorMessage(err, t("import_order_error")));
    },
  });

  const createReviewedMutation = useMutation({
    mutationFn: (draft: ImportOrderPreview) =>
      createReport({
        title: draft.title.trim(),
        description: draft.description,
        date_from: draft.date_from || null,
        date_to: draft.date_to || null,
        currency: draft.currency || "EUR",
        kundenauftrag: draft.kundenauftrag || null,
        auftragsart: draft.auftragsart || null,
        positionstyp: draft.positionstyp || null,
        technplatz_raw: draft.technplatz_raw || null,
        technplatz_line: Boolean(draft.technplatz_line),
        kunde_code: draft.kunde_code || null,
        kunde_name: draft.kunde_name || null,
        adresse: draft.adresse || null,
        vorgang: draft.vorgang || null,
        arbeitsplatz: draft.arbeitsplatz || null,
        techniker: draft.techniker || null,
      }),
    onSuccess: finishImportSuccess,
    onError: (err: unknown) => {
      setImportError(extractAxiosErrorMessage(err, t("import_order_error")));
    },
  });

  const isImportBusy =
    importMutation.isPending || previewMutation.isPending || createReviewedMutation.isPending;

  useEffect(() => {
    const status = searchParams.get("status");
    if (status) setStatusFilter(status);
  }, [searchParams]);

  useBodyScrollLock(confirmDeleteId !== null || isImportOpen);

  useEffect(() => {
    if (confirmDeleteId === null && !isImportOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDeleteId !== null) setConfirmDeleteId(null);
        if (isImportOpen && !isImportBusy) closeImportModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDeleteId, isImportOpen, isImportBusy]);

  useEffect(() => {
    if (isPrivileged && user?.role === "manager") setShowAll(true);
  }, [user?.role]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const { data: reports, isLoading, isError, isFetching, refetch } = useQuery<Report[]>({
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
  const hasMobileDrawerFilter = Boolean(ownerFilter);

  const filtered = (reports ?? []).filter((r) => {
    if (ownerFilter && r.user_display_name !== ownerFilter) return false;
    if (debouncedSearch === "") return true;
    const q = debouncedSearch.toLowerCase();
    return r.title.toLowerCase().includes(q) || (r.user_display_name ?? "").toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "submitted_at") {
      const aDraft = a.status === "draft";
      const bDraft = b.status === "draft";
      if (aDraft !== bDraft) return aDraft ? -1 : 1;
      if (aDraft && bDraft) {
        const createdCmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
        return sortDir === "asc" ? createdCmp : -createdCmp;
      }
    }
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
      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-3 md:mb-6">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-foreground truncate">
            {showAll ? t("company_reports") : t("my_reports")}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 tabular-nums">{reports?.length ?? 0} {t("total")}</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {isPrivileged && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={clsx(
                "hidden md:inline-flex min-h-11 items-center px-3 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                showAll
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-card border-border text-muted hover:text-foreground hover:bg-card-hover shadow-2xs"
              )}
            >
              {showAll ? t("toggle_my") : t("toggle_all")}
            </button>
          )}
          <button
            type="button"
            aria-label={t("import_order")}
            title={t("import_order")}
            onClick={() => {
              setImportText("");
              setImportError(null);
              setReviewDraft(null);
              setIsImportOpen(true);
            }}
            className="inline-flex h-9 w-9 md:h-auto md:w-auto md:min-h-11 items-center justify-center gap-1.5 md:px-3.5 md:py-2 bg-card border border-border text-foreground text-xs sm:text-sm font-semibold rounded-xl hover:bg-card-hover whitespace-nowrap shrink-0 shadow-2xs cursor-pointer transition-colors"
          >
            <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="hidden md:inline">{t("import_order")}</span>
          </button>
          <div className="relative">
            <button
              disabled={exporting}
              onClick={() => setExportOpen((v) => !v)}
              aria-expanded={exportOpen}
              aria-label={exporting ? t("exporting") : t("export")}
              title={exporting ? t("exporting") : t("export")}
              className="inline-flex h-9 w-9 md:h-auto md:w-auto md:min-h-11 items-center justify-center gap-1.5 md:px-3.5 md:py-2 bg-card border border-border text-foreground text-xs sm:text-sm font-semibold rounded-xl hover:bg-card-hover whitespace-nowrap shrink-0 shadow-2xs disabled:opacity-50 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="hidden md:inline">{exporting ? t("exporting") : t("export")}</span>
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-40 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={() => handleExport("csv")}
                    className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-card-hover transition-colors"
                  >
                    {t("download_csv")}
                  </button>
                  <button
                    onClick={() => handleExport("xlsx")}
                    className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-card-hover transition-colors"
                  >
                    {t("download_xlsx")}
                  </button>
                </div>
              </>
            )}
          </div>
          <Link
            href="/reports/new"
            aria-label={t("new_report")}
            className="inline-flex h-9 md:h-auto md:min-h-11 items-center gap-1 sm:gap-1.5 px-3 md:px-4 md:py-2 bg-primary text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-primary-hover whitespace-nowrap shrink-0 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="md:hidden">{t("new_report_short")}</span>
            <span className="hidden md:inline">{t("new_report")}</span>
          </Link>
        </div>
      </div>

      {delError && (
        <div className="mb-4 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
          {delError}
          <button type="button" onClick={() => setDelError("")} className="ml-2 font-bold">×</button>
        </div>
      )}

      <div className="mb-3 space-y-2.5 md:hidden">
        <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card pl-3 pr-1.5 shadow-2xs focus-within:border-primary/50 transition-colors">
          <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
          <input
            id="report-search-mobile"
            name="report_search_mobile"
            aria-label={t("search_placeholder")}
            type="text"
            placeholder={t("search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("clear_search")}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            aria-label={t("filters")}
            aria-expanded={mobileFiltersOpen}
            className={clsx(
              "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
              mobileFiltersOpen || hasMobileDrawerFilter
                ? "bg-primary/15 text-primary"
                : "bg-slate-100 text-muted-foreground hover:text-foreground dark:bg-slate-800"
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {hasMobileDrawerFilter && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                aria-pressed={statusFilter === s}
                className={clsx(
                  "h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors",
                  statusFilter === s
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {s === "" ? t("filter_all") : t(`status_${s}` as any)}
              </button>
            ))}
          </div>
          {isPrivileged && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              aria-pressed={showAll}
              aria-label={showAll ? t("toggle_my") : t("toggle_all")}
              className={clsx(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors",
                showAll
                  ? "bg-primary/15 border-primary/50 text-primary"
                  : "bg-card border-border text-foreground hover:bg-card-hover"
              )}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              {t("scope_company_short")}
            </button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-2xs overflow-hidden">
        {mobileFiltersOpen && (
          <div className="md:hidden px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-700 space-y-2.5 bg-slate-50/60 dark:bg-slate-900/40">
            <div className="flex flex-wrap items-center gap-1.5">
              {(["submitted_at", "total", "title"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSort(key)}
                  className={clsx(
                    "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
                    sortKey === key
                      ? "bg-slate-800 border-slate-800 text-white dark:bg-slate-200 dark:border-slate-200 dark:text-slate-900"
                      : "bg-card border-border text-muted-foreground"
                  )}
                >
                  {key === "submitted_at" ? t("table_submitted") : key === "total" ? t("table_total") : t("table_title")}
                  <SortIcon k={key} />
                </button>
              ))}
            </div>
            {showAll && uniqueOwners.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-medium mr-0.5">{t("employee_filter")}</span>
                <button
                  type="button"
                  onClick={() => setOwnerFilter("")}
                  className={clsx(
                    "h-8 px-3 rounded-full text-xs font-medium transition-colors",
                    ownerFilter === ""
                      ? "bg-primary text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  )}
                >
                  {t("filter_all")}
                </button>
                {uniqueOwners.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setOwnerFilter(ownerFilter === name ? "" : name)}
                    className={clsx(
                      "h-8 px-3 rounded-full text-xs font-medium transition-colors",
                      ownerFilter === name
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="hidden md:flex p-4 border-b border-slate-100 dark:border-slate-700 flex-wrap gap-3 items-center">
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
          <div className="hidden md:flex px-4 py-2 border-b border-slate-100 dark:border-slate-700 flex-wrap gap-2 items-center">
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

        {isError && (
          <QueryErrorNotice isFetching={isFetching} onRetry={() => { void refetch(); }} />
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
        ) : !sorted.length ? isError ? null : (
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
            <div className="md:hidden divide-y divide-border/80">
              {sorted.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/reports/${r.id}`} className="font-semibold text-foreground hover:text-primary transition-colors break-words">
                        {r.title}
                      </Link>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        {showAll && r.user_display_name ? `${r.user_display_name} · ` : ""}
                        {r.date_from && r.date_to ? `${r.date_from} — ${r.date_to}` : "—"}
                      </p>
                    </div>
                    <p className="font-mono font-semibold text-foreground shrink-0 tabular-nums">
                      {formatEur(r.expenses.reduce((s, e) => s + e.amount_eur, 0) || r.total_amount)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <Badge status={r.status} />
                      <span className="text-xs text-muted-foreground">
                        {r.expenses.length === 1 ? t("expense_count_one", { count: r.expenses.length }) : t("expense_count_other", { count: r.expenses.length })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
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
              <thead className="bg-surface-subtle/75 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
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

      {isImportOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-order-title"
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isImportBusy) {
              closeImportModal();
            }
          }}
        >
          <div
            className={clsx(
              "bg-card rounded-xl border border-border shadow-xl w-full p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto",
              reviewDraft ? "max-w-2xl" : "max-w-lg",
            )}
          >
            <div className="flex items-center justify-between">
              <h3 id="import-order-title" className="text-lg font-bold text-foreground">
                {reviewDraft ? t("import_order_review_title") : t("import_order_modal_title")}
              </h3>
              <button
                type="button"
                disabled={isImportBusy}
                onClick={closeImportModal}
                className="text-muted hover:text-foreground p-1 rounded-md transition-colors cursor-pointer"
                aria-label={t("import_order_cancel")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted">
              {reviewDraft ? t("import_order_review_desc") : t("import_order_modal_desc")}
            </p>

            {importError && (
              <div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
                {importError}
              </div>
            )}

            {!reviewDraft ? (
              <>
                <div className="space-y-1.5">
                  <textarea
                    value={importText}
                    onChange={(e) => {
                      setImportText(e.target.value);
                      if (importError) setImportError(null);
                    }}
                    onPaste={(e) => {
                      const html = e.clipboardData?.getData("text/html");
                      if (!html || !/<table[\s>]/i.test(html)) return;
                      const normalized = htmlClipboardToText(html);
                      if (!normalized) return;
                      e.preventDefault();
                      const el = e.currentTarget;
                      const start = el.selectionStart ?? importText.length;
                      const end = el.selectionEnd ?? importText.length;
                      const updated =
                        importText.slice(0, start) + normalized + importText.slice(end);
                      setImportText(updated);
                      if (importError) setImportError(null);
                    }}
                    disabled={isImportBusy}
                    rows={8}
                    placeholder={t("import_order_placeholder")}
                    className="w-full border rounded-lg px-3 py-2 text-xs font-mono bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                    autoFocus
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isImportBusy}
                    onClick={closeImportModal}
                    className="min-h-10 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {t("import_order_cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={isImportBusy || !importText.trim()}
                    onClick={() => importMutation.mutate(importText.trim())}
                    className="min-h-10 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {importMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t("import_order_submitting")}</span>
                      </>
                    ) : (
                      <span>{t("import_order_submit")}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isImportBusy || !importText.trim()}
                    onClick={() => previewMutation.mutate(importText.trim())}
                    className="min-h-10 px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {previewMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t("import_order_review_loading")}</span>
                      </>
                    ) : (
                      <span>{t("import_order_review_submit")}</span>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {reviewDraft.existing_draft_report_id != null && (
                  <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-1.5">
                    <span>
                      {t("import_order_duplicate_warning", {
                        order: reviewDraft.kundenauftrag || "",
                      })}
                    </span>
                    <Link
                      href={`/reports/${reviewDraft.existing_draft_report_id}`}
                      onClick={closeImportModal}
                      className="font-semibold underline hover:text-amber-950 dark:hover:text-amber-100"
                    >
                      #{reviewDraft.existing_draft_report_id}{" "}
                      {reviewDraft.existing_draft_report_title}
                    </Link>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <label className="sm:col-span-2 space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_title")}
                    </span>
                    <input
                      type="text"
                      value={reviewDraft.title}
                      onChange={(e) =>
                        setReviewDraft({ ...reviewDraft, title: e.target.value })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_date_from")}
                    </span>
                    <input
                      type="date"
                      value={reviewDraft.date_from}
                      onChange={(e) =>
                        setReviewDraft({ ...reviewDraft, date_from: e.target.value })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_date_to")}
                    </span>
                    <input
                      type="date"
                      value={reviewDraft.date_to}
                      onChange={(e) =>
                        setReviewDraft({ ...reviewDraft, date_to: e.target.value })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_order_no")}
                    </span>
                    <input
                      type="text"
                      value={reviewDraft.kundenauftrag ?? ""}
                      onChange={(e) =>
                        setReviewDraft({
                          ...reviewDraft,
                          kundenauftrag: e.target.value,
                        })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_order_type")}
                    </span>
                    <input
                      type="text"
                      value={reviewDraft.auftragsart ?? ""}
                      onChange={(e) =>
                        setReviewDraft({
                          ...reviewDraft,
                          auftragsart: e.target.value,
                        })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_customer_name")}
                    </span>
                    <input
                      type="text"
                      value={reviewDraft.kunde_name ?? ""}
                      onChange={(e) =>
                        setReviewDraft({
                          ...reviewDraft,
                          kunde_name: e.target.value,
                        })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_customer_code")}
                    </span>
                    <input
                      type="text"
                      value={reviewDraft.kunde_code ?? ""}
                      onChange={(e) =>
                        setReviewDraft({
                          ...reviewDraft,
                          kunde_code: e.target.value,
                        })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_work_center")}
                    </span>
                    <input
                      type="text"
                      value={reviewDraft.arbeitsplatz ?? ""}
                      onChange={(e) =>
                        setReviewDraft({
                          ...reviewDraft,
                          arbeitsplatz: e.target.value,
                        })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_technician")}
                    </span>
                    <input
                      type="text"
                      value={reviewDraft.techniker ?? ""}
                      onChange={(e) =>
                        setReviewDraft({
                          ...reviewDraft,
                          techniker: e.target.value,
                        })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="sm:col-span-2 space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_address")}
                    </span>
                    <input
                      type="text"
                      value={reviewDraft.adresse ?? ""}
                      onChange={(e) =>
                        setReviewDraft({ ...reviewDraft, adresse: e.target.value })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="sm:col-span-2 space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_tech_location")}
                    </span>
                    <input
                      type="text"
                      value={reviewDraft.technplatz_raw ?? ""}
                      onChange={(e) =>
                        setReviewDraft({
                          ...reviewDraft,
                          technplatz_raw: e.target.value,
                        })
                      }
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                  <label className="sm:col-span-2 space-y-1">
                    <span className="text-xs font-medium text-muted">
                      {t("import_order_field_description")}
                    </span>
                    <textarea
                      value={reviewDraft.description}
                      onChange={(e) =>
                        setReviewDraft({
                          ...reviewDraft,
                          description: e.target.value,
                        })
                      }
                      rows={5}
                      disabled={isImportBusy}
                      className="w-full border rounded-lg px-3 py-2 text-xs font-mono bg-input border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isImportBusy}
                    onClick={() => {
                      setImportError(null);
                      setReviewDraft(null);
                    }}
                    className="min-h-10 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {t("import_order_back")}
                  </button>
                  <button
                    type="button"
                    disabled={isImportBusy}
                    onClick={closeImportModal}
                    className="min-h-10 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {t("import_order_cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={isImportBusy || !reviewDraft.title.trim()}
                    onClick={() => createReviewedMutation.mutate(reviewDraft)}
                    className="min-h-10 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {createReviewedMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t("import_order_creating")}</span>
                      </>
                    ) : (
                      <span>{t("import_order_create_report")}</span>
                    )}
                  </button>
                </div>
              </>
            )}
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
