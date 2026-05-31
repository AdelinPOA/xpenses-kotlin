"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Category, Expense, CURRENCIES, API_BASE_URL } from "@/lib/api";
import { categoryKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import { X } from "lucide-react";

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
  });
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [deletedReceiptIds, setDeletedReceiptIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [savedExpense, setSavedExpense] = useState<Expense | null>(null);

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

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      className="bg-white rounded-xl shadow-sm p-6 max-w-lg space-y-5"
    >
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {savedExpense && savedExpense.currency_original !== "EUR" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
          {savedExpense.amount_original} {savedExpense.currency_original} → {formatEur(savedExpense.amount_eur)} (rate: {savedExpense.fx_rate.toFixed(4)})
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Amount *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={form.amount}
            onChange={set("amount")}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Currency *</label>
          <select
            value={form.currency}
            onChange={set("currency")}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Date *</label>
        <input
          type="date"
          required
          value={form.date}
          onChange={set("date")}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Merchant</label>
        <input
          type="text"
          value={form.merchant}
          onChange={set("merchant")}
          placeholder="e.g. McDonald's, Uber"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
        <select
          value={form.category_id}
          onChange={set("category_id")}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— Select category —</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={set("description")}
          rows={2}
          placeholder="Brief description..."
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Receipts</label>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.webp"
          multiple
          onChange={addFiles}
          className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:border file:border-slate-300 file:rounded-lg file:text-xs file:bg-slate-50 hover:file:bg-slate-100"
        />

        {existingReceipts.length > 0 && (
          <div className="mt-2 space-y-1">
            {existingReceipts.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs text-slate-500">
                <a
                  href={`${API_BASE_URL}/expenses/${expense!.id}/receipts/${r.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline truncate max-w-[200px]"
                >
                  {r.original_name || r.file_path.split("/").pop()}
                </a>
                <button
                  type="button"
                  onClick={() => markDeleteReceipt(r.id)}
                  className="text-slate-400 hover:text-red-500"
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
              <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                <span className="truncate max-w-[200px]">{f.name}</span>
                <span className="text-slate-300">({(f.size / 1024).toFixed(0)} KB)</span>
                <button
                  type="button"
                  onClick={() => removeNewFile(i)}
                  className="text-slate-400 hover:text-red-500"
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
          className="px-5 py-2 border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
