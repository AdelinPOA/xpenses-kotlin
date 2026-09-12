"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/layout/AppShell";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/components/AuthProvider";
import { useOfflineSync } from "@/components/OfflineSyncProvider";
import { expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import { OCRScanResult } from "@/lib/api";
import { scanReceipt, ScanProgress, ScanCancelledError, ScanTimeoutError, ScanJobError } from "@/lib/ocrScan";
import { saveNewExpense } from "@/lib/expenseSaving";
import { triggerHaptic } from "@/lib/haptics";
import { formatEur } from "@/lib/format";
import ReceiptLightbox from "@/components/expenses/ReceiptLightbox";
import { Camera, FileText, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Loader2, Maximize2 } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "next-intl";

interface CapturedItem {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "reading" | "ready" | "needs_details" | "failed";
  progressPhase?: string;
  progressSeconds?: number;
  expenseId?: number;
  merchant?: string | null;
  amountEur?: number | null;
  errorMessage?: string;
  createdAt: number;
}

export default function CapturePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { refreshCount: refreshOffline } = useOfflineSync();
  const t = useTranslations("expenses");
  const tc = useTranslations("capture");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [sessionItems, setSessionItems] = useState<CapturedItem[]>([]);
  const objectUrlsRef = useRef<string[]>([]);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<CapturedItem>) => {
    setSessionItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  const processCapturedFile = useCallback(async (clientItemId: string, file: File) => {
    updateItem(clientItemId, { status: "uploading" });

    let scanned: OCRScanResult | null = null;
    try {
      scanned = await scanReceipt(file, {
        signal: undefined,
        onProgress: (p: ScanProgress) => {
          updateItem(clientItemId, {
            status: p.phase === "uploading" ? "uploading" : "reading",
            progressPhase: p.phase,
            progressSeconds: p.elapsedSeconds,
          });
        },
      });
    } catch (err: any) {
      if (err instanceof ScanCancelledError || err?.name === "AbortError") {
        setSessionItems((prev) => prev.filter((item) => item.id !== clientItemId));
        return;
      }
      scanned = null;
      if (!(err instanceof ScanTimeoutError) && !(err instanceof ScanJobError)) {
        console.warn("OCR background scan warning", err);
      }
    }

    const payload: Record<string, unknown> = {
      amount: scanned?.amount ?? 0,
      currency: scanned?.currency ?? "EUR",
      date: scanned?.date ?? new Date().toISOString().slice(0, 10),
      merchant: scanned?.merchant ?? null,
      description: scanned?.description ?? null,
      category_id: scanned?.category_id ?? null,
      tax_amount: scanned?.tax_amount ?? 0,
      tax_rate: scanned?.tax_rate ?? null,
      raw_ocr_text: scanned?.raw_text ?? null,
      comparison_id: scanned?.comparison_id ?? null,
    };

    try {
      if (!user?.id) throw new Error(t("error_save"));
      const outcome = await saveNewExpense(payload, [file], user.id);
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });

      if (outcome.status === "failed") {
        await refreshOffline();
        updateItem(clientItemId, {
          status: "failed",
          errorMessage: outcome.message,
        });
        toast.error(outcome.message);
        return;
      }

      if (outcome.status === "queued") {
        await refreshOffline();
        updateItem(clientItemId, {
          status: "ready",
          merchant: (payload.merchant as string | null) ?? null,
          amountEur: typeof payload.amount === "number" ? payload.amount : 0,
        });
        toast.success(t("saved_offline_toast"));
        return;
      }

      const expenseId = outcome.expense.id;
      const amountEur = outcome.expense.amount_eur;
      const merchant = outcome.expense.merchant;

      if (outcome.status === "partial" || !scanned) {
        await refreshOffline();
        updateItem(clientItemId, {
          status: "needs_details",
          expenseId,
          merchant,
          amountEur,
        });
        toast.warning(tc("draft_needs_details_toast"));
      } else {
        updateItem(clientItemId, {
          status: "ready",
          expenseId,
          merchant,
          amountEur,
        });
        toast.success(tc("draft_saved_toast"));
      }
    } catch (err: any) {
      updateItem(clientItemId, {
        status: "failed",
        errorMessage: err?.response?.data?.detail ?? err?.message ?? t("error_save"),
      });
      toast.error(err?.response?.data?.detail ?? err?.message ?? t("error_save"));
    }
  }, [user?.id, t, tc, qc, refreshOffline, toast, updateItem]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    triggerHaptic(15);

    const clientItemId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.push(previewUrl);

    const newItem: CapturedItem = {
      id: clientItemId,
      file,
      previewUrl,
      status: "uploading",
      createdAt: Date.now(),
    };

    setSessionItems((prev) => [newItem, ...prev]);

    // Asynchronous non-blocking processing (ADR 0004)
    processCapturedFile(clientItemId, file);
  };

  return (
    <AppShell>
      <div className="max-w-lg mx-auto flex flex-col gap-5 pb-8">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
          aria-hidden="true"
        />
        <input
          ref={scanInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.webp"
          onChange={handleFile}
          className="hidden"
          aria-hidden="true"
        />

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground">{tc("title")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{tc("subtitle")}</p>
          </div>
          {sessionItems.length > 0 && (
            <Link
              href="/expenses"
              className="text-xs font-bold text-primary hover:underline"
            >
              {tc("view_all")}
            </Link>
          )}
        </div>

        {/* Main Instant Capture Hero Button */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic(10);
            cameraInputRef.current?.click();
          }}
          className="relative flex flex-col items-center justify-center gap-3 min-h-[200px] sm:min-h-[220px] rounded-3xl border-2 border-dashed border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 transition-all active:scale-[0.99] cursor-pointer shadow-xs"
          aria-label={tc("tap_to_capture")}
        >
          <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md">
            <Camera className="w-8 h-8" aria-hidden="true" />
          </div>
          <div className="text-center px-4">
            <span className="text-sm font-bold text-foreground block">
              {tc("tap_to_capture")}
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">
              {tc("batch_hint")}
            </span>
          </div>
        </button>

        {/* Action Controls */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(10);
              cameraInputRef.current?.click();
            }}
            className="min-h-11 flex-1 inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-hover active:scale-[0.99] shadow-xs"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            {tc("take_photo")}
          </button>
          <button
            type="button"
            onClick={() => scanInputRef.current?.click()}
            className="min-h-11 flex-1 inline-flex items-center justify-center gap-2 border border-border text-foreground text-sm font-semibold rounded-xl hover:bg-card-hover active:scale-[0.99]"
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            {tc("choose_file")}
          </button>
        </div>

        {/* Continuous Session Ingestion Feed */}
        {sessionItems.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {tc("session_drafts", { count: sessionItems.length })}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {sessionItems.filter((i) => i.status === "uploading" || i.status === "reading").length > 0
                  ? tc("processing")
                  : ""}
              </span>
            </div>

            <div className="divide-y divide-border/60">
              {sessionItems.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1"
                >
                  {/* Thumbnail with tap-to-expand lightbox */}
                  <div
                    onClick={() => setLightboxImage({ url: item.previewUrl, title: item.merchant || "Receipt" })}
                    className="relative w-14 h-14 rounded-xl overflow-hidden bg-muted/20 border border-border shrink-0 cursor-pointer group"
                    title={t("view_receipt")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                      <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </div>
                  </div>

                  {/* Metadata and Stage Status */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">
                      {item.merchant || (item.status === "ready" ? t("unknown_merchant_fallback") : item.file.name)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {item.status === "uploading" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                          {t("scan_uploading")}
                        </span>
                      )}
                      {item.status === "reading" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                          {t("scan_reading", { seconds: item.progressSeconds ?? 0 })}
                        </span>
                      )}
                      {item.status === "ready" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {tc("status_ready")} {item.amountEur ? `· ${formatEur(item.amountEur)}` : ""}
                        </span>
                      )}
                      {item.status === "needs_details" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          {tc("status_needs_review")}
                        </span>
                      )}
                      {item.status === "failed" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          {tc("status_failed")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Navigation to edit draft */}
                  {item.expenseId && (
                    <Link
                      href={`/expenses/${item.expenseId}/edit`}
                      className="min-h-11 px-3 inline-flex items-center justify-center gap-1 text-xs font-bold text-primary hover:bg-primary/10 rounded-xl transition-colors shrink-0"
                      aria-label={`${tc("view_details")} ${item.merchant || item.expenseId}`}
                    >
                      <span>{tc("view_details")}</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Receipt Lightbox */}
      {lightboxImage && (
        <ReceiptLightbox
          isOpen={!!lightboxImage}
          onClose={() => setLightboxImage(null)}
          imageUrl={lightboxImage.url}
          title={lightboxImage.title}
        />
      )}
    </AppShell>
  );
}
