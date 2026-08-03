"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import api, { SearchResult } from "@/lib/api";
import { searchKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";
import { FileText, Receipt } from "lucide-react";
import { formatEur } from "@/lib/format";
import { useTranslations } from "next-intl";

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";
  const t = useTranslations("search");
  const tc = useTranslations("common");

  const { data, isLoading } = useQuery<SearchResult>({
    queryKey: searchKeys.query(query),
    queryFn: () =>
      api.get("/search", { params: { q: query } }).then((r) => r.data),
    enabled: query.length >= 1,
    staleTime: 30_000,
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {t("heading")}
        </h1>
        {query && (
          <p className="text-muted text-sm mt-1">
            {isLoading ? (
              t("searching")
            ) : (
              <>
                {(() => {
                  const n = (data?.report_count ?? 0) + (data?.expense_count ?? 0);
                  return `${n} ${n === 1 ? t("result_one") : t("result_other")}`;
                })()} &ldquo;{query}&rdquo;
              </>
            )}
          </p>
        )}
      </div>

      {!query ? (
        <EmptyState
          message={t("empty_prompt")}
        />
      ) : isLoading ? (
        <div className="space-y-6">
          <div className="bg-card rounded-xl shadow-sm p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Reports Section */}
          {data && data.reports.length > 0 && (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/50">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  {t("reports_section")} ({data.report_count})
                </h2>
              </div>
              <div className="divide-y divide-border">
                {data.reports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/reports/${report.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-card-hover transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{report.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {report.user_display_name || "—"}
                        {report.date_from && report.date_to && (
                          <> · {report.date_from} — {report.date_to}</>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-foreground">
                        {formatEur(report.expenses.reduce((s, e) => s + e.amount_eur, 0) || report.total_amount)}
                      </div>
                      <Badge status={report.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Expenses Section */}
          {data && data.expenses.length > 0 && (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/50">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  {t("expenses_section")} ({data.expense_count})
                </h2>
              </div>
              <div className="divide-y divide-border">
                {data.expenses.map((expense) => (
                  <Link
                    key={expense.id}
                    href={`/expenses/${expense.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-card-hover transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                      <Receipt className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{expense.merchant || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {expense.date} · {expense.category_name || tc("uncategorized")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-foreground">{formatEur(expense.amount_eur)}</div>
                      <Badge status={expense.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {!isLoading && data && data.report_count === 0 && data.expense_count === 0 && (
            <EmptyState
              message={`${t("no_results")} "${query}"`}
              actionLabel={t("clear_search")}
              onAction={() => router.push("/dashboard")}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
