"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeft, Edit3, Download, FileText, Calendar, Tag, Building, DollarSign, Eye } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import api, { Expense, downloadBlob, API_BASE_URL } from "@/lib/api";
import { expenseKeys } from "@/lib/queryKeys";
import { formatAmount, formatEur, formatDate } from "@/lib/format";
import ReceiptLightbox from "@/components/expenses/ReceiptLightbox";
import clsx from "clsx";

export default function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; onDownload?: () => void } | null>(null);

  const { data: expense, isLoading, error } = useQuery<Expense>({
    queryKey: expenseKeys.detail(parseInt(id, 10)),
    queryFn: () => api.get(`/expenses/${id}`).then((r) => r.data),
  });

  const handleDownload = async (receiptId: number, originalName: string | null) => {
    const filename = originalName || `receipt-${receiptId}.jpg`;
    await downloadBlob(`/expenses/${id}/receipts/${receiptId}`, {}, filename);
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/expenses");
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto pb-12">
        {/* Top Back Nav */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center min-h-[44px] px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {tc("back")}
          </button>
          {expense && expense.status === "draft" && (
            <Link
              href={`/expenses/${id}/edit`}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <Edit3 className="w-4 h-4 mr-1.5" />
              {tc("edit")}
            </Link>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="animate-pulse bg-card h-12 w-1/3 rounded-xl" />
            <div className="animate-pulse bg-card h-64 rounded-xl" />
          </div>
        ) : error || !expense ? (
          <div className="p-8 text-center bg-card rounded-2xl border border-border shadow-sm">
            <p className="text-destructive font-medium mb-4">{t("not_found", { defaultValue: "Expense not found" })}</p>
            <Link
              href="/expenses"
              className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm font-medium text-primary hover:underline"
            >
              {tc("back")}
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Main Header */}
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-foreground">
                    {expense.merchant || `Expense #${expense.id}`}
                  </h1>
                  <Badge status={expense.status} />
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {expense.date ? formatDate(expense.date) : "—"}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <div className="text-3xl font-extrabold text-foreground">
                  {formatAmount(expense.amount_original, expense.currency_original)}
                </div>
                {expense.currency_original !== "EUR" && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    ≈ {formatEur(expense.amount_eur)}
                    {expense.fx_rate && (
                      <span className="text-xs ml-1 opacity-75">
                        (@ {expense.fx_rate})
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Grid for Details & Receipts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Expense Details Card */}
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm space-y-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2 border-b border-border/50 pb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  {tc("details", { defaultValue: "Details" })}
                </h2>

                <dl className="grid grid-cols-1 gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase">{t("category")}</dt>
                    <dd className="text-foreground font-medium flex items-center gap-1.5 mt-0.5">
                      <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                      {expense.category_name || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase">{t("merchant")}</dt>
                    <dd className="text-foreground font-medium flex items-center gap-1.5 mt-0.5">
                      <Building className="w-3.5 h-3.5 text-muted-foreground" />
                      {expense.merchant || "—"}
                    </dd>
                  </div>

                  {expense.description && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground uppercase">{t("description")}</dt>
                      <dd className="text-foreground mt-0.5 whitespace-pre-wrap">{expense.description}</dd>
                    </div>
                  )}

                  {expense.report_id && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground uppercase">{tc("report", { defaultValue: "Report" })}</dt>
                      <dd className="mt-0.5">
                        <Link
                          href={`/reports/${expense.report_id}`}
                          className="text-primary hover:underline font-medium inline-flex items-center min-h-[44px]"
                        >
                          Report #{expense.report_id}
                        </Link>
                      </dd>
                    </div>
                  )}

                  {expense.tax_amount > 0 && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground uppercase">{t("tax")}</dt>
                      <dd className="text-foreground mt-0.5">
                        {formatAmount(expense.tax_amount, expense.currency_original)}
                        {expense.tax_rate && ` (${expense.tax_rate}%)`}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Receipts Card */}
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm space-y-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2 border-b border-border/50 pb-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  {t("receipts")} ({expense.receipts?.length || 0})
                </h2>

                {expense.receipts && expense.receipts.length > 0 ? (
                  <div className="space-y-3">
                    {expense.receipts.map((r) => {
                      const receiptUrl = `${API_BASE_URL}/expenses/${id}/receipts/${r.id}`;
                      const isImage = /\.(jpg|jpeg|png|webp)$/i.test(r.original_name || "");
                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-border/60 hover:border-primary/50 transition-colors"
                        >
                          <div
                            onClick={() => {
                              if (isImage) {
                                setLightboxImage({
                                  url: receiptUrl,
                                  title: r.original_name || `Receipt #${r.id}`,
                                  onDownload: () => handleDownload(r.id, r.original_name),
                                });
                              }
                            }}
                            className={clsx("flex items-center gap-3 min-w-0 flex-1 mr-3", isImage && "cursor-pointer group")}
                          >
                            {isImage && (
                              <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted/20 border border-border shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={receiptUrl}
                                  alt=""
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                {r.original_name || `Receipt-${r.id}`}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDate(r.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isImage && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLightboxImage({
                                    url: receiptUrl,
                                    title: r.original_name || `Receipt #${r.id}`,
                                    onDownload: () => handleDownload(r.id, r.original_name),
                                  })
                                }
                                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                aria-label={`View ${r.original_name || "receipt"}`}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDownload(r.id, r.original_name)}
                              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 text-primary hover:text-primary/80 hover:bg-primary/10 rounded-lg transition-colors"
                              aria-label={`Download ${r.original_name || "receipt"}`}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {t("no_receipts", { defaultValue: "No receipts attached" })}
                  </p>
                )}
              </div>
            </div>

            {/* OCR raw text if available */}
            {expense.raw_ocr_text && (
              <div className="bg-card p-6 rounded-2xl border border-border shadow-sm space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("ocr_raw_text", { defaultValue: "OCR Extracted Text" })}
                </h3>
                <pre className="text-xs text-muted-foreground bg-background p-4 rounded-xl overflow-x-auto whitespace-pre-wrap font-mono">
                  {expense.raw_ocr_text}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {lightboxImage && (
        <ReceiptLightbox
          isOpen={!!lightboxImage}
          onClose={() => setLightboxImage(null)}
          imageUrl={lightboxImage.url}
          title={lightboxImage.title}
          onDownload={lightboxImage.onDownload}
        />
      )}
    </AppShell>
  );
}
