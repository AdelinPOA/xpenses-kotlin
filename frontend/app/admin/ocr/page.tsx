"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api, {
  Category,
  getOcrConfig,
  getOcrComparisons,
} from "@/lib/api";
import { ocrKeys, categoryKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Cpu, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import OcrModelSettings from "@/components/admin/OcrModelSettings";

const getStatusColor = (
  ocrVal: string | number | null | undefined,
  finalVal: string | number | null | undefined,
) => {
  if (
    ocrVal === null ||
    ocrVal === undefined ||
    ocrVal === "" ||
    ocrVal === "None"
  ) {
    return "text-slate-400 bg-slate-100/50 dark:bg-slate-800/30 border-border";
  }

  let match: boolean;
  if (typeof ocrVal === "string" && typeof finalVal === "string") {
    match = ocrVal.trim().toLowerCase() === finalVal.trim().toLowerCase();
  } else {
    match = ocrVal === finalVal;
  }

  return match
    ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50"
    : "text-rose-700 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50";
};

export default function OcrAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations("admin");

  const { data, isLoading } = useQuery({
    queryKey: ocrKeys.config(),
    queryFn: getOcrConfig,
    enabled: user?.role === "mod",
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const { data: compData } = useQuery({
    queryKey: ocrKeys.comparison(),
    queryFn: getOcrComparisons,
    enabled: user?.role === "mod",
  });

  const { data: categories } = useQuery({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
    enabled: user?.role === "mod",
    staleTime: 300_000,
    gcTime: 600_000,
  });

  useEffect(() => {
    if (!loading && (!user || user.role !== "mod"))
      router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!user || user.role !== "mod") {
    return null;
  }

  return (
    <AppShell>
      {isLoading ? (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-pulse">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/3 mb-6"></div>
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        </div>
      ) : (
        <div className="px-4 py-8 space-y-6">
          {data && <OcrModelSettings initialConfig={data} />}

          {/* OCR Engine Accuracy Comparison Section */}
          {compData && (
            <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6 max-w-6xl mx-auto">
              <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                  {t("ocr_accuracy")}
                </h2>
              </div>

              {compData.history.length === 0 ? (
                <div className="bg-background/20 border border-dashed border-border rounded-xl p-8 text-center space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-muted">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    No comparison data available
                  </h3>
                  <p className="text-xs text-muted max-w-sm mx-auto">
                    No OCR scans recorded yet. Create an expense and upload a
                    receipt to begin tracking accuracy.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    {/* Model-chain accuracy */}
                    <div className="border border-border rounded-lg p-4 bg-background/40">
                      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 flex items-center justify-between">
                        <span>{t("ocr_configured_ai_models")}</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                          Accuracy
                        </span>
                      </h3>
                      <div className="space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">
                            Amount extraction:
                          </span>
                          <span className="font-semibold text-foreground">
                            {compData.stats.gemini_amount_accuracy}%
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">
                            Date extraction:
                          </span>
                          <span className="font-semibold text-foreground">
                            {compData.stats.gemini_date_accuracy}%
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">
                            Merchant name:
                          </span>
                          <span className="font-semibold text-foreground">
                            {compData.stats.gemini_merchant_accuracy}%
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">
                            Category classification:
                          </span>
                          <span className="font-semibold text-foreground">
                            {compData.stats.gemini_category_accuracy}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* History list */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
                      Scan History & Comparisons (Last {compData.history.length}
                      )
                    </h3>
                    {/* Mobile: stacked cards */}
                    <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 border border-border rounded-lg">
                      {compData.history.map((row) => {
                        const formatCat = (id: number | null) => {
                          if (!id) return null;
                          const cat = categories?.find(
                            (c: Category) => c.id === id,
                          );
                          return cat ? cat.name : `ID: ${id}`;
                        };

                        const isLinked =
                          row.final_amount !== null ||
                          row.final_date !== null ||
                          row.final_merchant !== null;

                        const isFailed =
                          row.gemini_error ||
                          (row.gemini_amount === null &&
                            row.gemini_merchant === null);
                        const errorMsg: string | null = isFailed
                          ? row.gemini_error
                          : null;

                        const fields = [
                          {
                            name: "Amount",
                            gem:
                              row.gemini_amount !== null
                                ? `${row.gemini_amount}`
                                : null,
                            final: isLinked
                              ? row.final_amount !== null
                                ? `${row.final_amount}`
                                : "—"
                              : null,
                          },
                          {
                            name: "Merchant",
                            gem: row.gemini_merchant || null,
                            final: isLinked ? row.final_merchant || "—" : null,
                          },
                          {
                            name: "Date",
                            gem: row.gemini_date || null,
                            final: isLinked ? row.final_date || "—" : null,
                          },
                          {
                            name: "Category",
                            gem: formatCat(row.gemini_category_id),
                            final: isLinked
                              ? (formatCat(row.final_category_id) ?? "—")
                              : null,
                          },
                        ];

                        return (
                          <div key={row.id} className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div
                                  className="font-semibold text-sm text-slate-700 dark:text-slate-300 truncate max-w-[200px]"
                                  title={row.receipt_filename ?? ""}
                                >
                                  {row.receipt_filename ?? "receipt.jpg"}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                                  <span>
                                    {new Date(
                                      row.created_at,
                                    ).toLocaleDateString()}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-semibold font-mono uppercase tracking-wider ${isFailed ? "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 line-through opacity-70" : "bg-slate-100 dark:bg-slate-800 text-muted"}`}
                                  >
                                    {row.provider || "gemini"}
                                  </span>
                                </div>
                              </div>
                              {!isLinked && (
                                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-semibold">
                                  Not saved yet
                                </span>
                              )}
                            </div>
                            {isFailed && (
                              <div className="flex flex-col gap-0.5 mt-1.5">
                                <span className="text-[9px] text-rose-500 font-semibold uppercase tracking-wider">
                                  Failed
                                </span>
                                {errorMsg && (
                                  <div className="text-[8px] text-rose-400 dark:text-rose-300 mt-1 leading-tight border-l-2 border-rose-400 dark:border-rose-800 pl-1">
                                    {errorMsg}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="mt-2 space-y-1.5">
                              {fields.map((f) => (
                                <div
                                  key={f.name}
                                  className="flex items-center justify-between text-[11px] gap-2"
                                >
                                  <span className="font-medium text-muted shrink-0 w-16">
                                    {f.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                    {f.gem !== null ? (
                                      <span
                                        className={`px-2 py-0.5 rounded border text-[11px] font-medium ${isLinked ? getStatusColor(f.gem, f.final) : "text-slate-600 bg-slate-100/50 dark:bg-slate-800/30 border-border"}`}
                                      >
                                        {f.gem}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                    <span className="px-2 py-0.5 rounded bg-blue-50/30 dark:bg-blue-950/10 font-semibold text-foreground text-[11px]">
                                      {f.final !== null ? (
                                        f.final
                                      ) : (
                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                                          Pending…
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop: table */}
                    <div className="hidden md:block overflow-x-auto border border-border rounded-lg">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900 border-b border-border text-muted font-semibold">
                            <th className="p-3 border-r border-border">
                              Receipt / Date
                            </th>
                            <th className="p-3">Field</th>
                            <th className="p-3 font-semibold text-indigo-600 dark:text-indigo-400">
                              {t("ocr_ai_model")}
                            </th>
                            <th className="p-3 bg-blue-50/50 dark:bg-blue-950/20 font-bold text-blue-800 dark:text-blue-300">
                              Final (Ground Truth)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {compData.history.map((row) => {
                            const formatCat = (id: number | null) => {
                              if (!id) return null;
                              const cat = categories?.find(
                                (c: Category) => c.id === id,
                              );
                              return cat ? cat.name : `ID: ${id}`;
                            };

                            // null final_* means this scan hasn't been linked to a saved expense yet
                            const isLinked =
                              row.final_amount !== null ||
                              row.final_date !== null ||
                              row.final_merchant !== null;

                            const isFailed =
                              row.gemini_error ||
                              (row.gemini_amount === null &&
                                row.gemini_merchant === null);
                            const errorMsg: string | null = isFailed
                              ? row.gemini_error
                              : null;

                            const fields = [
                              {
                                name: "Amount",
                                gem:
                                  row.gemini_amount !== null
                                    ? `${row.gemini_amount}`
                                    : null,
                                final: isLinked
                                  ? row.final_amount !== null
                                    ? `${row.final_amount}`
                                    : "—"
                                  : null,
                              },
                              {
                                name: "Merchant",
                                gem: row.gemini_merchant || null,
                                final: isLinked
                                  ? row.final_merchant || "—"
                                  : null,
                              },
                              {
                                name: "Date",
                                gem: row.gemini_date || null,
                                final: isLinked ? row.final_date || "—" : null,
                              },
                              {
                                name: "Category",
                                gem: formatCat(row.gemini_category_id),
                                final: isLinked
                                  ? (formatCat(row.final_category_id) ?? "—")
                                  : null,
                              },
                            ];

                            return fields.map((f, index) => (
                              <tr
                                key={`${row.id}-${f.name}`}
                                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                              >
                                {index === 0 && (
                                  <td
                                    rowSpan={4}
                                    className="p-3 font-medium text-slate-700 dark:text-slate-300 align-top border-r border-border"
                                  >
                                    <div
                                      className="font-semibold truncate max-w-[150px]"
                                      title={row.receipt_filename ?? ""}
                                    >
                                      {row.receipt_filename ?? "receipt.jpg"}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1 flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5">
                                        <span>
                                          {new Date(
                                            row.created_at,
                                          ).toLocaleDateString()}
                                        </span>
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold font-mono uppercase tracking-wider ${isFailed ? "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 line-through opacity-70" : "bg-slate-100 dark:bg-slate-800 text-muted"}`}
                                        >
                                          {row.provider || "gemini"}
                                        </span>
                                      </div>
                                      {isFailed && (
                                        <div className="flex flex-col gap-0.5 mt-0.5">
                                          <span className="text-[9px] text-rose-500 font-semibold uppercase tracking-wider">
                                            Failed
                                          </span>
                                          {errorMsg && (
                                            <div className="text-[8px] text-rose-400 dark:text-rose-300 mt-1 leading-tight border-l-2 border-rose-400 dark:border-rose-800 pl-1">
                                              {errorMsg}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {!isLinked && (
                                      <span className="mt-1.5 inline-block text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-semibold">
                                        Not saved yet
                                      </span>
                                    )}
                                  </td>
                                )}
                                <td className="p-3 font-medium text-muted">
                                  {f.name}
                                </td>
                                <td className="p-3">
                                  {f.gem !== null ? (
                                    <span
                                      className={`px-2 py-0.5 rounded border text-[11px] font-medium ${isLinked ? getStatusColor(f.gem, f.final) : "text-slate-600 bg-slate-100/50 dark:bg-slate-800/30 border-border"}`}
                                    >
                                      {f.gem}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="p-3 bg-blue-50/10 dark:bg-blue-950/5 font-semibold text-foreground border-l border-border">
                                  {f.final !== null ? (
                                    f.final
                                  ) : (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                                      Pending save…
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
