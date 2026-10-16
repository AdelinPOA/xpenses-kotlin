"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import {
  captureReceipt,
  resumeReceiptCapture,
  isReceiptCaptureCancelled,
  ScanTimeoutError,
  ScanJobError,
} from "@/lib/receiptCapture";
import type { ScanProgress } from "@/lib/receiptCapture";
import {
  claimOcrSource,
  enqueueOcrSource,
  listOcrSources,
  releaseOcrSource,
  removeOcrSource,
  setOcrSourceJob,
  getStoredOcrSourceLease,
  storeOcrSourceLease,
  clearOcrSourceLease,
  startOcrSourceLeaseHeartbeat,
  type PendingOcrSource,
} from "@/lib/ocrSourceQueue";
import { triggerHaptic } from "@/lib/haptics";
import { isRetryableFailure } from "@/lib/networkErrors";
import { formatEur } from "@/lib/format";
import ReceiptLightbox from "@/components/expenses/ReceiptLightbox";
import {
  Camera,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Loader2,
  Maximize2,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface CapturedItem {
  id: string;
  file: File;
  previewUrl: string;
  status:
    | "saving"
    | "queued"
    | "uploading"
    | "reading"
    | "ready"
    | "needs_details"
    | "failed";
  progressPhase?: string;
  progressSeconds?: number;
  expenseId?: number;
  merchant?: string | null;
  amountEur?: number | null;
  errorMessage?: string;
  createdAt: number;
}

function fileFromOcrSource(source: PendingOcrSource): File {
  return new File([source.data], source.name, {
    type: source.type || "application/octet-stream",
    lastModified: source.createdAt,
  });
}

function isRetryableCaptureError(error: unknown): boolean {
  if (error instanceof ScanJobError) return false;
  if (error instanceof ScanTimeoutError) return true;
  return isRetryableFailure(error);
}

export default function CapturePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useTranslations("expenses");
  const tc = useTranslations("capture");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [sessionItems, setSessionItems] = useState<CapturedItem[]>([]);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  const scanControllersRef = useRef<Map<string, AbortController>>(new Map());
  const sourceLeasesRef = useRef<Map<string, PendingOcrSource>>(new Map());
  const cancelledItemsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scanControllersRef.current.forEach((controller) => controller.abort());
      scanControllersRef.current.clear();
      sourceLeasesRef.current.forEach((source) => {
        void releaseOcrSource(source)
          .then(() => clearOcrSourceLease(source.id))
          .catch(() => undefined);
      });
      sourceLeasesRef.current.clear();
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  const updateItem = useCallback(
    (id: string, updates: Partial<CapturedItem>) => {
      if (!mountedRef.current) return;
      setSessionItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
    },
    [],
  );

  const releaseObjectUrl = useCallback((clientItemId: string) => {
    const url = objectUrlsRef.current.get(clientItemId);
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(clientItemId);
  }, []);

  const discardCapturedFile = useCallback(
    (clientItemId: string) => {
      const source = sourceLeasesRef.current.get(clientItemId);
      void removeOcrSource(clientItemId, user?.id, source?.leaseToken).catch(
        (error) => console.warn("Could not remove cancelled OCR source", error),
      );
      clearOcrSourceLease(clientItemId);
      sourceLeasesRef.current.delete(clientItemId);
      releaseObjectUrl(clientItemId);
      if (mountedRef.current) {
        setSessionItems((prev) =>
          prev.filter((item) => item.id !== clientItemId),
        );
      }
    },
    [releaseObjectUrl, user?.id],
  );

  const cancelCapturedFile = useCallback(
    (clientItemId: string) => {
      cancelledItemsRef.current.add(clientItemId);
      scanControllersRef.current.get(clientItemId)?.abort();
      discardCapturedFile(clientItemId);
    },
    [discardCapturedFile],
  );

  const processCapturedFile = useCallback(
    async (clientItemId: string, file: File) => {
      if (
        !mountedRef.current ||
        !user?.id ||
        cancelledItemsRef.current.has(clientItemId)
      )
        return;
      if (scanControllersRef.current.has(clientItemId)) return;
      if (!navigator.onLine) {
        updateItem(clientItemId, { status: "queued" });
        return;
      }

      let claimed: PendingOcrSource | null;
      try {
        claimed = await claimOcrSource(
          clientItemId,
          user.id,
          Date.now(),
          getStoredOcrSourceLease(clientItemId),
        );
      } catch {
        updateItem(clientItemId, { status: "queued" });
        return;
      }
      if (!claimed) return;
      if (cancelledItemsRef.current.has(clientItemId)) {
        await removeOcrSource(clientItemId, user.id, claimed.leaseToken).catch(
          () => undefined,
        );
        return;
      }
      if (!mountedRef.current) {
        storeOcrSourceLease(clientItemId, claimed.leaseToken);
        try {
          await releaseOcrSource(claimed);
          clearOcrSourceLease(clientItemId);
        } catch {
          // Keep the session lease token so a reload can reclaim this source.
        }
        return;
      }

      const controller = new AbortController();
      scanControllersRef.current.set(clientItemId, controller);
      sourceLeasesRef.current.set(clientItemId, claimed);
      storeOcrSourceLease(clientItemId, claimed.leaseToken);
      updateItem(clientItemId, { status: "uploading" });

      let stopLeaseHeartbeat = () => {};
      try {
        const sourceForJob = claimed;
        let leaseLost = false;
        stopLeaseHeartbeat = startOcrSourceLeaseHeartbeat(
          sourceForJob,
          (renewed) => {
            claimed = renewed;
            sourceLeasesRef.current.set(clientItemId, renewed);
          },
          () => {
            leaseLost = true;
            controller.abort();
          },
        );
        const scanOptions = {
          signal: controller.signal,
          onProgress: (p: ScanProgress) => {
            updateItem(clientItemId, {
              status: p.phase === "uploading" ? "uploading" : "reading",
              progressPhase: p.phase,
              progressSeconds: p.elapsedSeconds,
            });
          },
          cancelRemoteJobOnAbort: () => mountedRef.current && !leaseLost,
        };
        const capture =
          sourceForJob.remoteJobId != null
            ? await resumeReceiptCapture(
                sourceForJob.remoteJobId,
                sourceForJob.statusUrl,
                scanOptions,
              )
            : await captureReceipt(file, {
                ...scanOptions,
                onJobCreated: async ({ jobId, statusUrl }) => {
                  const updated = await setOcrSourceJob(
                    sourceForJob,
                    jobId,
                    statusUrl,
                  );
                  if (updated) {
                    claimed = updated;
                    sourceLeasesRef.current.set(clientItemId, updated);
                  }
                },
              });
        if (cancelledItemsRef.current.has(clientItemId)) return;

        await removeOcrSource(clientItemId, user.id, claimed.leaseToken);
        clearOcrSourceLease(clientItemId);
        sourceLeasesRef.current.delete(clientItemId);
        if (!mountedRef.current) return;

        const scanned = capture.result;
        qc.invalidateQueries({ queryKey: expenseKeys.all });
        qc.invalidateQueries({ queryKey: dashboardKeys.all });

        updateItem(clientItemId, {
          status: capture.needsDetails ? "needs_details" : "ready",
          expenseId: capture.expenseId,
          merchant: scanned.merchant,
          amountEur: scanned.amount,
          errorMessage: capture.needsDetails
            ? tc("draft_needs_details_toast")
            : undefined,
        });
        toast[capture.needsDetails ? "warning" : "success"](
          tc(
            capture.needsDetails
              ? "draft_needs_details_toast"
              : "draft_saved_toast",
          ),
        );
      } catch (error: unknown) {
        if (isReceiptCaptureCancelled(error)) {
          if (cancelledItemsRef.current.has(clientItemId)) {
            void removeOcrSource(
              clientItemId,
              user.id,
              claimed.leaseToken,
            ).catch(() => undefined);
          } else {
            void releaseOcrSource(claimed)
              .then(() => clearOcrSourceLease(clientItemId))
              .catch(() => undefined);
          }
          return;
        }

        if (isRetryableCaptureError(error)) {
          try {
            await releaseOcrSource(claimed);
            clearOcrSourceLease(clientItemId);
          } catch {
            // Keep the session lease token so a reload can reclaim this source.
          }
          updateItem(clientItemId, {
            status: "queued",
            errorMessage:
              error instanceof ScanTimeoutError
                ? t("error_ocr_timeout")
                : undefined,
          });
          return;
        }

        try {
          await removeOcrSource(clientItemId, user.id, claimed.leaseToken);
          clearOcrSourceLease(clientItemId);
        } catch {
          // Keep the source for a later cleanup attempt.
        }
        const message =
          error instanceof ScanJobError
            ? t("error_ocr_job")
            : t("error_ocr_scan");
        console.warn("OCR background scan warning", error);
        updateItem(clientItemId, {
          status: "failed",
          errorMessage: message,
        });
      } finally {
        stopLeaseHeartbeat();
        scanControllersRef.current.delete(clientItemId);
        sourceLeasesRef.current.delete(clientItemId);
      }
    },
    [qc, t, tc, toast, updateItem, user?.id],
  );

  const restorePendingSources = useCallback(async () => {
    if (!user?.id) return;
    let sources: PendingOcrSource[];
    try {
      sources = await listOcrSources(user.id);
    } catch {
      return;
    }
    if (!mountedRef.current) return;

    setSessionItems((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const restored = sources
        .filter((source) => !existingIds.has(source.id))
        .map((source) => {
          const file = fileFromOcrSource(source);
          const previewUrl = URL.createObjectURL(file);
          objectUrlsRef.current.set(source.id, previewUrl);
          return {
            id: source.id,
            file,
            previewUrl,
            status: "queued" as const,
            createdAt: source.createdAt,
          };
        });
      return restored.length > 0 ? [...restored, ...prev] : prev;
    });

    if (navigator.onLine) {
      sources.forEach((source) => {
        void processCapturedFile(source.id, fileFromOcrSource(source));
      });
    }
  }, [processCapturedFile, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const restore = () => void restorePendingSources();
    void restorePendingSources();
    window.addEventListener("online", restore);
    document.addEventListener("visibilitychange", restore);
    return () => {
      window.removeEventListener("online", restore);
      document.removeEventListener("visibilitychange", restore);
    };
  }, [restorePendingSources, user?.id]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!user?.id) {
      toast.error(t("error_save"));
      return;
    }

    triggerHaptic(15);

    const clientItemId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.set(clientItemId, previewUrl);

    const newItem: CapturedItem = {
      id: clientItemId,
      file,
      previewUrl,
      status: "saving",
      createdAt: Date.now(),
    };

    setSessionItems((prev) => [newItem, ...prev]);

    try {
      await enqueueOcrSource({
        id: clientItemId,
        userId: user.id,
        context: "batch",
        name: file.name,
        type: file.type,
        data: await file.arrayBuffer(),
      });
      if (cancelledItemsRef.current.has(clientItemId)) {
        await removeOcrSource(clientItemId, user.id);
        return;
      }
      if (!mountedRef.current) return;
      if (navigator.onLine) {
        void processCapturedFile(clientItemId, file);
      } else {
        updateItem(clientItemId, { status: "queued" });
      }
    } catch (error) {
      releaseObjectUrl(clientItemId);
      if (mountedRef.current) {
        setSessionItems((prev) =>
          prev.filter((item) => item.id !== clientItemId),
        );
      }
      console.warn("Could not persist OCR source", error);
      if (mountedRef.current) toast.error(t("error_ocr_queue"));
    }
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
            <h1 className="text-xl sm:text-2xl font-black text-foreground">
              {tc("title")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tc("subtitle")}
            </p>
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
                {sessionItems.filter(
                  (i) =>
                    i.status === "saving" ||
                    i.status === "uploading" ||
                    i.status === "reading",
                ).length > 0
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
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setLightboxImage({
                        url: item.previewUrl,
                        title: item.merchant || "Receipt",
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setLightboxImage({
                          url: item.previewUrl,
                          title: item.merchant || "Receipt",
                        });
                      }
                    }}
                    aria-label={`${t("view_receipt")}: ${item.merchant || item.file.name}`}
                    className="relative w-14 h-14 rounded-xl overflow-hidden bg-muted/20 border border-border shrink-0 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                      {item.merchant ||
                        (item.status === "ready"
                          ? t("unknown_merchant_fallback")
                          : item.file.name)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {item.status === "saving" && (
                        <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          {tc("status_saving")}
                        </span>
                      )}
                      {item.status === "queued" && (
                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          {tc("status_waiting")}
                        </span>
                      )}
                      {item.status === "uploading" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          <Loader2
                            className="w-3 h-3 animate-spin"
                            aria-hidden="true"
                          />
                          {t("scan_uploading")}
                        </span>
                      )}
                      {item.status === "reading" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          <Loader2
                            className="w-3 h-3 animate-spin"
                            aria-hidden="true"
                          />
                          {t("scan_reading", {
                            seconds: item.progressSeconds ?? 0,
                          })}
                        </span>
                      )}
                      {item.status === "ready" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          {tc("status_ready")}{" "}
                          {item.amountEur
                            ? `· ${formatEur(item.amountEur)}`
                            : ""}
                        </span>
                      )}
                      {item.status === "needs_details" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          <AlertTriangle
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
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
                    {item.errorMessage && (
                      <p
                        data-capture-error
                        role="status"
                        className="mt-1 text-xs text-rose-600 dark:text-rose-400"
                      >
                        {item.errorMessage}
                      </p>
                    )}
                  </div>

                  {(item.status === "saving" ||
                    item.status === "uploading" ||
                    item.status === "reading") && (
                    <button
                      type="button"
                      onClick={() => cancelCapturedFile(item.id)}
                      className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-muted hover:text-red-500 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`${t("scan_cancel")}: ${item.file.name}`}
                    >
                      <XCircle className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}

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
