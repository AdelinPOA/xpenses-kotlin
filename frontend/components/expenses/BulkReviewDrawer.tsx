"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import api, { bulkUploadExpenses, BulkUploadResult, BulkUploadError, Expense, Category } from "@/lib/api";
import { expenseKeys, categoryKeys } from "@/lib/queryKeys";

interface BulkReviewDrawerProps {
  files: File[];
  isOpen: boolean;
  onClose: () => void;
}

interface RowState {
  expense: Expense;
  saving: boolean;
  deleted: boolean;
}

export default function BulkReviewDrawer({ files, isOpen, onClose }: BulkReviewDrawerProps) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<RowState[]>([]);
  const [uploadErrors, setUploadErrors] = useState<BulkUploadError[]>([]);
  const [dismissedErrors, setDismissedErrors] = useState(false);
  const uploadedRef = useRef(false); // prevent double-fire in Strict Mode

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
    enabled: isOpen,
  });

  const { mutate: runUpload, isPending: uploading } = useMutation({
    mutationFn: () => bulkUploadExpenses(files),
    onSuccess: (result: BulkUploadResult) => {
      setRows(result.created.map((e) => ({ expense: e, saving: false, deleted: false })));
      setUploadErrors(result.errors);
    },
  });

  // Kick off upload once when drawer opens with new files
  useEffect(() => {
    if (isOpen && files.length > 0 && !uploadedRef.current) {
      uploadedRef.current = true;
      setRows([]);
      setUploadErrors([]);
      setDismissedErrors(false);
      runUpload();
    }
    if (!isOpen) {
      uploadedRef.current = false;
    }
  }, [isOpen, files, runUpload]);

  async function patchField(expenseId: number, field: string, value: string | number | null) {
    setRows((prev) =>
      prev.map((r) => (r.expense.id === expenseId ? { ...r, saving: true } : r))
    );
    try {
      const { data } = await api.patch<Expense>(`/expenses/${expenseId}`, { [field]: value });
      setRows((prev) =>
        prev.map((r) => (r.expense.id === expenseId ? { ...r, expense: data, saving: false } : r))
      );
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.expense.id === expenseId ? { ...r, saving: false } : r))
      );
    }
  }

  async function deleteRow(expenseId: number) {
    setRows((prev) =>
      prev.map((r) => (r.expense.id === expenseId ? { ...r, saving: true } : r))
    );
    try {
      await api.delete(`/expenses/${expenseId}`);
      setRows((prev) =>
        prev.map((r) => (r.expense.id === expenseId ? { ...r, deleted: true, saving: false } : r))
      );
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.expense.id === expenseId ? { ...r, saving: false } : r))
      );
    }
  }

  function handleClose() {
    queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    onClose();
  }

  const visibleRows = rows.filter((r) => !r.deleted);
  const activeCategories = categories.filter((c) => c.is_active);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={handleClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Review bulk upload</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {uploading
                ? `Processing ${files.length} receipt${files.length !== 1 ? "s" : ""}…`
                : `${visibleRows.length} draft expense${visibleRows.length !== 1 ? "s" : ""} created — edit before saving`}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Upload in progress */}
          {uploading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-slate-600 dark:text-slate-400 font-medium">
                Running OCR on {files.length} file{files.length !== 1 ? "s" : ""}…
              </p>
              <p className="text-xs text-slate-400">This may take a moment</p>
            </div>
          )}

          {/* Error banner */}
          {!uploading && uploadErrors.length > 0 && !dismissedErrors && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  {uploadErrors.length} file{uploadErrors.length !== 1 ? "s" : ""} could not be processed
                </p>
                <ul className="space-y-0.5 text-amber-700 dark:text-amber-400">
                  {uploadErrors.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.filename}</span>: {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={() => setDismissedErrors(true)} className="text-amber-500 hover:text-amber-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Expense rows */}
          {!uploading &&
            visibleRows.map(({ expense, saving }) => (
              <BulkExpenseRow
                key={expense.id}
                expense={expense}
                categories={activeCategories}
                saving={saving}
                onPatch={(field, value) => patchField(expense.id, field, value)}
                onDelete={() => deleteRow(expense.id)}
              />
            ))}

          {/* Empty state */}
          {!uploading && visibleRows.length === 0 && uploadErrors.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <CheckCircle className="w-10 h-10" />
              <p>No expenses created</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!uploading && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All expenses are saved as <span className="font-semibold">draft</span>. Assign to a report when ready.
            </p>
            <button
              onClick={handleClose}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              Done reviewing
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Inline-editable row ────────────────────────────────────────────────────

interface BulkExpenseRowProps {
  expense: Expense;
  categories: Category[];
  saving: boolean;
  onPatch: (field: string, value: string | number | null) => void;
  onDelete: () => void;
}

function BulkExpenseRow({ expense, categories, saving, onPatch, onDelete }: BulkExpenseRowProps) {
  const receiptUrl = expense.receipts[0]
    ? `/api/expenses/${expense.id}/receipts/${expense.receipts[0].id}`
    : null;

  return (
    <div className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
      {saving && (
        <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 rounded-xl flex items-center justify-center z-10">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Receipt thumbnail */}
        {receiptUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={receiptUrl}
            alt="Receipt"
            className="w-14 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0 bg-white"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 shrink-0 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-300 text-xs">
            No img
          </div>
        )}

        <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
          {/* Merchant */}
          <div className="col-span-2">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Merchant</label>
            <input
              type="text"
              defaultValue={expense.merchant ?? ""}
              onBlur={(e) => onPatch("merchant", e.target.value || null)}
              placeholder="Merchant name"
              className="w-full mt-0.5 px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Amount</label>
            <div className="flex gap-1 mt-0.5">
              <input
                type="number"
                step="0.01"
                min="0"
                defaultValue={expense.amount_original}
                onBlur={(e) => onPatch("amount", parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                defaultValue={expense.currency_original}
                onBlur={(e) => onPatch("currency", e.target.value.toUpperCase() || "EUR")}
                maxLength={3}
                className="w-16 px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Date</label>
            <input
              type="date"
              defaultValue={expense.date}
              onBlur={(e) => onPatch("date", e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category */}
          <div className="col-span-2">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Category</label>
            <select
              defaultValue={expense.category_id ?? ""}
              onChange={(e) => onPatch("category_id", e.target.value ? parseInt(e.target.value) : null)}
              className="w-full mt-0.5 px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— No category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="col-span-2">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Description</label>
            <input
              type="text"
              defaultValue={expense.description ?? ""}
              onBlur={(e) => onPatch("description", e.target.value || null)}
              placeholder="Optional description"
              className="w-full mt-0.5 px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title="Delete this expense"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
