"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import AppShell from "@/components/layout/AppShell";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/components/AuthProvider";
import { useOfflineSync } from "@/components/OfflineSyncProvider";
import { expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import api, { OCRScanResult } from "@/lib/api";
import { scanReceipt, compressImage, ScanProgress, ScanCancelledError, ScanTimeoutError, ScanJobError } from "@/lib/ocrScan";
import { enqueueExpense } from "@/lib/offlineQueue";
import { Camera, FileText, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "next-intl";

const ReceiptScanner = dynamic(() => import("@/components/expenses/ReceiptScanner"), {
  loading: () => <div className="animate-pulse bg-card h-32 rounded-xl" />,
});

/**
 * Receipt-first capture (Phase 1.2): snap a receipt → draft is created
 * automatically with OCR-prefilled fields → stay on the screen ready for
 * the next receipt. Works offline through the IndexedDB draft queue.
 */
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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [sessionDrafts, setSessionDrafts] = useState<{ id: number; merchant: string | null }[]>([]);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function createDraft(payload: Record<string, unknown>, file: File | null): Promise<number | null> {
    const { data: created } = await api.post("/expenses", payload);
    if (file) {
      const fd = new FormData();
      const blob = await compressImage(file);
      fd.append("files", blob, file.name);
      await api.post(`/expenses/${created.id}/receipts`, fd);
    }
    qc.invalidateQueries({ queryKey: expenseKeys.all });
    qc.invalidateQueries({ queryKey: dashboardKeys.all });
    return created.id;
  }

  function showThumbnail(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setThumbnailUrl(objectUrlRef.current);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    await capture(file);
  }

  async function capture(file: File) {
    setBusy(true);
    showThumbnail(file);
    let scanned: OCRScanResult | null = null;
    try {
      scanned = await scanReceipt(file, { signal: undefined, onProgress: setProgress });
    } catch (err: any) {
      if (err instanceof ScanCancelledError || err?.name === "AbortError") {
        setThumbnailUrl(null);
        return;
      }
      // OCR failed — still create a draft holding just the photo.
      scanned = null;
      if (!(err instanceof ScanTimeoutError) && !(err instanceof ScanJobError)) {
        console.warn("OCR scan failed", err);
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
      if (!navigator.onLine) {
        const blob = await compressImage(file);
        await enqueueExpense(payload, [{ name: file.name, type: blob.type || file.type, blob }], user?.id);
        await refreshOffline();
        toast.success(t("saved_offline_toast"));
        resetForNext();
        return;
      }

      const id = await createDraft(payload, file);
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      setSessionDrafts((prev) => [...prev, { id: id!, merchant: (payload.merchant as string | null) ?? null }]);
      if (scanned) {
        toast.success(tc("draft_saved_toast"));
        resetForNext();
      } else {
        // Nothing readable — send the technician straight to details.
        toast.warning(tc("draft_needs_details_toast"));
        router.push(`/expenses/${id}/edit`);
      }
    } catch (err: any) {
      if (!err?.response && !navigator.onLine) {
        // Network dropped mid-capture — queue it like an offline save.
        const blob = await compressImage(file);
        await enqueueExpense(payload, [{ name: file.name, type: blob.type || file.type, blob }], user?.id);
        await refreshOffline();
        toast.success(t("saved_offline_toast"));
        resetForNext();
        return;
      }
      toast.error(err?.response?.data?.detail ?? err?.message ?? t("error_save"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function resetForNext() {
    setThumbnailUrl(null);
  }

  return (
    <AppShell>
      <div className="max-w-lg mx-auto flex flex-col gap-6">
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

        <div>
          <h1 className="text-2xl font-bold text-foreground">{tc("title")}</h1>
          <p className="text-muted text-sm mt-1">{tc("subtitle")}</p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => cameraInputRef.current?.click()}
          className={clsx(
            "relative flex flex-col items-center justify-center gap-3 min-h-[280px] rounded-2xl border-2 border-dashed transition-all",
            busy ? "border-blue-400 bg-blue-50/40 dark:bg-blue-950/20" : "border-input-border hover:bg-card-hover/40 active:scale-[0.99]"
          )}
        >
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-contain rounded-xl p-2" />
          ) : (
            <>
              <Camera aria-hidden="true" className="w-12 h-12 text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {tc("tap_to_capture")}
              </span>
            </>
          )}

          {busy && (
            <div role="status" aria-live="polite" className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-2 bg-card/80 py-2">
              <div aria-hidden="true" className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {progress?.phase === "uploading" ? t("scan_uploading") : t("scan_reading", { seconds: progress?.elapsedSeconds ?? 0 })}
              </p>
            </div>
          )}
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            className="min-h-11 flex-1 inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            {tc("take_photo")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => scanInputRef.current?.click()}
            className="min-h-11 flex-1 inline-flex items-center justify-center gap-2 border border-input-border text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-card-hover disabled:opacity-50"
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            {tc("choose_file")}
          </button>
        </div>

        {(sessionDrafts.length > 0 || busy) && (
          <div className="bg-card rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {tc("session_drafts", { count: sessionDrafts.length })}
            </p>
            {sessionDrafts.length > 0 && (
              <ul className="space-y-1.5">
                {sessionDrafts.slice().reverse().map((d) => (
                  <li key={d.id}>
                    <Link href={`/expenses/${d.id}/edit`} className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline min-h-11 items-center">
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{d.merchant || t("unknown_merchant_fallback")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {sessionDrafts.length > 0 && (
              <Link href="/expenses" className="inline-block mt-2 text-xs font-medium text-muted hover:text-foreground">
                {tc("view_all")}
              </Link>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
