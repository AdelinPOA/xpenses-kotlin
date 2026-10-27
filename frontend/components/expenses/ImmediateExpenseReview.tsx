"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { API_BASE_URL, type Category, type Expense } from "@/lib/api";
import { categoryKeys, dashboardKeys, expenseKeys } from "@/lib/queryKeys";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { useFormGuard } from "@/lib/useFormGuard";
import { CURRENCIES } from "@/lib/types/common";
import {
  findOcrSourceByExpenseId,
  listOcrSources,
  persistOcrReviewState,
  removeOcrSource,
  type OcrReviewFormValues,
  type OcrReviewRequestBody,
  type OcrReviewRequestValues,
  type PendingOcrReviewOperation,
  type PendingOcrSource,
} from "@/lib/ocrSourceQueue";
import FxRateInput from "./FxRateInput";
import ReceiptPreview from "./ReceiptPreview";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

type FormValues = Pick<
  OcrReviewFormValues,
  "amount" | "currency" | "date" | "merchant" | "description" | "categoryId" | "taxAmount" | "taxRate"
>;

type NextAction = "expenses" | "capture";

function valuesFromExpense(expense: Expense): FormValues {
  return {
    amount: String(expense.amount_original ?? ""),
    currency: expense.currency_original || "EUR",
    date: expense.date || new Date().toISOString().slice(0, 10),
    merchant: expense.merchant ?? "",
    description: expense.description ?? "",
    categoryId: expense.category_id?.toString() ?? "",
    taxAmount: String(expense.tax_amount ?? 0),
    taxRate: expense.tax_rate?.toString() ?? "",
  };
}

function storedValues(values: FormValues, manualFxRate: number | null, fxRateEditMode: boolean): OcrReviewFormValues {
  return {
    ...values,
    manualFxRate: manualFxRate?.toString() ?? "",
    fxRateEditMode,
  };
}

function fromStored(values: OcrReviewFormValues): FormValues {
  return {
    amount: values.amount,
    currency: values.currency,
    date: values.date,
    merchant: values.merchant,
    description: values.description,
    categoryId: values.categoryId,
    taxAmount: values.taxAmount,
    taxRate: values.taxRate,
  };
}

function reviewBody(
  expense: Expense,
  values: FormValues,
  manualFxRate: number | null,
  fxRateEditMode: boolean,
  confirm: boolean,
  translate: (key: string) => string,
): OcrReviewRequestBody {
  const amount = Number(values.amount);
  const taxAmount = values.taxAmount.trim() ? Number(values.taxAmount) : 0;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(translate("amount_required"));
  if (!values.date) throw new Error(translate("date_required"));
  if (!Number.isFinite(taxAmount) || taxAmount < 0) throw new Error(translate("tax_amount_invalid"));
  const requestValues: OcrReviewRequestValues = {};
  if (amount !== expense.amount_original) requestValues.amount = amount;
  if (values.currency !== expense.currency_original) requestValues.currency = values.currency;
  if (values.date !== expense.date) requestValues.date = values.date;
  if (taxAmount !== expense.tax_amount) requestValues.tax_amount = taxAmount;
  const merchant = values.merchant.trim();
  if ((merchant || null) !== (expense.merchant || null)) requestValues.merchant = merchant;
  const description = values.description.trim();
  if ((description || null) !== (expense.description || null)) requestValues.description = description;
  if (values.taxRate.trim()) {
    const taxRate = Number(values.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0) throw new Error(translate("tax_rate_invalid"));
    if (taxRate !== expense.tax_rate) requestValues.tax_rate = taxRate;
  }
  if (values.categoryId) {
    const categoryId = Number(values.categoryId);
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new Error(translate("category_invalid"));
    if (categoryId !== expense.category_id) requestValues.category_id = categoryId;
  } else if (expense.category_id !== null) {
    requestValues.clear_category = true;
  }
  if (fxRateEditMode && manualFxRate !== null && (!expense.fx_rate_manual || manualFxRate !== expense.fx_rate)) {
    requestValues.fx_rate = manualFxRate;
    requestValues.fx_rate_manual = true;
  }
  if (typeof expense.version !== "number") throw new Error(translate("version_missing"));
  return { expected_version: expense.version, values: requestValues, confirm };
}

function sameBody(left: OcrReviewRequestBody, right: OcrReviewRequestBody): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toReceiptItems(expense: Expense) {
  return (expense.receipts ?? []).map((receipt) => {
    const name = receipt.original_name || receipt.file_path.split("/").pop() || "Receipt";
    const path = `${API_BASE_URL}/expenses/${expense.id}/receipts/${receipt.id}`;
    return {
      key: `receipt-${receipt.id}`,
      name,
      url: path,
      isImage: /\.(jpg|jpeg|png|webp)$/i.test(name),
      isPdf: /\.pdf$/i.test(name),
    };
  });
}

function sanitizeUrl(url: string): string {
  if (url.startsWith("blob:") || url.startsWith("/")) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

export default function ImmediateExpenseReview({
  expense: initialExpense,
  sourceId,
  recoveringConfirmedOperation = false,
  onSourceUnavailableAction,
  onReloadAction,
}: {
  expense: Expense;
  sourceId?: string | null;
  recoveringConfirmedOperation?: boolean;
  onSourceUnavailableAction?: () => void;
  onReloadAction: () => Promise<Expense | null>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const t = useTranslations("expenses");
  const tr = useTranslations("expenseReview");
  const initialExpenseRef = useRef(initialExpense);
  const [expense, setExpense] = useState(initialExpense);
  const [form, setForm] = useState<FormValues>(() => valuesFromExpense(initialExpense));
  const [manualFxRate, setManualFxRate] = useState<number | null>(null);
  const [fxRateEditMode, setFxRateEditMode] = useState(false);
  const [source, setSource] = useState<PendingOcrSource | null>(null);
  const [sourceLoaded, setSourceLoaded] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);
  const [error, setError] = useState("");
  const [activeReceiptKey, setActiveReceiptKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const persistenceChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const { data: categories } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((response) => response.data),
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const initialForm = useMemo(() => valuesFromExpense(initialExpenseRef.current), []);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm) ||
    fxRateEditMode || manualFxRate !== null;
  const { clearDirty } = useFormGuard(() => dirty, tr("unsaved_guard"));

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.id) return;
      try {
        let record: PendingOcrSource | null = null;
        const currentExpense = initialExpenseRef.current;
        const records = await listOcrSources(user.id);
        if (sourceId) record = records.find((item) => item.id === sourceId && item.expenseId === currentExpense.id) ?? null;
        if (!record) record = await findOcrSourceByExpenseId(user.id, currentExpense.id);
        if (!record) {
          onSourceUnavailableAction?.();
          setError(tr("local_storage_unavailable"));
          return;
        }
        if (!active) return;
        if (record.reviewOperation) {
          // A crash may have happened before or after the server commit. Only
          // the immutable original operation can resolve that ambiguity.
          record = await persistOcrReviewState(record.id, user.id, { reviewSyncState: "uncertain" });
        } else if (record.reviewValues && record.reviewSyncState !== "server-saved" &&
          record.expenseVersion !== currentExpense.version) {
          record = await persistOcrReviewState(record.id, user.id, {
            reviewSyncState: "conflict",
            reviewError: tr("version_conflict"),
          });
        } else if (record.expenseVersion !== currentExpense.version) {
          record = await persistOcrReviewState(record.id, user.id, {
            expenseVersion: currentExpense.version,
            reviewValues: undefined,
          });
        }
        if (!active) return;
        setSource(record);
        if (record.reviewValues) {
          setForm(fromStored(record.reviewValues));
          setManualFxRate(record.reviewValues.manualFxRate ? Number(record.reviewValues.manualFxRate) : null);
          setFxRateEditMode(record.reviewValues.fxRateEditMode);
        }
      } catch {
        if (active) {
          setError(tr("local_storage_unavailable"));
          onSourceUnavailableAction?.();
        }
      } finally {
        if (active) setSourceLoaded(true);
      }
    };
    void load();
    return () => { active = false; };
  }, [initialExpense.id, sourceId, tr, user?.id]);

  useEffect(() => {
    if (!source || !sourceLoaded || !user?.id) return;
    const nextValues = storedValues(form, manualFxRate, fxRateEditMode);
    if (JSON.stringify(source.reviewValues) === JSON.stringify(nextValues)) return;
    setLocalSaving(true);
    const timer = setTimeout(() => {
      persistenceChainRef.current = persistenceChainRef.current
        .then(() => persistOcrReviewState(source.id, user.id, {
          reviewValues: nextValues,
          reviewSyncState: source.reviewSyncState === "uncertain" || source.reviewSyncState === "conflict" ? source.reviewSyncState : "local-only",
          reviewError: undefined,
        }))
        .then((updated) => {
          setSource(updated as PendingOcrSource);
          setLocalSaving(false);
        })
        .catch(() => {
          setLocalSaving(false);
          setError(tr("local_save_failed"));
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [form, fxRateEditMode, manualFxRate, source?.id, source?.reviewSyncState, source?.reviewValues, sourceLoaded, tr, user?.id]);

  const receipts = useMemo(() => toReceiptItems(expense), [expense]);
  const activeReceipt = receipts.find((item) => item.key === activeReceiptKey) ?? receipts[0] ?? null;

  const persistDraft = useCallback(async () => {
    if (!source || !user?.id) throw new Error(tr("local_storage_unavailable"));
    await persistenceChainRef.current;
    const updated = await persistOcrReviewState(source.id, user.id, {
      reviewValues: storedValues(form, manualFxRate, fxRateEditMode),
      reviewSyncState: "local-only",
      reviewError: undefined,
    });
    setSource(updated);
    setError("");
    return updated;
  }, [form, fxRateEditMode, manualFxRate, source, tr, user?.id]);

  const writeOperation = useCallback(async (operation: PendingOcrReviewOperation, nextAction: NextAction) => {
    if (!source || !user?.id) throw new Error(tr("local_storage_unavailable"));
    const prepared = await persistOcrReviewState(source.id, user.id, {
      reviewValues: storedValues(form, manualFxRate, fxRateEditMode),
      reviewSyncState: "saving",
      reviewOperation: operation,
      reviewError: undefined,
    });
    setSource(prepared);
    setSubmitting(true);
    setError("");
    try {
      const response = await api.put<Expense>(`/expenses/${expense.id}/review`, operation.body, {
        headers: { "Idempotency-Key": operation.key },
      });
      const saved: Expense = response.data;
      if (operation.body.confirm && saved.verification_state !== "VERIFIED") {
        // Replays return current state, not a frozen confirmation snapshot.
        // Later edits can invalidate the original attestation.
        const conflicted = await persistOcrReviewState(prepared.id, user.id, {
          reviewSyncState: "conflict",
          reviewOperation: undefined,
          reviewError: tr("version_conflict"),
        });
        setSource(conflicted);
        setExpense(saved);
        setError(tr("version_conflict"));
        return;
      }
      setExpense(saved);
      const acknowledged = await persistOcrReviewState(prepared.id, user.id, {
        expenseVersion: saved.version,
        reviewValues: storedValues(
          {
            amount: String(saved.amount_original),
            currency: saved.currency_original,
            date: saved.date,
            merchant: saved.merchant ?? "",
            description: saved.description ?? "",
            categoryId: saved.category_id?.toString() ?? "",
            taxAmount: String(saved.tax_amount ?? 0),
            taxRate: saved.tax_rate?.toString() ?? "",
          },
          manualFxRate,
          fxRateEditMode,
        ),
        reviewSyncState: "server-saved",
        reviewOperation: undefined,
        reviewError: undefined,
      }, prepared.updatedAt).catch(() => ({
        ...prepared,
        expenseVersion: saved.version,
        reviewOperation: undefined,
        reviewSyncState: "server-saved" as const,
        reviewError: undefined,
      }));
      setSource(acknowledged);
      setForm(valuesFromExpense(saved));
      setError("");
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      if (operation.body.confirm) {
        await removeOcrSource(prepared.id, user.id, undefined, acknowledged.updatedAt).catch(() => undefined);
        clearDirty();
        if (nextAction === "capture") {
          const report = saved.report_id ? `?reportId=${saved.report_id}` : "";
          router.push(`/expenses/capture${report}`);
        } else {
          router.push(`/expenses?highlight=${saved.id}`);
        }
      } else {
        clearDirty();
        toast.success(tr("server_saved"));
      }
    } catch (requestError) {
      const status = (requestError as { response?: { status?: number; data?: { detail?: string; current?: Expense } } })?.response?.status;
      const detail = (requestError as { response?: { data?: { detail?: string; current?: Expense } } })?.response?.data;
      if (status === 409) {
        await persistOcrReviewState(prepared.id, user.id, {
          reviewSyncState: "conflict",
          reviewOperation: undefined,
          reviewError: detail?.detail ?? tr("version_conflict"),
        }).then(setSource).catch(() => undefined);
        if (detail?.current) setExpense(detail.current);
        setError(detail?.detail ?? tr("version_conflict"));
      } else if (status !== undefined && status >= 400 && status < 500) {
        await persistOcrReviewState(prepared.id, user.id, {
          reviewSyncState: "error",
          reviewOperation: undefined,
          reviewError: detail?.detail ?? tr("save_failed"),
        }).then(setSource).catch(() => undefined);
        setError(detail?.detail ?? tr("save_failed"));
      } else {
        await persistOcrReviewState(prepared.id, user.id, {
          reviewSyncState: "uncertain",
          reviewOperation: operation,
          reviewError: tr("request_uncertain"),
        }).then(setSource).catch(() => undefined);
        setError(tr("request_uncertain"));
      }
    } finally {
      setSubmitting(false);
    }
  }, [clearDirty, expense.id, fxRateEditMode, form, manualFxRate, qc, router, source, toast, tr, user?.id]);

  const saveOrConfirm = async (confirm: boolean, nextAction: NextAction = "expenses") => {
    if (!online) {
      setError(tr("online_required"));
      return;
    }
    if (source?.reviewSyncState === "conflict") return;
    try {
      const body = reviewBody(expense, form, manualFxRate, fxRateEditMode, confirm, tr);
      const existing = source?.reviewOperation;
      const operation = existing && sameBody(existing.body, body)
        ? existing
        : { key: crypto.randomUUID(), body, navigateTo: nextAction };
      await persistDraft();
      await writeOperation(operation, nextAction);
    } catch (submitError) {
      setError((submitError as Error).message ?? tr("save_failed"));
    }
  };

  const retryExactOperation = async () => {
    if (!source?.reviewOperation || !online) return;
    const nextAction: NextAction = source.reviewOperation.navigateTo ?? "expenses";
    await writeOperation(source.reviewOperation, nextAction);
  };

  const reloadLatest = async () => {
    const latest = await onReloadAction();
    if (!latest) return;
    setExpense(latest);
    setForm(valuesFromExpense(latest));
    setManualFxRate(null);
    setFxRateEditMode(false);
    if (source && user?.id) {
      const updated = await persistOcrReviewState(source.id, user.id, {
        expenseVersion: latest.version,
        reviewValues: undefined,
        reviewOperation: undefined,
        reviewSyncState: "server-saved",
        reviewError: undefined,
      }).catch(() => null);
      if (updated) setSource(updated);
    }
    clearDirty();
    setError("");
  };

  const setField = (field: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };
  const readOnly = expense.status !== "draft";
  const locked = submitting || source?.reviewSyncState === "uncertain" || source?.reviewSyncState === "conflict" || !sourceLoaded;
  const disableFields = locked || readOnly;
  const state = localSaving ? "saving" : source?.reviewSyncState ?? "local-only";
  const categoryClearAvailable = expense.category_id !== null;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingImage(true);
    setDragStart({ x: event.clientX - position.x, y: event.clientY - position.y });
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingImage) return;
    setPosition({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">{tr("step_review")}</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{tr("heading")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tr("subtitle")}</p>
        </div>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> {recoveringConfirmedOperation ? tr("state_uncertain") : tr("pending")}
        </span>
      </div>

      <div className={`rounded-xl border px-4 py-3 text-sm ${state === "server-saved" ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-border bg-card text-muted-foreground"}`} aria-live="polite">
        <div className="flex items-center gap-2">
          {state === "saving" || submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : state === "server-saved" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
          <span>{tr(`state_${state}` as never)}</span>
        </div>
        {source?.reviewError && <p className="mt-1 text-xs">{source.reviewError}</p>}
        {!online && <p className="mt-1 text-xs">{tr("offline_notice")}</p>}
      </div>

      {source?.reportLinkStatus === "CONFLICT" && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">{tr("report_conflict")}</p>}
      {readOnly && <p role="status" className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">{tr("financial_status_readonly")}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100">{error}</p>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <form className="w-full max-w-2xl flex-1 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6" onSubmit={(event) => { event.preventDefault(); void saveOrConfirm(true); }}>
          <fieldset disabled={disableFields} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground">{t("label_amount")}<input required min="0.01" step="0.01" type="number" inputMode="decimal" value={form.amount} onChange={setField("amount")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground" /></label>
              <label className="text-xs font-medium text-muted-foreground">{t("label_currency")}<select value={form.currency} onChange={setField("currency")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground">{CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
            </div>
            {form.currency !== "EUR" && <FxRateInput active={fxRateEditMode} currency={form.currency} amount={form.amount} date={form.date} initialRate={expense.fx_rate} initialManualRate={expense.fx_rate_manual ? expense.fx_rate : null} initialEditorRate={manualFxRate} onToggle={() => { setFxRateEditMode((active) => !active); if (fxRateEditMode) setManualFxRate(null); }} onManualRateChange={setManualFxRate} />}
            <label className="block text-xs font-medium text-muted-foreground">{t("label_merchant")}<input value={form.merchant} onChange={setField("merchant")} placeholder={t("placeholder_merchant")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground" /></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground">{t("label_date")}<input required type="date" value={form.date} onChange={setField("date")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground" /></label>
              <label className="text-xs font-medium text-muted-foreground">{t("label_category")}<select value={form.categoryId} onChange={setField("categoryId")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground"><option value="">{categoryClearAvailable ? tr("clear_category") : t("select_category")}</option>{categories?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            </div>
            <details className="rounded-lg border border-border-subtle px-3">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-foreground">{t("additional_details")}</summary>
              <div className="space-y-3 pb-3">
                <label className="block text-xs font-medium text-muted-foreground">{t("label_description")}<textarea value={form.description} onChange={setField("description")} rows={2} className="mt-1 w-full rounded-lg border border-input-border bg-background px-3 py-2 text-base text-foreground" /></label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-muted-foreground">{t("label_tax_amount")}<input min="0" step="0.01" type="number" inputMode="decimal" value={form.taxAmount} onChange={setField("taxAmount")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground" /></label>
                  <label className="text-xs font-medium text-muted-foreground">{t("label_tax_rate")}<input min="0" step="0.01" type="number" inputMode="decimal" value={form.taxRate} onChange={setField("taxRate")} className="mt-1 min-h-11 w-full rounded-lg border border-input-border bg-background px-3 text-base text-foreground" /></label>
                </div>
              </div>
            </details>
          </fieldset>

          <div className="rounded-xl border border-border-subtle bg-background/60 p-3">
            <h2 className="text-sm font-semibold text-foreground">{tr("receipt_heading", { count: expense.receipts?.length ?? 0 })}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{tr("receipt_required")}</p>
            <div className="mt-2 space-y-2">
              {expense.receipts?.map((receipt) => (
                <a key={receipt.id} href={`${API_BASE_URL}/expenses/${expense.id}/receipts/${receipt.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 text-sm text-primary underline">{receipt.original_name || receipt.file_path.split("/").pop() || t("mobile_receipt")}</a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 border-t border-border bg-card pt-4 sm:grid-cols-2">
            {source?.reviewSyncState === "uncertain" && source.reviewOperation ? (
              <button type="button" disabled={!online || submitting} onClick={() => void retryExactOperation()} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{tr("retry_same_request")}</button>
            ) : source?.reviewSyncState === "conflict" ? (
              <button type="button" disabled={!online} onClick={() => void reloadLatest()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />{tr("reload_server")}</button>
            ) : (
              <>
                <button type="button" onClick={() => void persistDraft().then(() => toast.success(tr("local_saved"))).catch((saveError) => setError((saveError as Error).message))} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-foreground">{tr("save_on_device")}</button>
                <button type="button" disabled={!online || submitting || !sourceLoaded || (readOnly && !expense.receipts?.length)} onClick={() => void saveOrConfirm(false)} className="min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-50">{submitting ? tr("saving") : tr("save_draft")}</button>
                <button type="button" disabled={!online || submitting || !sourceLoaded || !expense.receipts?.length} onClick={() => void saveOrConfirm(true, "expenses")} className="min-h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-50 sm:col-span-2">{submitting ? tr("saving") : tr("confirm_expense")}</button>
                <button type="button" disabled={!online || submitting || !sourceLoaded || !expense.receipts?.length} onClick={() => void saveOrConfirm(true, "capture")} className="inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-semibold text-primary disabled:opacity-50 sm:col-span-2">{tr("confirm_and_capture_next")} <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
              </>
            )}
          </div>
        </form>

        {receipts.length > 0 && (
          <div className="w-full lg:flex-1">
            <ReceiptPreview items={receipts} activeItem={activeReceipt} zoom={zoom} position={position} isDraggingImage={isDraggingImage} activeReceiptKey={activeReceiptKey} onSelectItem={setActiveReceiptKey} onZoomIn={() => setZoom((value) => Math.min(3, value + 0.25))} onZoomOut={() => setZoom((value) => Math.max(0.5, value - 0.25))} onReset={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={() => setIsDraggingImage(false)} sanitizeUrl={sanitizeUrl} />
          </div>
        )}
      </div>
    </div>
  );
}
