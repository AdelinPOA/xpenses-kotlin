"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Category, Expense, CURRENCIES, API_BASE_URL, OCRScanResult } from "@/lib/api";
import { categoryKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import { X, Camera } from "lucide-react";
import clsx from "clsx";

interface Props {
  expense?: Expense;
  reportId?: number;
  defaultCurrency?: string;
}

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
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
  });
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [deletedReceiptIds, setDeletedReceiptIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [savedExpense, setSavedExpense] = useState<Expense | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<OCRScanResult | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const { data: categories } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
  });

  const existingReceipts = expense?.receipts?.filter((r) => !deletedReceiptIds.has(r.id)) ?? [];

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        amount: parseFloat(form.amount),
        currency: form.currency,
        date: form.date,
        merchant: form.merchant || null,
        description: form.description || null,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        tax_amount: form.tax_amount ? parseFloat(form.tax_amount) : 0,
        tax_rate: form.tax_rate ? parseFloat(form.tax_rate) : null,
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
          for (const file of receiptFiles) {
            fd.append("files", file);
          }
          await api.post(`/expenses/${result.id}/receipts`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
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
        setTimeout(() => router.push(destination), 2000);
      } else {
        router.push(destination);
      }
    },
    onError: (e: any) => setError(e.response?.data?.detail ?? "Failed to save"),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setReceiptFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeNewFile = (index: number) => {
    setReceiptFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const markDeleteReceipt = (receiptId: number) => {
    setDeletedReceiptIds((prev) => new Set(prev).add(receiptId));
  };

  const [isDragging, setIsDragging] = useState(false);

  const processFileScan = async (file: File) => {
    setIsScanning(true);
    setScanResult(null);
    setError("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post<OCRScanResult>("/ocr/scan", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const result = res.data;
      setScanResult(result);

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
      }));

      // Add scanned file to receipt list
      setReceiptFiles((prev) => [...prev, file]);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "OCR scan failed");
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
    <form
      onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 max-w-lg space-y-5"
    >
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {savedExpense && savedExpense.currency_original !== "EUR" && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-400">
          {savedExpense.amount_original} {savedExpense.currency_original} → {formatEur(savedExpense.amount_eur)} (rate: {savedExpense.fx_rate.toFixed(4)})
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
              : "border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/40"
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
          {isScanning ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Analyzing receipt...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Camera className={clsx("w-8 h-8 transition-colors", isDragging ? "text-blue-500" : "text-slate-400")} />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {isDragging ? "Drop your receipt here!" : "Drag & drop receipt here, or click to browse"}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Supports JPG, PNG, WEBP, PDF
              </p>
            </div>
          )}

          {scanResult && (
            <div className={`mt-4 text-xs rounded-lg p-2.5 w-full text-left ${
              scanResult.warnings.length === 0
                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
            }`}>
              {scanResult.amount !== null && (
                <span className="font-semibold">Found: {scanResult.currency ?? ""}{scanResult.amount.toFixed(2)}</span>
              )}
              {scanResult.merchant && <span> at <span className="font-semibold">{scanResult.merchant}</span></span>}
              {scanResult.date && <span> on <span className="font-semibold">{scanResult.date}</span></span>}
              {scanResult.warnings.length > 0 && (
                <div className="mt-1 opacity-75">{scanResult.warnings.join(", ")}</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Amount *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={form.amount}
            onChange={set("amount")}
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Currency *</label>
          <select
            value={form.currency}
            onChange={set("currency")}
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      {/* Tax fields hidden for now
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tax Amount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.tax_amount}
            onChange={set("tax_amount")}
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tax Rate (%)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={form.tax_rate}
            onChange={set("tax_rate")}
            placeholder="e.g. 19"
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>
      */}
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date *</label>
        <input
          type="date"
          required
          value={form.date}
          onChange={set("date")}
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Merchant</label>
        <input
          type="text"
          value={form.merchant}
          onChange={set("merchant")}
          placeholder="e.g. McDonald's, Uber"
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
        <select
          value={form.category_id}
          onChange={set("category_id")}
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
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
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Receipts</label>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.webp"
          multiple
          onChange={addFiles}
          className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:border file:border-slate-300 dark:file:border-slate-600 file:rounded-lg file:text-xs file:bg-slate-50 dark:file:bg-slate-800 hover:file:bg-slate-100 dark:hover:file:bg-slate-700"
        />

        {existingReceipts.length > 0 && (
          <div className="mt-2 space-y-1">
            {existingReceipts.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <a
                  href={`${API_BASE_URL}/expenses/${expense!.id}/receipts/${r.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px]"
                >
                  {r.original_name || r.file_path.split("/").pop()}
                </a>
                <button
                  type="button"
                  onClick={() => markDeleteReceipt(r.id)}
                  className="text-slate-400 dark:text-slate-500 hover:text-red-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {receiptFiles.length > 0 && (
          <div className="mt-2 space-y-1">
            {receiptFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate max-w-[200px]">{f.name}</span>
                <span className="text-slate-300 dark:text-slate-600">({(f.size / 1024).toFixed(0)} KB)</span>
                <button
                  type="button"
                  onClick={() => removeNewFile(i)}
                  className="text-slate-400 dark:text-slate-500 hover:text-red-500"
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
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {save.isPending ? "Saving..." : isEdit ? "Save changes" : "Create expense"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
