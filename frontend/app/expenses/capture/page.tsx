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
  isReceiptCaptureCancelled,
  ScanTimeoutError,
  ScanJobError,
  ScanUploadError,
  ScanAcceptancePersistenceError,
} from "@/lib/receiptCapture";
import type { ScanProgress } from "@/lib/receiptCapture";
import {
  acknowledgeOcrSource,
  claimOcrSource,
  enqueueOcrSource,
  listOcrSources,
  markOcrSourceUpload,
  releaseOcrSource,
  removeOcrSource,
  renewOcrSource,
  type PendingOcrSource,
} from "@/lib/ocrSourceQueue";
import { triggerHaptic } from "@/lib/haptics";
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
  remoteJobId?: number;
  uploadState?: PendingOcrSource["uploadState"];
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
  if (error instanceof ScanTimeoutError || error instanceof ScanJobError || error instanceof ScanAcceptancePersistenceError) {
    return false;
  }
  if (!navigator.onLine) return true;
  if (typeof error !== "object" || error === null) return false;
  if ("response" in error) {
    return !(error as { response?: unknown }).response;
  }
  if ("code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "ERR_NETWORK" || code === "ECONNABORTED") return true;
  }
  return error instanceof Error && /network|fetch/i.test(error.message);
}

export default function CapturePage() {
  const { user } = useAuth();
  // An account change must drop the old owner's thumbnails, callbacks and
  // observation state even when the router keeps this page mounted.
  return <CaptureSession key={user?.id ?? "signed-out"} />;
}

function CaptureSession() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useTranslations("expenses");
  const tc = useTranslations("capture");
  const to = useTranslations("offline");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [sessionItems, setSessionItems] = useState<CapturedItem[]>([]);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  const scanControllersRef = useRef<Map<string, AbortController>>(new Map());
  const sourceLeasesRef = useRef<Map<string, PendingOcrSource>>(new Map());
  const cancelledItemsRef = useRef<Set<string>>(new Set());
  const failedSourcesRef = useRef<Set<string>>(new Set());
  // Same-owner session fallback if the acceptance IndexedDB commit fails. Never
  // overwrite this identity with an older local record that has no job ID.
  const acceptedJobsRef = useRef<Map<string, number>>(new Map());
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
      // The async operation releases its claim after its acceptance callback
      // finishes. Releasing here can race the IndexedDB commit of the job ID.
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
      if (!user?.id || cancelledItemsRef.current.has(clientItemId)) return;
      if (scanControllersRef.current.has(clientItemId)) return;
      if (!navigator.onLine) {
        updateItem(clientItemId, { status: "queued" });
        return;
      }

      let claimed: PendingOcrSource | null;
      try {
        claimed = await claimOcrSource(clientItemId, user.id);
      } catch {
        updateItem(clientItemId, { status: "queued" });
        return;
      }
      if (!claimed) return;
      if (!mountedRef.current) {
        await releaseOcrSource(claimed).catch(() => undefined);
        return;
      }
      if (cancelledItemsRef.current.has(clientItemId)) {
        await removeOcrSource(clientItemId, user.id, claimed.leaseToken).catch(
          () => undefined,
        );
        return;
      }

      claimed.remoteJobId ??= acceptedJobsRef.current.get(clientItemId);
      if (!claimed.remoteJobId && (claimed.uploadState === "uploading" || claimed.uploadState === "uncertain")) {
        failedSourcesRef.current.add(clientItemId);
        await releaseOcrSource(claimed).catch(() => undefined);
        updateItem(clientItemId, { status: "failed", uploadState: "uncertain", errorMessage: tc("upload_uncertain") });
        return;
      }
      failedSourcesRef.current.delete(clientItemId);
      const controller = new AbortController();
      scanControllersRef.current.set(clientItemId, controller);
      sourceLeasesRef.current.set(clientItemId, claimed);
      updateItem(clientItemId, {
        status: claimed.remoteJobId ? "reading" : "uploading",
        remoteJobId: claimed.remoteJobId,
        uploadState: claimed.uploadState,
        errorMessage: undefined,
      });
      const heartbeat = setInterval(() => {
        void renewOcrSource(claimed).catch(() => controller.abort());
      }, 10_000);

      try {
        const capture = await captureReceipt(file, {
          signal: controller.signal,
          resumeJobId: claimed.remoteJobId,
          onUploading: async () => {
            await markOcrSourceUpload(claimed, "uploading");
            claimed.uploadState = "uploading";
            updateItem(clientItemId, { uploadState: "uploading" });
          },
          onAccepted: async (jobId) => {
            // Preserve the received identity BEFORE a fallible local write. A
            // later claim can return an older record lacking this accepted ID.
            acceptedJobsRef.current.set(clientItemId, jobId);
            claimed.remoteJobId = jobId;
            updateItem(clientItemId, { remoteJobId: jobId });
            await acknowledgeOcrSource(claimed, jobId);
            claimed.uploadState = undefined;
            updateItem(clientItemId, { uploadState: undefined });
          },
          onProgress: (p: ScanProgress) => {
            updateItem(clientItemId, {
              status: p.phase === "uploading" ? "uploading" : "reading",
              progressPhase: p.phase,
              progressSeconds: p.elapsedSeconds,
            });
          },
        });
        if (cancelledItemsRef.current.has(clientItemId)) return;

        await removeOcrSource(clientItemId, user.id, claimed.leaseToken);
        sourceLeasesRef.current.delete(clientItemId);
        acceptedJobsRef.current.delete(clientItemId);

        const scanned = capture.result;
        qc.invalidateQueries({ queryKey: expenseKeys.all });
        qc.invalidateQueries({ queryKey: dashboardKeys.all });

        updateItem(clientItemId, {
          status: capture.needsDetails ? "needs_details" : "ready",
          expenseId: capture.expenseId,
          merchant: scanned.merchant,
          amountEur: scanned.amount,
          errorMessage: scanned.error_code ?? undefined,
        });
        if (mountedRef.current) {
          toast[capture.needsDetails ? "warning" : "success"](
            tc(
              capture.needsDetails
                ? "draft_needs_details_toast"
                : "draft_saved_toast",
            ),
          );
        }
      } catch (err: any) {
        if (isReceiptCaptureCancelled(err)) {
          if (cancelledItemsRef.current.has(clientItemId)) {
            void removeOcrSource(
              clientItemId,
              user.id,
              claimed.leaseToken,
            ).catch(() => undefined);
          } else {
            void releaseOcrSource(claimed).catch(() => undefined);
            const uncertain = !claimed.remoteJobId && Boolean(claimed.uploadState);
            updateItem(clientItemId, {
              status: uncertain ? "failed" : "queued",
              remoteJobId: claimed.remoteJobId,
              uploadState: uncertain ? "uncertain" : claimed.uploadState,
              errorMessage: uncertain ? tc("upload_uncertain") : undefined,
            });
          }
          return;
        }

        if (err instanceof ScanUploadError) {
          claimed.uploadState = err.definitelyRejected ? "rejected" : "uncertain";
          // If this write fails, the already-committed uploading marker remains
          // conservative on reload. Never turn an ambiguous POST into new work.
          await markOcrSourceUpload(claimed, claimed.uploadState).catch(() => undefined);
        }

        if (claimed.remoteJobId && isRetryableCaptureError(err)) {
          await releaseOcrSource(claimed).catch(() => undefined);
          updateItem(clientItemId, { status: "queued" });
          return;
        }

        // A timeout or permanent provider error is not acknowledgement of a
        // completed Expense/Receipt. Keep the image and accepted job for resume.
        await releaseOcrSource(claimed).catch(() => undefined);
        const message =
          err instanceof ScanUploadError && !err.definitelyRejected
            ? tc("upload_uncertain")
            : err instanceof ScanAcceptancePersistenceError
              ? tc("acceptance_not_persisted", { jobId: err.remoteJobId })
              : err instanceof ScanUploadError
                ? ((err.originalError as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t("error_save"))
                : err instanceof ScanTimeoutError
                  ? t("error_ocr_timeout")
                  : err instanceof ScanJobError
                    ? (err.detail ?? t("error_ocr_job"))
                    : (err?.response?.data?.detail ?? err?.message ?? t("error_save"));
        if (
          !(err instanceof ScanTimeoutError) &&
          !(err instanceof ScanJobError)
        ) {
          console.warn("OCR background scan warning", err);
        }
        failedSourcesRef.current.add(clientItemId);
        updateItem(clientItemId, {
          status: "failed",
          errorMessage: message,
          remoteJobId: claimed.remoteJobId,
          uploadState: claimed.uploadState,
        });
        if (mountedRef.current) toast.error(message);
      } finally {
        clearInterval(heartbeat);
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
            status: source.uploadState && !source.remoteJobId ? "failed" as const : "queued" as const,
            remoteJobId: source.remoteJobId ?? acceptedJobsRef.current.get(source.id),
            uploadState: source.uploadState,
            errorMessage: source.uploadState && source.uploadState !== "rejected" && !source.remoteJobId ? tc("upload_uncertain") : undefined,
            createdAt: source.createdAt,
          };
        });
      return restored.length > 0 ? [...restored, ...prev] : prev;
    });

    if (navigator.onLine) {
      sources.forEach((source) => {
        if (!failedSourcesRef.current.has(source.id) && (source.remoteJobId || !source.uploadState)) {
          void processCapturedFile(source.id, fileFromOcrSource(source));
        }
      });
    }
  }, [processCapturedFile, tc, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const restore = () => void restorePendingSources();
    void restorePendingSources();
    window.addEventListener("online", restore);
    document.addEventListener("visibilitychange", restore);
    // Pick up claims released by another tab/unmount, not only network changes.
    const resumeTimer = setInterval(restore, 15_000);
    return () => {
      clearInterval(resumeTimer);
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
        name: file.name,
        type: file.type,
        data: await file.arrayBuffer(),
      });
      if (cancelledItemsRef.current.has(clientItemId)) {
        await removeOcrSource(clientItemId, user.id);
        return;
      }
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
      toast.error(error instanceof Error ? error.message : t("error_save"));
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
                  </div>

                  {item.errorMessage && (
                    <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 break-words">
                      {item.errorMessage}
                    </p>
                  )}

                  {/* Once upload starts, leaving only stops observation. Do not
                      offer a destructive local discard for accepted server work. */}
                  {item.status === "failed" && (item.remoteJobId || !item.uploadState || item.uploadState === "rejected") && (
                    <button
                      type="button"
                      onClick={() => void processCapturedFile(item.id, item.file)}
                      className="min-h-11 px-3 text-xs font-bold text-primary rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {to("retry")}
                    </button>
                  )}

                  {item.status === "failed" && !item.remoteJobId && item.uploadState && item.uploadState !== "rejected" && (
                    <Link href="/expenses" className="min-h-11 px-3 text-xs font-bold text-primary underline">{tc("view_all")}</Link>
                  )}

                  {(item.status === "saving" || ((item.status === "queued" || item.status === "failed") && !item.remoteJobId && (!item.uploadState || item.uploadState === "rejected"))) && (
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
