"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Category, Expense, CURRENCIES, API_BASE_URL, downloadBlob, OCRScanResult } from "@/lib/api";
import { categoryKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import { Camera } from "lucide-react";
import clsx from "clsx";
import { formatEur } from "@/lib/format";
import ReceiptScanner from "./ReceiptScanner";
import FxRateInput from "./FxRateInput";
import ReceiptPreview from "./ReceiptPreview";
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
  fx_rate: string;
  fx_rate_manual: boolean;
}

interface Props {
  expense?: Expense;
  reportId?: number;
  defaultCurrency?: string;
}

export default function ExpenseForm({ expense, reportId, defaultCurrency }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = !!expense;
  const t = useTranslations("expenses");
  const tc = useTranslations("common");

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
    fx_rate: expense?.fx_rate?.toString() ?? "",
    fx_rate_manual: expense?.fx_rate_manual ?? false,
  });
  const [fxRateEditMode, setFxRateEditMode] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<{ id: string; file: File }[]>([]);
  const [deletedReceiptIds, setDeletedReceiptIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [savedExpense, setSavedExpense] = useState<Expense | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<OCRScanResult | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [activeReceiptKey, setActiveReceiptKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeMobileTab, setActiveMobileTab] = useState<'details' | 'receipt'>('details');
  const [isDragging, setIsDragging] = useState(false);

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

  const existingReceipts = expense?.receipts?.filter((r) => !deletedReceiptIds.has(r.id)) ?? [];

  const items = [
    ...existingReceipts.map((r) => ({
      key: `existing-${r.id}`,
      name: r.original_name || r.file_path.split("/").pop() || t("mobile_receipt"),
      url: `${API_BASE_URL}/expenses/${expense!.id}/receipts/${r.id}`,
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
    mutationFn: async () => {
      const manualRate = fxRateEditMode && form.fx_rate ? parseFloat(form.fx_rate) : null;
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
        ...(reportId && !isEdit ? { report_id: reportId } : {}),
      };
      let result: Expense;
      try {
        result = isEdit
          ? await api.patch(`/expenses/${expense.id}`, payload).then((r) => r.data)
          : await api.post("/expenses", payload).then((r) => r.data);
      } catch (e: any) {
        throw new Error(e.response?.data?.detail ?? t("error_save"));
      }
      try {
        for (const rid of deletedReceiptIds) await api.delete(`/expenses/${result.id}/receipts/${rid}`);
        if (receiptFiles.length > 0) {
          const fd = new FormData();
          receiptFiles.forEach(({ file }) => fd.append("files", file));
          await api.post(`/expenses/${result.id}/receipts`, fd);
        }
      } catch (e: any) {
        qc.invalidateQueries({ queryKey: expenseKeys.all });
        qc.invalidateQueries({ queryKey: dashboardKeys.all });
        throw new Error(t("error_receipt_upload"));
      }
      return result;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      const destination = reportId ? `/reports/${reportId}` : "/expenses";
      if (result.currency_original !== "EUR") {
        setSavedExpense(result);
        redirectTimeoutRef.current = setTimeout(() => router.push(destination), 2000);
      } else {
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

  const compressImage = useCallback((file: File): Promise<Blob | File> => {
    const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    if (!isImage) return Promise.resolve(file);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
            else { width = Math.round((width * maxDim) / height); height = maxDim; }
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.8);
        };
        img.onerror = () => resolve(file);
      };
      reader.onerror = () => resolve(file);
    });
  }, []);

  const processFileScan = async (file: File) => {
    setIsScanning(true);
    setScanResult(null);
    setError("");
    try {
      const compressedBlob = await compressImage(file);
      const fd = new FormData();
      fd.append("file", compressedBlob, file.name);
      const res = await api.post("/ocr/scan", fd);
      let result: OCRScanResult;
      if (res.status === 202 && res.data.status_url) {
        let isCompleted = false;
        let attempts = 0;
        const maxAttempts = 60;
        const abortController = new AbortController();
        try {
          while (!isCompleted && attempts < maxAttempts) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1500));
            const statusRes = await api.get(res.data.status_url, { signal: abortController.signal });
            if (statusRes.data.status === "completed") { result = statusRes.data.result; isCompleted = true; }
            else if (statusRes.data.status === "failed") throw new Error(statusRes.data.error || t("error_ocr_job"));
          }
          if (!isCompleted) throw new Error(t("error_ocr_timeout"));
        } finally { abortController.abort(); }
      } else { result = res.data; }
      setScanResult(result!);
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
      setReceiptFiles((prev) => [...prev, { id: crypto.randomUUID(), file }]);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message ?? t("error_ocr_scan"));
    } finally { setIsScanning(false); }
  };

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await processFileScan(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFileScan(file);
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl w-full items-start">
      <div className="flex lg:hidden w-full border-b border-border-subtle/80 mb-1 bg-card rounded-lg p-1">
        <button type="button" onClick={() => setActiveMobileTab('details')}
          aria-pressed={activeMobileTab === 'details'}
          className={clsx("flex-1 min-h-11 py-2 text-center text-xs font-semibold rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            activeMobileTab === 'details' ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" : "text-muted hover:bg-card-hover")}>
          {t("mobile_details")}
        </button>
        <button type="button" onClick={() => setActiveMobileTab('receipt')}
          aria-pressed={activeMobileTab === 'receipt'}
          className={clsx("flex-1 min-h-11 py-2 text-center text-xs font-semibold rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            activeMobileTab === 'receipt' ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" : "text-muted hover:bg-card-hover")}>
          {t("mobile_receipt")} ({items.length})
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          className={clsx("bg-card rounded-xl shadow-sm p-6 flex-1 w-full max-w-lg space-y-5", activeMobileTab !== 'details' && "hidden lg:block")}>
          {error && <p id="expense-form-error" role="alert" className="text-red-600 text-sm">{error}</p>}

          {savedExpense && savedExpense.currency_original !== "EUR" && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-400">
              {savedExpense.amount_original} {savedExpense.currency_original} → {formatEur(savedExpense.amount_eur)} (rate: {savedExpense.fx_rate.toFixed(4)}{savedExpense.fx_rate_manual ? " manual" : ""})
            </div>
          )}

          {!isEdit && (
            <ReceiptScanner
              isScanning={isScanning}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="expense-amount" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_amount")}</label>
              <input id="expense-amount" name="amount" type="number" step="0.01" min="0" inputMode="decimal" required value={form.amount} onChange={setField("amount")}
                className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="expense-currency" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_currency")}</label>
              <select id="expense-currency" name="currency" value={form.currency} onChange={setField("currency")}
                className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100">
                {CURRENCIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
          </div>

          {form.currency !== "EUR" && (
            <FxRateInput
              fxRateEditMode={fxRateEditMode}
              fxRate={form.fx_rate}
              currency={form.currency}
              isEdit={isEdit}
              expenseFxRate={expense?.fx_rate}
              expenseFxRateManual={expense?.fx_rate_manual}
              onToggleMode={() => {
                if (fxRateEditMode) {
                  setFxRateEditMode(false);
                  setForm((f) => ({ ...f, fx_rate: expense?.fx_rate?.toString() ?? "", fx_rate_manual: expense?.fx_rate_manual ?? false }));
                } else {
                  setFxRateEditMode(true);
                  if (!form.fx_rate && isEdit && expense?.fx_rate) setForm((f) => ({ ...f, fx_rate: expense.fx_rate.toString() }));
                }
              }}
              onChange={setField("fx_rate")}
            />
          )}

          <div>
            <label htmlFor="expense-date" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_date")}</label>
            <input id="expense-date" name="date" type="date" required value={form.date} onChange={setField("date")}
              className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100" />
          </div>

          <div>
            <label htmlFor="expense-merchant" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_merchant")}</label>
            <input id="expense-merchant" name="merchant" type="text" value={form.merchant} onChange={setField("merchant")} placeholder={t("placeholder_merchant")}
              className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100" />
          </div>

          <div>
            <label htmlFor="expense-category" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_category")}</label>
            <select id="expense-category" name="category_id" value={form.category_id} onChange={setField("category_id")}
              className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100">
              <option value="">{t("select_category")}</option>
              {categories?.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>

          <div>
            <label htmlFor="expense-description" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_description")}</label>
            <textarea id="expense-description" name="description" value={form.description} onChange={setField("description")} rows={2} placeholder={t("placeholder_description")}
              className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none dark:bg-slate-800 dark:text-slate-100" />
          </div>

          <div>
            <label htmlFor="expense-receipts" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_receipts")}</label>
            <p id="expense-receipts-help" className="text-xs text-muted mb-2">JPG, PNG, PDF or WEBP, up to 10 MB.</p>
            <input id="expense-receipts" name="receipts" aria-describedby="expense-receipts-help" type="file" accept=".jpg,.jpeg,.png,.pdf,.webp" multiple onChange={addFiles}
              className="w-full min-h-11 text-base sm:text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:border file:border-slate-300 dark:file:border-slate-600 file:rounded-lg file:text-xs file:bg-slate-50 dark:file:bg-slate-800 hover:file:bg-slate-100 dark:hover:file:bg-slate-700" />

            {existingReceipts.length > 0 && (
              <div className="mt-2 space-y-1">
                {existingReceipts.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-muted">
                    <button onClick={() => downloadBlob(`/expenses/${expense!.id}/receipts/${r.id}`, {}, r.original_name || r.file_path.split("/").pop() || "Receipt")}
                      className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px] cursor-pointer">
                      {r.original_name || r.file_path.split("/").pop()}
                    </button>
                    <button type="button" onClick={() => markDeleteReceipt(r.id)} className="min-w-11 min-h-11 inline-flex items-center justify-center text-muted-foreground hover:text-red-500"><Camera className="w-3.5 h-3.5" aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}

            {receiptFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {receiptFiles.map((entry, i) => (
                  <div key={entry.id} className="flex items-center gap-2 text-xs text-muted">
                    <span className="truncate max-w-[200px]">{entry.file.name}</span>
                    <span className="text-slate-300 dark:text-slate-600">({(entry.file.size / 1024).toFixed(0)} KB)</span>
                    <button type="button" onClick={() => removeNewFile(i)} className="min-w-11 min-h-11 inline-flex items-center justify-center text-muted-foreground hover:text-red-500"><Camera className="w-3.5 h-3.5" aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:static z-20 flex gap-3 pt-3 pb-3 bg-card border-t border-border lg:border-0">
            <button type="submit" disabled={save.isPending}
              className="min-h-11 px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50">
              {save.isPending ? tc("saving") : isEdit ? t("save_changes") : t("create_expense")}
            </button>
            <button type="button" onClick={() => router.back()}
              className="min-h-11 px-5 py-2 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700">
              {tc("cancel")}
            </button>
          </div>
        </form>

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
  );
}
