"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import api, { Expense, CURRENCIES } from "@/lib/api";
import { reportKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import { useFormGuard } from "@/lib/useFormGuard";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import { formatEur } from "@/lib/format";
import { LOCALE_TO_INTL, type Locale } from "@/i18n/config";
import { useLocale, useTranslations } from "next-intl";

function NewReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState("");
  const submitKeyRef = useRef<string | null>(null);
  const t = useTranslations("reports");
  const locale = useLocale() as Locale;

  const isDirty = () => {
    return !!(title.trim() || description.trim() || dateFrom || dateTo || selectedIds.size > 0);
  };
  const { clearDirty } = useFormGuard(isDirty, t("guard_unsaved_changes"));

  const initialIdsParam = searchParams.get("expense_ids");

  useEffect(() => {
    if (initialIdsParam) {
      const parsed = initialIdsParam
        .split(",")
        .map((x) => parseInt(x.trim(), 10))
        .filter((x) => !isNaN(x) && x > 0);
      if (parsed.length > 0) {
        setSelectedIds(new Set(parsed));
      }
    }
  }, [initialIdsParam]);

  const { data: draftExpenses } = useQuery<Expense[]>({
    queryKey: expenseKeys.list({ status: "draft" }),
    queryFn: () => api.get("/expenses", { params: { status: "draft" } }).then((r) => r.data),
  });

  // When bundled draft expenses load, pre-populate date range and suggested title
  useEffect(() => {
    if (draftExpenses && selectedIds.size > 0) {
      const selected = draftExpenses.filter((e) => selectedIds.has(e.id));
      if (selected.length > 0) {
        const dates = selected
          .map((e) => e.date)
          .filter(Boolean)
          .sort();
        if (dates.length > 0) {
          setDateFrom((prev) => prev || dates[0]);
          setDateTo((prev) => prev || dates[dates.length - 1]);
          setTitle((prev) => {
            if (prev) return prev;
            const refDate = new Date(dates[0]);
            const monthName = refDate.toLocaleDateString(LOCALE_TO_INTL[locale], { month: "short", year: "numeric" });
            return `Expense Report - ${monthName}`;
          });
        }
      }
    }
  }, [draftExpenses, selectedIds]);

  useEffect(() => {
    submitKeyRef.current = null;
  }, [title, description, dateFrom, dateTo, currency, selectedIds]);

  const create = useMutation({
    mutationFn: async () => {
      if (!submitKeyRef.current) {
        submitKeyRef.current =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `report-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const expenseIds = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      return api
        .post(
          "/reports",
          {
            title,
            description: description || null,
            date_from: dateFrom || null,
            date_to: dateTo || null,
            currency,
            expense_ids: expenseIds,
          },
          { headers: { "Idempotency-Key": submitKeyRef.current } }
        )
        .then((r) => r.data);
    },
    onSuccess: (report) => {
      clearDirty();
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      router.push(`/reports/${report.id}`);
    },
    onError: (e: any) => setError(e.response?.data?.detail ?? t("new_error_create")),
  });

  const toggleExpense = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError(t("new_error_title_required"));
      return;
    }
    if (!dateFrom || !dateTo) {
      setError(t("new_error_date_required") || "Both start date and end date are required");
      return;
    }
    if (dateTo < dateFrom) {
      setError(t("new_error_date_order") || "End date cannot be earlier than start date");
      return;
    }
    create.mutate();
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("new_title")}</h1>
        <p className="text-muted text-sm mt-1">
          {t("new_description")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="bg-card rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("new_section_details")}</h2>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="report-new-title" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("new_label_title")}</label>
            <input
              id="report-new-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("new_placeholder_title")}
              className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="report-new-date-from" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("new_label_date_from")}</label>
              <input
                id="report-new-date-from"
                type="date"
                required
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="report-new-date-to" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("new_label_date_to")}</label>
              <input
                id="report-new-date-to"
                type="date"
                required
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="report-new-currency" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("new_label_currency")}</label>
            <select
              id="report-new-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="report-new-description" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("new_label_description")}</label>
            <textarea
              id="report-new-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Draft expenses to attach */}
        <div className="bg-card rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
            {t("new_section_attach")}{" "}
            <span className="text-muted-foreground font-normal">{t("new_attach_note")}</span>
          </h2>
          {!draftExpenses?.length ? (
            <p className="text-muted-foreground text-sm">{t("new_empty_drafts")}</p>
          ) : (
            <div className="space-y-2">
              {draftExpenses.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-card-hover"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(e.id)}
                    onChange={() => toggleExpense(e.id)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{e.merchant || e.description || "—"}</p>
                    <p className="text-xs text-muted-foreground">{e.date} · {e.category_name || t("new_category_uncategorized")}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatEur(e.amount_eur)}
                  </p>
                  <Badge status={e.status} />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={create.isPending}
            className="min-h-11 px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
          >
            {create.isPending ? t("new_creating") : selectedIds.size > 0 ? t("new_create_attach") : t("new_create")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isDirty() || window.confirm(t("guard_unsaved_changes"))) {
                clearDirty();
                router.push("/reports");
              }
            }}
            className="min-h-11 px-5 py-2 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
          >
            {t("new_cancel")}
          </button>
        </div>
      </form>
    </AppShell>
  );
}

export default function NewReportPage() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-label="Loading report form" className="flex items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        </div>
      }
    >
      <NewReportContent />
    </Suspense>
  );
}
