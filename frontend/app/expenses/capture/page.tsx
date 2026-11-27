"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import api, { CURRENCIES, type Expense } from "@/lib/api";
import { expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import {
  captureReceipt,
  isReceiptCaptureCancelled,
  ScanAcceptancePersistenceError,
  ScanJobError,
  ScanTimeoutError,
  ScanUploadError,
} from "@/lib/receiptCapture";
import type { ScanProgress } from "@/lib/receiptCapture";
import {
  acknowledgeOcrSource,
  claimOcrSource,
  createRecoveredOcrReview,
  enqueueOcrSource,
  discardUnacceptedOcrSource,
  listOcrSources,
  markOcrSourceUpload,
  persistOcrReviewState,
  releaseOcrSource,
  removeOcrSource,
  renewOcrSource,
  type OcrReviewFormValues,
  type PendingOcrJobActionOperation,
  type PendingOcrSource,
} from "@/lib/ocrSourceQueue";
import {
  completeOcrJobManually,
  listRecoverableOcrJobs,
  retryOcrJob,
  type OcrJobRecovery,
} from "@/lib/ocrRecovery";
import { triggerHaptic } from "@/lib/haptics";
import { Camera, FileText, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

const CAPTURE_REVIEW_ENABLED =
  process.env.NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED === "true";

interface ManualValues {
  amount: string;
  currency: string;
  date: string;
  merchant: string;
  description: string;
}

const emptyManualValues = (): ManualValues => ({
  amount: "",
  currency: "EUR",
  date: new Date().toISOString().slice(0, 10),
  merchant: "",
  description: "",
});

function fileFromSource(source: PendingOcrSource): File {
  return new File([source.data ?? new ArrayBuffer(0)], source.name, {
    type: source.type || "application/octet-stream",
    lastModified: source.createdAt,
  });
}

function localManualValues(values?: OcrReviewFormValues): ManualValues {
  if (!values) return emptyManualValues();
  return {
    amount: values.amount,
    currency: values.currency || "EUR",
    date: values.date || new Date().toISOString().slice(0, 10),
    merchant: values.merchant,
    description: values.description,
  };
}

function toStoredManualValues(values: ManualValues): OcrReviewFormValues {
  return {
    amount: values.amount,
    currency: values.currency,
    date: values.date,
    merchant: values.merchant,
    description: values.description,
    categoryId: "",
    taxAmount: "0",
    taxRate: "",
    manualFxRate: "",
    fxRateEditMode: false,
  };
}

function makeManualRequest(values: ManualValues, translate: (key: string) => string) {
  const amount = Number(values.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(translate("manual_amount_required"));
  }
  if (!values.date) throw new Error(translate("manual_date_required"));
  return {
    values: {
      amount,
      currency: values.currency || "EUR",
      date: values.date,
      ...(values.merchant.trim() ? { merchant: values.merchant.trim() } : {}),
      ...(values.description.trim()
        ? { description: values.description.trim() }
        : {}),
    },
  };
}

export default function CapturePage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const rawReportId = Number(searchParams.get("reportId"));
  const reportId = Number.isSafeInteger(rawReportId) && rawReportId > 0
    ? rawReportId
    : undefined;
  return CAPTURE_REVIEW_ENABLED ? (
    <CaptureSession
      key={`${user?.id ?? "signed-out"}:${reportId ?? "no-report"}`}
      reportId={reportId}
    />
  ) : <CaptureDisabled reportId={reportId} />;
}

function CaptureDisabled({ reportId }: { reportId?: number }) {
  const tc = useTranslations("capture");
  return (
    <AppShell>
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-bold text-foreground">{tc("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tc("feature_disabled")}</p>
        <Link className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white" href={reportId ? `/expenses/new?mode=manual&reportId=${reportId}` : "/expenses/new?mode=manual"}>
          {tc("manual_entry")}
        </Link>
      </div>
    </AppShell>
  );
}

function CaptureSession({ reportId }: { reportId?: number }) {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useTranslations("expenses");
  const tc = useTranslations("capture");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef<Set<string>>(new Set());
  const failedSourceIdsRef = useRef<Set<string>>(new Set());
  const processSourceRef = useRef<((source: PendingOcrSource) => Promise<void>) | null>(null);
  const acceptedJobsRef = useRef<Map<string, number>>(new Map());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const mountedRef = useRef(true);
  const [sources, setSources] = useState<PendingOcrSource[]>([]);
  const [jobs, setJobs] = useState<OcrJobRecovery[]>([]);
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [manualJob, setManualJob] = useState<OcrJobRecovery | null>(null);
  const [manualSource, setManualSource] = useState<PendingOcrSource | null>(null);
  const [manualValues, setManualValues] = useState<ManualValues>(emptyManualValues);
  const [manualError, setManualError] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!manualSource || !user?.id) return;
    const values = toStoredManualValues(manualValues);
    if (JSON.stringify(manualSource.reviewValues) === JSON.stringify(values)) return;
    const timer = setTimeout(() => {
      void persistOcrReviewState(manualSource.id, user.id, {
        reviewValues: values,
        reviewSyncState: manualSource.reviewSyncState === "uncertain" ? "uncertain" : "local-only",
      }).then(setManualSource).catch(() => setManualError(tc("local_save_failed")));
    }, 200);
    return () => clearTimeout(timer);
  }, [manualSource?.id, manualSource?.reviewSyncState, manualSource?.reviewValues, manualValues, tc, user?.id]);

  const refreshRecovery = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    const serverJobs: OcrJobRecovery[] = [];
    try {
      const remoteJobs = navigator.onLine
        ? await listRecoverableOcrJobs()
        : [];
      const localSources = await listOcrSources(user.id);
      const expenses = new Map<number, Expense>();
      for (const expenseId of new Set([
        ...remoteJobs.map((job) => job.expense_id),
        ...localSources.map((source) => source.expenseId),
      ])) {
        if (!expenseId || !navigator.onLine) continue;
        try {
          expenses.set(expenseId, await api.get<Expense>(`/expenses/${expenseId}`).then((response) => response.data));
        } catch {
          // An unavailable Expense never authorizes discarding local work.
        }
      }
      for (const job of remoteJobs) {
        const expense = job.expense_id ? expenses.get(job.expense_id) : undefined;
        const active = ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(job.status);
        const recoverable = job.allowed_actions.some((action) => action === "retry" || action === "complete_manually");
        if (expense?.verification_state !== "PENDING" && !active && !recoverable) continue;
        serverJobs.push(job);
        await createRecoveredOcrReview({
          userId: user.id,
          remoteJobId: job.job_id,
          expenseId: job.expense_id ?? undefined,
          receiptId: job.receipt_id ?? undefined,
          expenseVersion: expense?.version,
          reportId: job.report_id ?? undefined,
          reportLinkStatus: job.report_link_status,
        }).catch(() => undefined);
      }
      let refreshedSources = await listOcrSources(user.id);
      for (const source of refreshedSources) {
        const expense = source.expenseId ? expenses.get(source.expenseId) : undefined;
        const unsynced = source.reviewSyncState && source.reviewSyncState !== "server-saved";
        const job = remoteJobs.find((item) => item.job_id === source.remoteJobId);
        const obsoleteJob = source.data === null && !source.expenseId && job && !serverJobs.includes(job);
        if (!unsynced && !source.reviewOperation &&
          (expense?.verification_state === "VERIFIED" || expense?.verification_state === "NOT_REQUIRED" || obsoleteJob)) {
          await removeOcrSource(source.id, user.id, undefined, source.updatedAt);
        }
      }
      refreshedSources = await listOcrSources(user.id);
      if (!mountedRef.current) return;
      setSources(refreshedSources);
      setJobs(serverJobs);
      // Accepted OCR jobs continue from their existing server identity. A
      // pending review is surfaced as a resume action instead of recaptured.
      if (navigator.onLine) {
        for (const source of refreshedSources) {
          if (
            !source.expenseId && source.uploadState !== "rejected" &&
            !inFlightRef.current.has(source.id) &&
            !failedSourceIdsRef.current.has(source.id) &&
            (!source.remoteJobId || serverJobs.some((job) => job.job_id === source.remoteJobId && ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(job.status))) &&
            (source.remoteJobId || source.data)
          ) {
            void processSourceRef.current?.(source);
          }
        }
      }
    } catch {
      try {
        const localSources = await listOcrSources(user.id);
        if (mountedRef.current) setSources(localSources);
      } catch {
        // IndexedDB may be unavailable; the server recovery list remains a
        // separate source of truth on the next explicit refresh.
      }
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [user?.id]);

  const processSource = useCallback(
    async (source: PendingOcrSource) => {
      if (!user?.id || !navigator.onLine || inFlightRef.current.has(source.id)) return;
      inFlightRef.current.add(source.id);
      setCurrentSourceId(source.id);
      setError("");
      let claim: PendingOcrSource | null = null;
      try {
        claim = await claimOcrSource(source.id, user.id);
        if (!claim) return;
        claim.remoteJobId ??= acceptedJobsRef.current.get(source.id);
        const controller = new AbortController();
        controllersRef.current.set(source.id, controller);
        const heartbeat = setInterval(() => {
          if (claim) void renewOcrSource(claim).catch(() => controller.abort());
        }, 10_000);
        try {
          const result = await captureReceipt(fileFromSource(claim), {
            signal: controller.signal,
            resumeJobId: claim.remoteJobId,
            idempotencyKey: claim.id,
            reportId: claim.reportId,
            onUploading: async () => {
              await markOcrSourceUpload(claim!, "uploading");
              claim!.uploadState = "uploading";
            },
            onAccepted: async (jobId) => {
              acceptedJobsRef.current.set(source.id, jobId);
              claim!.remoteJobId = jobId;
              await acknowledgeOcrSource(claim!, jobId);
              claim!.uploadState = undefined;
            },
            onProgress: setProgress,
          });
          const expense = await api
            .get<Expense>(`/expenses/${result.expenseId}`)
            .then((response) => response.data);
          if (expense.verification_state !== "PENDING") {
            throw new Error("The OCR Expense is not available for immediate review.");
          }
          if (typeof expense.version !== "number" || !Number.isSafeInteger(expense.version) || expense.version < 0) {
            throw new Error("The saved Expense version is unavailable for review.");
          }
          failedSourceIdsRef.current.delete(source.id);
          const saved = await persistOcrReviewState(source.id, user.id, {
            expenseId: expense.id,
            receiptId: result.receiptId,
            expenseVersion: expense.version,
            reportId: claim.reportId,
            reportLinkStatus: expense.report_id === claim.reportId ? "LINKED" : claim.reportId ? "CONFLICT" : "NOT_REQUESTED",
            reviewValues: {
              amount: String(expense.amount_original),
              currency: expense.currency_original,
              date: expense.date,
              merchant: expense.merchant ?? "",
              description: expense.description ?? "",
              categoryId: expense.category_id?.toString() ?? "",
              taxAmount: String(expense.tax_amount ?? 0),
              taxRate: expense.tax_rate?.toString() ?? "",
              manualFxRate: "",
              fxRateEditMode: false,
            },
            reviewSyncState: "server-saved",
            reviewError: undefined,
          });
          await releaseOcrSource(claim).catch(() => undefined);
          acceptedJobsRef.current.delete(source.id);
          qc.invalidateQueries({ queryKey: expenseKeys.all });
          qc.invalidateQueries({ queryKey: dashboardKeys.all });
          if (mountedRef.current) {
            const query = new URLSearchParams({ ocr_source_id: saved.id });
            router.push(`/expenses/${expense.id}/edit?${query.toString()}`);
          }
        } finally {
          clearInterval(heartbeat);
          controllersRef.current.delete(source.id);
        }
      } catch (captureError) {
        if (claim) {
          if (captureError instanceof ScanUploadError) {
            claim.uploadState = captureError.definitelyRejected ? "rejected" : "uncertain";
            await markOcrSourceUpload(claim, claim.uploadState).catch(() => undefined);
          }
          await releaseOcrSource(claim).catch(() => undefined);
        }
        if (isReceiptCaptureCancelled(captureError) && !mountedRef.current) return;
        if (navigator.onLine) failedSourceIdsRef.current.add(source.id);
        const message =
          captureError instanceof ScanAcceptancePersistenceError
            ? tc("acceptance_not_persisted", { jobId: captureError.remoteJobId })
            : captureError instanceof ScanTimeoutError
              ? t("error_ocr_timeout")
              : captureError instanceof ScanJobError
                ? captureError.detail ?? t("error_ocr_job")
                : (captureError as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ??
                  (captureError as Error)?.message ?? t("error_save");
        if (mountedRef.current) setError(message);
      } finally {
        inFlightRef.current.delete(source.id);
        if (mountedRef.current) {
          setProgress(null);
          void refreshRecovery();
        }
      }
    },
    [qc, refreshRecovery, router, t, tc, user?.id],
  );
  processSourceRef.current = processSource;

  useEffect(() => {
    if (!user?.id) return;
    void refreshRecovery();
    const resume = () => void refreshRecovery();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    const timer = setInterval(resume, 20_000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refreshRecovery, user?.id]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!user?.id) {
      toast.error(t("error_save"));
      return;
    }
    if (sources.some((source) => source.expenseId)) {
      setError(tc("finish_review_first"));
      return;
    }
    if (sources.some((source) => !source.expenseId)) {
      setError(tc("finish_capture_first"));
      return;
    }
    triggerHaptic(15);
    setError("");
    setCurrentSourceId(null);
    try {
      const id = crypto.randomUUID();
      const source = await enqueueOcrSource({
        id,
        userId: user.id,
        name: file.name,
        type: file.type,
        data: await file.arrayBuffer(),
        reportId,
      });
      setSources((previous) => [source, ...previous]);
      if (!navigator.onLine) {
        setCurrentSourceId(source.id);
        return;
      }
      void processSource(source);
    } catch (queueError) {
      toast.error(queueError instanceof Error ? queueError.message : t("error_save"));
    }
  };

  const openManualCompletion = async (job: OcrJobRecovery) => {
    if (!user?.id) return;
    let source = sources.find((item) => item.remoteJobId === job.job_id);
    if (!source) {
      source = await createRecoveredOcrReview({
        userId: user.id,
        remoteJobId: job.job_id,
        expenseId: job.expense_id ?? undefined,
        receiptId: job.receipt_id ?? undefined,
        reportId: job.report_id ?? undefined,
        reportLinkStatus: job.report_link_status,
      });
    }
    setManualSource(source);
    setManualJob(job);
    setManualValues(localManualValues(source.reviewValues));
    setManualError("");
  };

  const submitManualCompletion = async () => {
    if (!user?.id || !manualJob || !manualSource) return;
    if (!navigator.onLine) {
      setManualError(tc("manual_online_required"));
      return;
    }
    let body: { values?: ReturnType<typeof makeManualRequest>["values"] };
    try {
      body = manualJob.expense_id ? {} : makeManualRequest(manualValues, tc);
    } catch (validationError) {
      setManualError((validationError as Error).message);
      return;
    }
    const currentOperation = manualSource.jobActionOperation;
    const sameBody = currentOperation?.action === "complete_manually" &&
      JSON.stringify(currentOperation.body) === JSON.stringify(body);
    const operation: PendingOcrJobActionOperation = sameBody
      ? currentOperation!
      : { action: "complete_manually", key: crypto.randomUUID(), body };
    setManualSaving(true);
    setManualError("");
    try {
      const stored = await persistOcrReviewState(manualSource.id, user.id, {
        reviewValues: toStoredManualValues(manualValues),
        reviewSyncState: "saving",
        jobActionOperation: operation,
        reviewError: undefined,
      });
      setManualSource(stored);
      await completeOcrJobManually(manualJob.job_id, body, operation.key);
      failedSourceIdsRef.current.delete(stored.id);
      const resumed = await persistOcrReviewState(stored.id, user.id, {
        reviewSyncState: "server-saved",
        jobActionOperation: undefined,
        reviewError: undefined,
      });
      setManualJob(null);
      setManualSource(null);
      void processSource(resumed);
      await refreshRecovery();
    } catch (actionError) {
      const status = (actionError as { response?: { status?: number } })?.response?.status;
      const ambiguous = status === undefined || status >= 500;
      if (!ambiguous) {
        const updated = await persistOcrReviewState(manualSource.id, user.id, {
          reviewSyncState: "error",
          jobActionOperation: undefined,
          reviewError: (actionError as Error).message,
        }).catch(() => null);
        if (updated) setManualSource(updated);
      } else {
        const updated = await persistOcrReviewState(manualSource.id, user.id, {
          reviewSyncState: "uncertain",
          jobActionOperation: operation,
          reviewError: tc("action_uncertain"),
        }).catch(() => null);
        if (updated) setManualSource(updated);
      }
      setManualError(ambiguous ? tc("action_uncertain") : (actionError as Error).message);
    } finally {
      setManualSaving(false);
    }
  };

  const runRetry = async (job: OcrJobRecovery) => {
    if (!user?.id || !navigator.onLine) {
      setError(tc("manual_online_required"));
      return;
    }
    const source = sources.find((item) => item.remoteJobId === job.job_id) ??
      await createRecoveredOcrReview({
        userId: user.id,
        remoteJobId: job.job_id,
        expenseId: job.expense_id ?? undefined,
        receiptId: job.receipt_id ?? undefined,
        reportId: job.report_id ?? undefined,
        reportLinkStatus: job.report_link_status,
      });
    const previous = source.jobActionOperation;
    const operation = previous?.action === "retry"
      ? previous
      : { action: "retry" as const, key: crypto.randomUUID() };
    try {
      const stored = await persistOcrReviewState(source.id, user.id, {
        jobActionOperation: operation,
        reviewSyncState: "saving",
        reviewError: undefined,
      });
      await retryOcrJob(job.job_id, operation.key);
      failedSourceIdsRef.current.delete(stored.id);
      const resumed = await persistOcrReviewState(stored.id, user.id, {
        jobActionOperation: undefined,
        reviewSyncState: "server-saved",
        reviewError: undefined,
      });
      setError("");
      void processSource(resumed);
      await refreshRecovery();
    } catch {
      setError(tc("action_uncertain"));
    }
  };

  const discardLocalSource = async (source: PendingOcrSource) => {
    if (!user?.id || !window.confirm(tc("discard_local_confirm"))) return;
    try {
      await discardUnacceptedOcrSource(source.id, user.id);
      failedSourceIdsRef.current.delete(source.id);
      setCurrentSourceId(null);
      setError("");
      await refreshRecovery();
    } catch {
      setError(tc("discard_local_failed"));
    }
  };

  const pendingReview = sources.find((source) => source.expenseId);
  const pendingSource = sources.find((source) => !source.expenseId);
  const activeSourceId = currentSourceId ?? pendingSource?.id ?? null;
  const currentStatus = activeSourceId
    ? sources.find((source) => source.id === activeSourceId)
    : undefined;
  const processing = Boolean(activeSourceId && inFlightRef.current.has(activeSourceId));
  const manualLocked = manualSaving || manualSource?.reviewSyncState === "uncertain";

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-8">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{tc("step_capture")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{tc("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{tc("subtitle")}</p>
          </div>
          <button type="button" onClick={() => void refreshRecovery()} disabled={refreshing} aria-label={tc("refresh_recovery")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-card-hover disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </header>

        {pendingReview ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">{tc("review_required")}</p>
            <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">{tc("finish_review_first")}</p>
            <Link href={`/expenses/${pendingReview.expenseId}/edit?ocr_source_id=${encodeURIComponent(pendingReview.id)}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white">
              {tc("resume_review")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <>
            <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
                  <Camera className="h-7 w-7" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">{tc("capture_receipt_title")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{tc("capture_receipt_hint")}</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={processing || Boolean(pendingSource)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-50">
                  <Camera className="h-4 w-4" aria-hidden="true" /> {tc("take_photo")}
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={processing || Boolean(pendingSource)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-card-hover disabled:opacity-50">
                  <FileText className="h-4 w-4" aria-hidden="true" /> {tc("choose_file")}
                </button>
              </div>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" aria-hidden="true" />
              <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,.webp" onChange={handleFile} className="hidden" aria-hidden="true" />
            </section>

            {activeSourceId && (
              <section className="rounded-xl border border-border bg-card p-4" aria-live="polite">
                {processing ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{progress?.phase === "uploading" ? t("scan_uploading") : t("scan_reading", { seconds: progress?.elapsedSeconds ?? 0 })}</p>
                      <p className="text-xs text-muted-foreground">{tc("keep_review_resumable")}</p>
                    </div>
                  </div>
                ) : !navigator.onLine ? (
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{tc("offline_saved")}</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-rose-700 dark:text-rose-300">{error || tc("capture_needs_retry")}</p>
                    {currentStatus && !currentStatus.expenseId && (currentStatus.data || currentStatus.remoteJobId) && (
                      <button type="button" onClick={() => void processSource(currentStatus)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">{tc("retry_same_source")}</button>
                    )}
                    {currentStatus && !currentStatus.remoteJobId && !currentStatus.expenseId &&
                      (!currentStatus.uploadState || currentStatus.uploadState === "rejected") && (
                      <div>
                        <p className="text-xs text-muted-foreground">{tc("discard_local_hint")}</p>
                        <button type="button" onClick={() => void discardLocalSource(currentStatus)} className="min-h-11 px-3 text-sm font-semibold text-rose-700 dark:text-rose-300">{tc("discard_local")}</button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {error && !currentSourceId && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}

        {jobs.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{tc("recovery_title")}</h2>
              {refreshing && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label={tc("refreshing")} />}
            </div>
            <div className="divide-y divide-border">
              {jobs.map((job) => {
                const source = sources.find((item) => item.remoteJobId === job.job_id || item.expenseId === job.expense_id);
                return (
                  <div key={job.job_id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{tc("job_status", { status: job.status })}</p>
                        {job.error_message && <p className="mt-1 text-xs text-muted-foreground">{job.error_message}</p>}
                        {job.report_link_status === "CONFLICT" && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{tc("report_context_conflict")}</p>}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">#{job.job_id}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {job.expense_id && source && (
                        <Link href={`/expenses/${job.expense_id}/edit?ocr_source_id=${encodeURIComponent(source.id)}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-primary">
                          {tc("resume_review")} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      )}
                      {job.allowed_actions.includes("retry") && (
                        <button type="button" onClick={() => void runRetry(job)} className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold text-foreground">{tc("retry")}</button>
                      )}
                      {job.allowed_actions.includes("complete_manually") && (
                        <button type="button" onClick={() => void openManualCompletion(job)} className="min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-white">{tc("complete_manually")}</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {manualJob && manualSource && (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label={tc("complete_manually")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">{tc("complete_manually")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{tc("manual_completion_hint")}</p>
              </div>
              <button type="button" onClick={() => { setManualJob(null); setManualSource(null); }} className="min-h-11 px-3 text-sm text-muted-foreground">{tc("close")}</button>
            </div>
            {manualError && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{manualError}</p>}
            {manualJob.expense_id ? <p className="mt-4 text-sm text-muted-foreground">{tc("resume_existing_expense")}</p> : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground">{t("label_amount")}<input disabled={manualLocked} type="number" min="0.01" step="0.01" inputMode="decimal" value={manualValues.amount} onChange={(event) => setManualValues((value) => ({ ...value, amount: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground" /></label>
              <label className="text-xs font-medium text-muted-foreground">{t("label_currency")}<select disabled={manualLocked} value={manualValues.currency} onChange={(event) => setManualValues((value) => ({ ...value, currency: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground">{CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
              <label className="text-xs font-medium text-muted-foreground">{t("label_date")}<input disabled={manualLocked} type="date" value={manualValues.date} onChange={(event) => setManualValues((value) => ({ ...value, date: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground" /></label>
              <label className="text-xs font-medium text-muted-foreground">{t("label_merchant")}<input disabled={manualLocked} value={manualValues.merchant} onChange={(event) => setManualValues((value) => ({ ...value, merchant: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground" /></label>
              <label className="text-xs font-medium text-muted-foreground sm:col-span-2">{t("label_description")}<textarea disabled={manualLocked} value={manualValues.description} onChange={(event) => setManualValues((value) => ({ ...value, description: event.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-input-border bg-background px-3 py-2 text-base text-foreground" /></label>
            </div>
            )}
            {manualSource.reviewSyncState === "local-only" && <p aria-live="polite" className="mt-3 text-xs text-muted-foreground">{tc("manual_local_saved")}</p>}
            <button type="button" disabled={manualSaving || !navigator.onLine} onClick={() => void submitManualCompletion()} className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
                  {manualSaving ? tc("saving") : manualSource.reviewSyncState === "uncertain" ? tc("retry_same_action") : tc("complete_manually")}
            </button>
            {manualSource.reviewSyncState === "uncertain" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{tc("action_uncertain")}</p>}
          </section>
        )}

        {!pendingReview && !pendingSource && !manualJob && (
          <Link href={reportId ? `/expenses/new?mode=manual&reportId=${reportId}` : "/expenses/new?mode=manual"} className="min-h-11 self-center px-3 text-sm font-medium text-primary underline underline-offset-4">{tc("manual_entry")}</Link>
        )}
      </div>
    </AppShell>
  );
}
