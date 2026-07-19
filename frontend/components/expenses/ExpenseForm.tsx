"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Category, Expense, CURRENCIES, API_BASE_URL, downloadBlob, OCRScanResult } from "@/lib/api";
import { categoryKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import { X, Camera } from "lucide-react";
import clsx from "clsx";

interface Props {
  expense?: Expense;
  reportId?: number;
  defaultCurrency?: string;
}

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(amount);
}

export default function ExpenseForm({ expense, reportId, defaultCurrency }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = !!expense;

  const [form, setForm] = useState({
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

  const handlePointerUp = () => {
    setIsDraggingImage(false);
  };

  const objectUrlsRef = useRef<Map<File, string>>(new Map());
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getObjectUrl = (file: File) => {
    if (!objectUrlsRef.current.has(file)) {
      objectUrlsRef.current.set(file, URL.createObjectURL(file));
    }
    return objectUrlsRef.current.get(file)!;
  };

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [activeReceiptKey]);

  const { data: categories } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
  });

  const existingReceipts = expense?.receipts?.filter((r) => !deletedReceiptIds.has(r.id)) ?? [];

  const items = [
    ...existingReceipts.map((r) => ({
      key: `existing-${r.id}`,
      name: r.original_name || r.file_path.split("/").pop() || "Receipt",
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
        if (isEdit) {
          result = await api.patch(`/expenses/${expense.id}`, payload).then((r) => r.data);
        } else {
          result = await api.post("/expenses", payload).then((r) => r.data);
        }
      } catch (e: any) {
        throw new Error(e.response?.data?.detail ?? "Failed to save expense details");
      }

      try {
        for (const rid of deletedReceiptIds) {
          await api.delete(`/expenses/${result.id}/receipts/${rid}`);
        }

        if (receiptFiles.length > 0) {
          const fd = new FormData();
          for (const { file } of receiptFiles) {
            fd.append("files", file);
          }
          await api.post(`/expenses/${result.id}/receipts`, fd);
        }
      } catch (e: any) {
        qc.invalidateQueries({ queryKey: expenseKeys.all });
        qc.invalidateQueries({ queryKey: dashboardKeys.all });
        throw new Error("Expense saved, but failed to upload or delete some receipts.");
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
    onError: (e: any) => setError(e.message ?? e.response?.data?.detail ?? "Failed to save"),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setReceiptFiles((prev) => [...prev, ...files.map((f) => ({ id: crypto.randomUUID(), file: f }))]);
    e.target.value = "";
  };

  const removeNewFile = (index: number) => {
    setReceiptFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const markDeleteReceipt = (receiptId: number) => {
    setDeletedReceiptIds((prev) => new Set(prev).add(receiptId));
  };

  const [isDragging, setIsDragging] = useState(false);

  const compressImage = (file: File): Promise<Blob | File> => {
    const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    if (!isImage) {
      return Promise.resolve(file);
    }
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
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => resolve(blob || file),
            "image/jpeg",
            0.8
          );
        };
        img.onerror = () => resolve(file);
      };
      reader.onerror = () => resolve(file);
    });
  };

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
            if (statusRes.data.status === "completed") {
              result = statusRes.data.result;
              isCompleted = true;
            } else if (statusRes.data.status === "failed") {
              throw new Error(statusRes.data.error || "OCR job failed");
            }
          }
          if (!isCompleted) {
            throw new Error("OCR job timed out after 90 seconds");
          }
        } finally {
          abortController.abort();
        }
      } else {
        result = res.data;
      }

      setScanResult(result!);

      // Pre-fill empty fields only
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

      // Add scanned file to receipt list
      setReceiptFiles((prev) => [...prev, { id: crypto.randomUUID(), file }]);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message ?? "OCR scan failed");
    } finally {
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
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFileScan(file);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl w-full items-start">
      {/* Mobile Tab Switcher */}
      <div className="flex lg:hidden w-full border-b border-border-subtle/80 mb-1 bg-card rounded-lg p-1">
        <button
          type="button"
          onClick={() => setActiveMobileTab('details')}
          className={clsx(
            "flex-1 py-2 text-center text-xs font-semibold rounded-md transition-colors",
            activeMobileTab === 'details'
              ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
              : "text-muted hover:bg-card-hover"
          )}
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileTab('receipt')}
          className={clsx(
            "flex-1 py-2 text-center text-xs font-semibold rounded-md transition-colors",
            activeMobileTab === 'receipt'
              ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
              : "text-muted hover:bg-card-hover"
          )}
        >
          Receipt ({items.length})
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
        {/* Form Details */}
        <form
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          className={clsx(
            "bg-card rounded-xl shadow-sm p-6 flex-1 w-full max-w-lg space-y-5",
            activeMobileTab !== 'details' && "hidden lg:block"
          )}
        >
          {error && <p className="text-red-600 text-sm">{error}</p>}

          {savedExpense && savedExpense.currency_original !== "EUR" && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-400">
              {savedExpense.amount_original} {savedExpense.currency_original} → {formatEur(savedExpense.amount_eur)} (rate: {savedExpense.fx_rate.toFixed(4)}{savedExpense.fx_rate_manual ? " manual" : ""})
            </div>
          )}

          {/* OCR Scan Drop Zone */}
          {!isEdit && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={clsx(
                "border border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[120px]",
                isDragging
                  ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-input-border hover:bg-card-hover/40"
              )}
              onClick={() => scanInputRef.current?.click()}
            >
              <input
                ref={scanInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,.webp"
                onChange={handleScan}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleScan}
                className="hidden"
              />
              {isScanning ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Analyzing receipt...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Camera className={clsx("w-8 h-8 transition-colors", isDragging ? "text-blue-500" : "text-slate-400")} />
                  <p className="hidden lg:block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {isDragging ? "Drop your receipt here!" : "Drag & drop receipt here, or click to browse"}
                  </p>
                  <p className="lg:hidden text-sm font-medium text-slate-700 dark:text-slate-300">
                    Tap to photograph or choose a receipt
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Supports JPG, PNG, PDF, WEBP up to 10MB
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Mobile: direct camera capture */}
          {!isEdit && (
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isScanning}
              className="lg:hidden flex items-center justify-center gap-2 w-full py-2.5 border border-input-border rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-input hover:bg-card-hover disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              Take photo
            </button>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Amount *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                required
                value={form.amount}
                onChange={set("amount")}
                className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Currency *</label>
              <select
                value={form.currency}
                onChange={set("currency")}
                className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {form.currency !== "EUR" && (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  FX Rate{" "}
                  <span className={clsx(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
                    fxRateEditMode
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                      : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                  )}>
                    {fxRateEditMode ? "Manual" : "Auto"}
                  </span>
                </label>
                <div className="flex items-center gap-1">
                  {fxRateEditMode ? (
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      inputMode="decimal"
                      value={form.fx_rate}
                      onChange={set("fx_rate")}
                      className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
                    />
                  ) : (
                    <span className="text-sm text-slate-600 dark:text-slate-400 py-2">
                      {isEdit && expense?.fx_rate ? `1 ${form.currency} = ${expense.fx_rate.toFixed(4)} EUR` : "Will be fetched on save"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (fxRateEditMode) {
                        setFxRateEditMode(false);
                        setForm((f) => ({ ...f, fx_rate: expense?.fx_rate?.toString() ?? "", fx_rate_manual: expense?.fx_rate_manual ?? false }));
                      } else {
                        setFxRateEditMode(true);
                        if (!form.fx_rate && isEdit && expense?.fx_rate) {
                          setForm((f) => ({ ...f, fx_rate: expense.fx_rate.toString() }));
                        }
                      }
                    }}
                    className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                    title={fxRateEditMode ? "Revert to auto" : "Edit rate manually"}
                  >
                    {fxRateEditMode ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date *</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={set("date")}
              className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Merchant</label>
            <input
              type="text"
              value={form.merchant}
              onChange={set("merchant")}
              placeholder="e.g. McDonald's, Uber"
              className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
            <select
              value={form.category_id}
              onChange={set("category_id")}
              className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">— Select category —</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={set("description")}
              rows={2}
              placeholder="Brief description..."
              className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Receipts</label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,.webp"
              multiple
              onChange={addFiles}
              className="w-full text-base sm:text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:border file:border-slate-300 dark:file:border-slate-600 file:rounded-lg file:text-xs file:bg-slate-50 dark:file:bg-slate-800 hover:file:bg-slate-100 dark:hover:file:bg-slate-700"
            />

            {existingReceipts.length > 0 && (
              <div className="mt-2 space-y-1">
                {existingReceipts.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-muted">
                    <button
                      onClick={() => downloadBlob(`/expenses/${expense!.id}/receipts/${r.id}`, {}, r.original_name || r.file_path.split("/").pop() || "Receipt")}
                      className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px] cursor-pointer"
                    >
                      {r.original_name || r.file_path.split("/").pop()}
                    </button>
                    <button
                      type="button"
                      onClick={() => markDeleteReceipt(r.id)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
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
                    <span className="text-slate-300 dark:text-slate-600">({(entry.file.size / 1024).toFixed(0)} KB)</span>
                    <button
                      type="button"
                      onClick={() => removeNewFile(i)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={save.isPending}
              className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              {save.isPending ? "Saving..." : isEdit ? "Save changes" : "Create expense"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Preview Panel */}
        <div
          className={clsx(
            "w-full lg:flex-1 lg:sticky lg:top-6 bg-card rounded-xl shadow-sm border border-border-subtle/80 p-6 flex flex-col min-h-[450px] self-stretch",
            activeMobileTab !== 'receipt' && "hidden lg:flex"
          )}
        >
          <div className="border-b border-border-subtle pb-3 mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Receipt Preview</h2>
            {items.length > 0 && (
              <span className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                {items.length} {items.length === 1 ? 'file' : 'files'}
              </span>
            )}
          </div>

          {items.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-4 border-b border-border-subtle pb-3">
              {items.map((it, idx) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => setActiveReceiptKey(it.key)}
                  className={clsx(
                    "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors",
                    (activeReceiptKey === it.key || (activeReceiptKey === null && idx === 0))
                      ? "bg-primary text-white shadow-sm"
                      : "bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                  )}
                >
                  File {idx + 1}
                </button>
              ))}
            </div>
          )}

          {activeItem ? (
            <div className="flex-1 flex flex-col justify-between h-full">
              <div className="mb-3">
                <p className="text-xs font-medium text-foreground truncate">{activeItem.name}</p>
              </div>
              {activeItem.isImage ? (
                <div className="relative group flex-1 flex flex-col items-center bg-background/40 rounded-lg overflow-hidden border border-border-subtle min-h-[400px]">
                  {/* Zoom Controls */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-900/90 dark:bg-slate-800/90 text-white rounded-lg p-1.5 shadow-lg z-10 select-none">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                      className="p-1 hover:bg-slate-800 dark:hover:bg-slate-700 rounded text-xs font-bold w-11 h-11 lg:w-7 lg:h-7 flex items-center justify-center"
                      title="Zoom Out"
                    >
                      -
                    </button>
                    <span className="text-[10px] font-mono w-10 text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                      className="p-1 hover:bg-slate-800 dark:hover:bg-slate-700 rounded text-xs font-bold w-11 h-11 lg:w-7 lg:h-7 flex items-center justify-center"
                      title="Zoom In"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}
                      className="p-1 hover:bg-slate-800 dark:hover:bg-slate-700 rounded text-[10px] px-1.5 font-medium ml-1 h-11 lg:h-7 flex items-center"
                      title="Reset Zoom"
                    >
                      Reset
                    </button>
                  </div>

                  <div
                    className={clsx(
                      "flex-1 w-full flex items-center justify-center p-4 overflow-hidden min-h-[350px] touch-none",
                      zoom > 1 ? "cursor-grab" : ""
                    )}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <img
                      src={activeItem.url}
                      alt={activeItem.name}
                      style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                        transformOrigin: "center center",
                        cursor: zoom > 1 ? (isDraggingImage ? 'grabbing' : 'grab') : 'default'
                      }}
                      className={clsx(
                        "max-h-[500px] max-w-full object-contain rounded-md select-none pointer-events-none",
                        !isDraggingImage && "transition-transform duration-200"
                      )}
                    />
                  </div>
                  
                  <a
                    href={activeItem.url}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white text-xs px-2.5 py-1.5 rounded-md backdrop-blur-sm transition-colors duration-150"
                  >
                    View Fullscreen
                  </a>
                </div>
              ) : activeItem.isPdf ? (
                <div className="flex-1 flex flex-col min-h-[350px] gap-3">
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                      PDF preview not loading? You can view or download it directly.
                    </p>
                    <a
                      href={activeItem.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
                    >
                      Open PDF in New Tab
                    </a>
                  </div>
                  <iframe
                    src={activeItem.url}
                    className="hidden lg:block w-full flex-1 rounded-lg border border-border min-h-[350px]"
                    title="PDF Preview"
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-slate-400">
                  <p className="text-sm">No preview available for this file type.</p>
                  <a
                    href={activeItem.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border rounded-xl p-8 text-center min-h-[350px]">
              <Camera className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3 animate-pulse" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">No Receipt Selected</h3>
              <p className="text-xs text-muted max-w-[200px]">
                Upload or scan a receipt to view its preview here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
