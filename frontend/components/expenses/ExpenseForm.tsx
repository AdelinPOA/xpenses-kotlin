"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Category, Expense, CURRENCIES, API_BASE_URL, downloadBlob, OCRScanResult } from "@/lib/api";
import { categoryKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import { useFormGuard } from "@/lib/useFormGuard";
import { scanReceipt, ScanProgress, ScanCancelledError, ScanTimeoutError, ScanJobError } from "@/lib/ocrScan";
import { saveNewExpense } from "@/lib/expenseSaving";
import { useOfflineSync } from "@/components/OfflineSyncProvider";
import { Camera, Trash2 } from "lucide-react";
import clsx from "clsx";
import { formatEur } from "@/lib/format";
import ReceiptScanner from "./ReceiptScanner";
import FxRateInput from "./FxRateInput";
import ReceiptPreview from "./ReceiptPreview";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/components/AuthProvider";
import { useTranslations } from "next-intl";

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "javascript:" || protocol === "data:" || protocol === "file:" || protocol === "vbscript:") return "";
    if (url.startsWith("blob:")) return url;
    return parsed.href;
  } catch { return ""; }
}

interface FormFields {
  amount: string;
  currency: string;
  date: string;
  merchant: string;
  description: string;
  category_id: string;
  tax_amount: string;
  tax_rate: string;
  raw_ocr_text: string;
}

interface Props {
  expense?: Expense;
  reportId?: number;
  defaultCurrency?: string;
  /** Highlights the receipt section (set when arriving with ?upload_failed=1). */
  highlightReceipts?: boolean;
}

export default function ExpenseForm({ expense, reportId, defaultCurrency, highlightReceipts }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const toast = useToast();
  const { user } = useAuth();
  const { refreshCount: refreshOffline } = useOfflineSync();

  const [ocrExpense, setOcrExpense] = useState<Expense | null>(null);
  const currentExpense = expense ?? ocrExpense;
  const isEdit = !!currentExpense;

  const [form, setForm] = useState<FormFields>({
    amount: expense?.amount_original?.toString() ?? "",
    currency: expense?.currency_original ?? defaultCurrency ?? "EUR",
    date: expense?.date ?? new Date().toISOString().slice(0, 10),
    merchant: expense?.merchant ?? "",
    description: expense?.description ?? "",
    category_id: expense?.category_id?.toString() ?? "",
    tax_amount: expense?.tax_amount?.toString() ?? "0",
    tax_rate: expense?.tax_rate?.toString() ?? "",
    raw_ocr_text: expense?.raw_ocr_text ?? "",
  });
  const [fxRateEditMode, setFxRateEditMode] = useState(false);
  // Effective manual FX rate (raw or derived from the debited amount), reported by FxRateInput.
  const [manualFxRate, setManualFxRate] = useState<number | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<{ id: string; file: File }[]>([]);
  const [deletedReceiptIds, setDeletedReceiptIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [savedExpense, setSavedExpense] = useState<Expense | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<OCRScanResult | null>(null);
  // Staged OCR progress ("Uploading… / Reading receipt… (n)s") + cancel.
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const scanInFlightRef = useRef(false);
  // Distinguishes the receipt-upload sub-phase of saving so slow uploads
  // don't look frozen on the submit button.
  const [isUploadingReceipts, setIsUploadingReceipts] = useState(false);
  // Set when a save succeeded but receipt upload failed while editing:
  // stays on the page and highlights the receipt section.
  const [receiptUploadFailedLocal, setReceiptUploadFailedLocal] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [activeReceiptKey, setActiveReceiptKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeMobileTab, setActiveMobileTab] = useState<'details' | 'receipt'>('details');
  const [isDragging, setIsDragging] = useState(false);

  // Unsaved-changes guard: any field drift from initial values, or receipt
  // additions/deletions, marks the form dirty.
  const initialFieldsRef = useRef<FormFields>({ ...form });
  // Manual FX-rate state lives outside `form` but is equally loss-worthy.
  const initialFxRef = useRef({ fxRateEditMode, manualFxRate });
  const isDirty = () =>
    Object.keys(initialFieldsRef.current).some(
      (k) => form[k as keyof FormFields] !== initialFieldsRef.current[k as keyof FormFields]
    ) ||
    fxRateEditMode !== initialFxRef.current.fxRateEditMode ||
    manualFxRate !== initialFxRef.current.manualFxRate ||
    receiptFiles.length > 0 ||
    deletedReceiptIds.size > 0;
  const { clearDirty } = useFormGuard(isDirty, t("guard_unsaved_changes"));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingImage(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingImage) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handlePointerUp = () => setIsDraggingImage(false);

  const objectUrlsRef = useRef<Map<File, string>>(new Map());
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getObjectUrl = (file: File) => {
    if (!objectUrlsRef.current.has(file)) objectUrlsRef.current.set(file, URL.createObjectURL(file));
    return objectUrlsRef.current.get(file)!;
  };

  useEffect(() => {
    const currentFiles = new Set(receiptFiles.map((e) => e.file));
    objectUrlsRef.current.forEach((url, file) => {
      if (!currentFiles.has(file)) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(file);
      }
    });
  }, [receiptFiles]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  useEffect(() => { setZoom(1); setPosition({ x: 0, y: 0 }); }, [activeReceiptKey]);

  const { data: categories } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const existingReceipts = currentExpense?.receipts?.filter((r) => !deletedReceiptIds.has(r.id)) ?? [];

  const items = [
    ...existingReceipts.map((r) => ({
      key: `existing-${r.id}`,
      name: r.original_name || r.file_path.split("/").pop() || t("mobile_receipt"),
      url: `${API_BASE_URL}/expenses/${currentExpense!.id}/receipts/${r.id}`,
      isImage: /\.(jpg|jpeg|png|webp)$/i.test(r.file_path || r.original_name || ""),
      isPdf: /\.pdf$/i.test(r.file_path || r.original_name || ""),
    })),
    ...receiptFiles.map((entry) => ({
      key: `new-${entry.id}`,
      name: entry.file.name,
      url: getObjectUrl(entry.file),
      isImage: entry.file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(entry.file.name),
      isPdf: entry.file.type === "application/pdf" || entry.file.name.toLowerCase().endsWith(".pdf"),
    })),
  ];
  const activeItem = items.find((it) => it.key === activeReceiptKey) || items[0] || null;

  const save = useMutation({
    // "always": TanStack otherwise PAUSES mutations while navigator.onLine
    // is false — our own offline handling (IndexedDB queue) lives in
    // mutationFn and must run even when offline.
    networkMode: "always",
    mutationFn: async () => {
      const manualRate = fxRateEditMode ? manualFxRate : null;
      const payload = {
        amount: parseFloat(form.amount),
        currency: form.currency,
        date: form.date,
        merchant: form.merchant || null,
        description: form.description || null,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        tax_amount: form.tax_amount ? parseFloat(form.tax_amount) : 0,
        tax_rate: form.tax_rate ? parseFloat(form.tax_rate) : null,
        raw_ocr_text: form.raw_ocr_text || null,
        comparison_id: scanResult?.comparison_id || null,
        ...(manualRate !== null ? { fx_rate: manualRate, fx_rate_manual: true } : {}),
        ...(reportId && !currentExpense?.report_id ? { report_id: reportId } : {}),
      };

      if (isEdit && currentExpense) {
        if (!navigator.onLine) throw new Error(t("edit_offline_unsupported"));
        let result: Expense;
        try {
          result = await api.patch(`/expenses/${currentExpense.id}`, payload).then((r) => r.data);
          if (!expense) setOcrExpense(result);
        } catch (e: any) {
          throw new Error(e.response?.data?.detail ?? t("error_save"));
        }
        try {
          for (const rid of deletedReceiptIds) {
            try {
              await api.delete(`/expenses/${result.id}/receipts/${rid}`);
            } catch (e: any) {
              // 404 = already deleted in a previous attempt; safe to ignore.
              if (e?.response?.status !== 404) throw e;
            }
            setDeletedReceiptIds((prev) => {
              const next = new Set(prev);
              next.delete(rid);
              return next;
            });
          }
          if (receiptFiles.length > 0) {
            setIsUploadingReceipts(true);
            const fd = new FormData();
            receiptFiles.forEach(({ file }) => fd.append("files", file));
            await api.post(`/expenses/${result.id}/receipts`, fd);
          }
        } catch {
          // Editing an existing Expense never creates a replacement Expense.
          qc.invalidateQueries({ queryKey: expenseKeys.all });
          qc.invalidateQueries({ queryKey: dashboardKeys.all });
          return { expense: result, receiptUploadFailed: true as const, queued: null, failed: null };
        } finally {
          setIsUploadingReceipts(false);
        }
        return { expense: result, receiptUploadFailed: false, queued: null, failed: null };
      }

      try {
        if (!user?.id) throw new Error(t("error_save"));
        if (receiptFiles.length > 0 && navigator.onLine) setIsUploadingReceipts(true);
        const outcome = await saveNewExpense(
          payload,
          receiptFiles.map(({ file }) => file),
          user.id,
        );
        if (outcome.status === "failed") {
          return { expense: null, receiptUploadFailed: false, queued: null, failed: outcome.message };
        }
        if (outcome.status === "queued") {
          return { expense: null, receiptUploadFailed: false, queued: outcome.item, failed: null };
        }
        if (outcome.status === "partial") {
          return { expense: outcome.expense, receiptUploadFailed: true as const, queued: outcome.item, failed: null };
        }
        return { expense: outcome.expense, receiptUploadFailed: false, queued: null, failed: null };
      } finally {
        setIsUploadingReceipts(false);
      }
    },
    onSuccess: async ({ expense: result, receiptUploadFailed, queued, failed }) => {
      if (failed) {
        setError(failed);
        await refreshOffline();
        return;
      }
      if (queued && !result) {
        toast.success(t("saved_offline_toast"));
        await refreshOffline();
        clearDirty();
        router.push(reportId ? `/reports/${reportId}` : "/expenses");
        return;
      }
      if (!result) return;
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      if (receiptUploadFailed) {
        await refreshOffline();
        toast.warning(t("warning_expense_saved_receipt_failed"));
        if (isEdit) {
          // Editing an existing expense: stay put and point at the receipts.
          setReceiptUploadFailedLocal(true);
        } else {
          // Newly created expense: land on its edit page so a re-save can't
          // create a second one; edit page highlights the receipt dropzone.
          clearDirty();
          router.push(`/expenses/${result.id}/edit?upload_failed=1`);
        }
        return;
      }
      const destination = reportId ? `/reports/${reportId}` : "/expenses";
      if (result.currency_original !== "EUR") {
        setSavedExpense(result);
        clearDirty();
        redirectTimeoutRef.current = setTimeout(() => router.push(destination), 2000);
      } else {
        clearDirty();
        router.push(destination);
      }
    },
    onError: (e: any) => setError(e.message ?? e.response?.data?.detail ?? t("error_save_generic")),
  });

  const setField = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setReceiptFiles((prev) => [...prev, ...files.map((f) => ({ id: crypto.randomUUID(), file: f }))]);
    e.target.value = "";
  };
  const removeNewFile = (index: number) => setReceiptFiles((prev) => prev.filter((_, i) => i !== index));
  const markDeleteReceipt = (receiptId: number) => setDeletedReceiptIds((prev) => new Set(prev).add(receiptId));

  const cancelScan = () => scanAbortRef.current?.abort();

  const processFileScan = async (file: File) => {
    if (scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    setIsScanning(true);
    setScanResult(null);
    setScanProgress({ phase: "uploading", elapsedSeconds: 0 });
    setError("");
    const ac = new AbortController();
    scanAbortRef.current = ac;
    try {
      const result = await scanReceipt(file, { signal: ac.signal, onProgress: setScanProgress });
      if (result.expense_id != null || result.receipt_id != null) {
        if (result.expense_id == null || result.receipt_id == null) {
          throw new ScanJobError(t("error_ocr_job"));
        }
        const canonicalExpense = await api.get<Expense>(`/expenses/${result.expense_id}`).then((response) => response.data);
        setOcrExpense(canonicalExpense);
      }
      setScanResult(result);
      setForm((f) => ({
        ...f,
        amount: f.amount || (result.amount?.toString() ?? ""),
        currency: result.currency && !f.amount ? result.currency : f.currency,
        tax_amount: f.tax_amount === "0" || !f.tax_amount ? (result.tax_amount?.toString() ?? "0") : f.tax_amount,
        tax_rate: f.tax_rate || (result.tax_rate?.toString() ?? ""),
        date: f.date === new Date().toISOString().slice(0, 10) && result.date ? result.date : f.date,
        merchant: f.merchant || result.merchant || "",
        category_id: f.category_id || (result.category_id?.toString() ?? ""),
        description: f.description || result.description || "",
        raw_ocr_text: result.raw_text || "",
      }));
      if (result.expense_id == null && result.receipt_id == null) {
        setReceiptFiles((prev) => [...prev, { id: crypto.randomUUID(), file }]);
      }
    } catch (e: any) {
      if (e instanceof ScanCancelledError || e?.name === "AbortError") {
        // Cancelled — pre-scan state is already intact (nothing was applied).
        return;
      }
      if (e instanceof ScanTimeoutError) setError(t("error_ocr_timeout"));
      else if (e instanceof ScanJobError) setError(e.detail ?? t("error_ocr_job"));
      else setError(e.response?.data?.detail ?? e.message ?? t("error_ocr_scan"));
    } finally {
      scanAbortRef.current = null;
      scanInFlightRef.current = false;
      setScanProgress(null);
      setIsScanning(false);
    }
  };

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await processFileScan(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isScanning) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isScanning) return;
    const file = e.dataTransfer.files?.[0];
    if (file) await processFileScan(file);
  };

  return (
    <div className="flex flex-col gap-2 max-w-6xl w-full items-start">
      <div className="flex lg:hidden w-full border-b border-border-subtle/80 mb-0.5 bg-card rounded-lg p-0.5" role="tablist" aria-label="Expense views">
        <button
          type="button"
          role="tab"
          id="tab-details"
          aria-controls="panel-details"
          aria-selected={activeMobileTab === 'details'}
          onClick={() => setActiveMobileTab('details')}
          className={clsx("flex-1 min-h-11 py-2 text-center text-sm font-semibold rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            activeMobileTab === 'details' ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" : "text-muted hover:bg-card-hover")}
        >
          {t("mobile_details")}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-receipt"
          aria-controls="panel-receipt"
          aria-selected={activeMobileTab === 'receipt'}
          onClick={() => setActiveMobileTab('receipt')}
          className={clsx("flex-1 min-h-11 py-2 text-center text-sm font-semibold rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            activeMobileTab === 'receipt' ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" : "text-muted hover:bg-card-hover")}
        >
          {t("mobile_receipt")} ({items.length})
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 w-full items-start">
        <form
          id="panel-details"
          role="tabpanel"
          aria-labelledby="tab-details"
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          className={clsx("bg-card rounded-xl shadow-sm p-3 sm:p-6 flex-1 w-full max-w-lg space-y-4", activeMobileTab !== 'details' && "hidden lg:block")}
        >
          {error && <p id="expense-form-error" role="alert" className="text-red-600 text-sm">{error}</p>}

          {savedExpense && savedExpense.currency_original !== "EUR" && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-400">
              {savedExpense.amount_original} {savedExpense.currency_original} → {formatEur(savedExpense.amount_eur)} (rate: {savedExpense.fx_rate.toFixed(4)}{savedExpense.fx_rate_manual ? " manual" : ""})
            </div>
          )}

          {!isEdit && (
            <ReceiptScanner
              isScanning={isScanning}
              scanProgress={scanProgress}
              onCancelScan={cancelScan}
              isDragging={isDragging}
              onScan={handleScan}
              onCameraCapture={handleScan}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => scanInputRef.current?.click()}
              scanInputRef={scanInputRef}
              cameraInputRef={cameraInputRef}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="expense-amount" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_amount")}</label>
              <input id="expense-amount" name="amount" type="number" step="0.01" min="0" inputMode="decimal" required value={form.amount} onChange={setField("amount")}
                className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="expense-currency" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_currency")}</label>
              <select id="expense-currency" name="currency" value={form.currency} onChange={setField("currency")}
                className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100">
                {CURRENCIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
          </div>

          {form.currency !== "EUR" && (
            <FxRateInput
              active={fxRateEditMode}
              currency={form.currency}
              amount={form.amount}
              date={form.date}
              initialRate={currentExpense?.fx_rate ?? null}
              initialManualRate={currentExpense?.fx_rate_manual ? currentExpense.fx_rate ?? null : null}
              onToggle={() => {
                if (fxRateEditMode) {
                  setFxRateEditMode(false);
                  setManualFxRate(null);
                } else {
                  setFxRateEditMode(true);
                }
              }}
              onManualRateChange={setManualFxRate}
            />
          )}

          <div>
            <label htmlFor="expense-merchant" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_merchant")}</label>
            <input id="expense-merchant" name="merchant" type="text" value={form.merchant} onChange={setField("merchant")} placeholder={t("placeholder_merchant")}
              className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="expense-date" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_date")}</label>
              <input id="expense-date" name="date" type="date" required value={form.date} onChange={setField("date")}
                className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="expense-category" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_category")}</label>
              <select id="expense-category" name="category_id" value={form.category_id} onChange={setField("category_id")}
                className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100">
                <option value="">{t("select_category")}</option>
                {categories?.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
          </div>

          <details className="rounded-lg border border-border-subtle bg-background/50 px-3">
            <summary className="min-h-11 cursor-pointer list-none py-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {t("additional_details")}
            </summary>
            <div className="space-y-3 pb-3">
              <div>
                <label htmlFor="expense-description" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_description")}</label>
                <textarea id="expense-description" name="description" value={form.description} onChange={setField("description")} rows={2} placeholder={t("placeholder_description")}
                  className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none dark:bg-slate-800 dark:text-slate-100" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="expense-tax-amount" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_tax_amount")}</label>
                  <input id="expense-tax-amount" name="tax_amount" type="number" step="0.01" min="0" inputMode="decimal" value={form.tax_amount} onChange={setField("tax_amount")}
                    className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100" />
                </div>
                <div>
                  <label htmlFor="expense-tax-rate" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_tax_rate")}</label>
                  <input id="expense-tax-rate" name="tax_rate" type="number" step="0.01" min="0" inputMode="decimal" value={form.tax_rate} onChange={setField("tax_rate")}
                    className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100" />
                </div>
              </div>
            </div>
          </details>

          <div>
            <label htmlFor="expense-receipts" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_receipts")}</label>
            {(highlightReceipts || receiptUploadFailedLocal) && (
              <p role="alert" className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                {t("warning_expense_saved_receipt_failed")}
              </p>
            )}
            <p id="expense-receipts-help" className="text-xs text-muted mb-2">{t("receipt_formats")}</p>
            <input id="expense-receipts" name="receipts" aria-describedby="expense-receipts-help" type="file" accept=".jpg,.jpeg,.png,.pdf,.webp" multiple onChange={addFiles}
              className="w-full min-h-11 text-base lg:text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:border file:border-slate-300 dark:file:border-slate-600 file:rounded-lg file:text-xs file:bg-slate-50 dark:file:bg-slate-800 hover:file:bg-slate-100 dark:hover:file:bg-slate-700" />

            {existingReceipts.length > 0 && (
              <div className="mt-2 space-y-1">
                {existingReceipts.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-muted">
                    <button type="button" onClick={() => downloadBlob(`/expenses/${expense!.id}/receipts/${r.id}`, {}, r.original_name || r.file_path.split("/").pop() || "Receipt")}
                      className="min-h-11 text-left text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px] cursor-pointer">
                      {r.original_name || r.file_path.split("/").pop()}
                    </button>
                    <button
                      type="button"
                      onClick={() => markDeleteReceipt(r.id)}
                      aria-label={t("remove_receipt") || "Remove receipt"}
                      className="min-w-11 min-h-11 inline-flex items-center justify-center text-muted-foreground hover:text-red-500 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {receiptFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {receiptFiles.map((entry, i) => (
                  <div key={entry.id} className="flex items-center gap-2 text-xs text-muted">
                    <span className="truncate max-w-[200px]">{entry.file.name}</span>
                    <span className="text-slate-500 dark:text-slate-400">({(entry.file.size / 1024).toFixed(0)} KB)</span>
                    <button
                      type="button"
                      onClick={() => removeNewFile(i)}
                      aria-label={t("remove_receipt") || "Remove receipt"}
                      className="min-w-11 min-h-11 inline-flex items-center justify-center text-muted-foreground hover:text-red-500 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="expense-form-actions sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:static z-20 flex gap-3 pt-3 pb-3 bg-card border-t border-border lg:border-0">
            <button type="submit" disabled={save.isPending}
              className="min-h-11 px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50">
              {save.isPending
                ? isUploadingReceipts ? t("uploading_receipts") : tc("saving")
                : isEdit ? t("save_changes") : t("create_expense")}
            </button>
            <button type="button" onClick={() => {
                if (!isDirty() || window.confirm(t("guard_unsaved_changes"))) router.back();
              }}
              className="min-h-11 px-5 py-2 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700">
              {tc("cancel")}
            </button>
          </div>
        </form>

        <div
          id="panel-receipt"
          role="tabpanel"
          aria-labelledby="tab-receipt"
          className={clsx("w-full lg:flex-1", activeMobileTab !== 'receipt' && "hidden lg:block")}
        >
          <ReceiptPreview
            items={items}
            activeItem={activeItem}
            zoom={zoom}
            position={position}
            isDraggingImage={isDraggingImage}
            activeReceiptKey={activeReceiptKey}
            onSelectItem={setActiveReceiptKey}
            onZoomIn={() => setZoom((z) => Math.min(3, z + 0.25))}
            onZoomOut={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            onReset={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            sanitizeUrl={sanitizeUrl}
          />
        </div>
      </div>
    </div>
  );
}
