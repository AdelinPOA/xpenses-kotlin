"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
 import api, { bulkUploadExpenses, BulkUploadResult, BulkUploadError, Expense, Category } from "@/lib/api";
 import { expenseKeys, categoryKeys } from "@/lib/queryKeys";
 import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

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
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<RowState[]>([]);
  const [uploadErrors, setUploadErrors] = useState<BulkUploadError[]>([]);
  const [dismissedErrors, setDismissedErrors] = useState(false);
  const uploadedRef = useRef(false); // prevent double-fire in Strict Mode
  useBodyScrollLock(isOpen);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
    enabled: isOpen,
    staleTime: 300_000,
    gcTime: 600_000,
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const visibleRows = rows.filter((r) => !r.deleted);
  const activeCategories = categories.filter((c) => c.is_active);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-review-title"
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-card shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] border-b border-border">
          <div>
            <h2 id="bulk-review-title" className="text-lg font-bold text-slate-900 dark:text-white">{t("bulk_heading")}</h2>
            <p className="text-sm text-muted">
              {uploading
                ? t("processing_receipts", { count: files.length })
                : t("drafts_created", { count: visibleRows.length })}
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label={tc("close") || "Close review"}
            className="min-w-11 min-h-11 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="w-5 h-5 text-slate-500" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Upload in progress */}
          {uploading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-slate-600 dark:text-slate-400 font-medium">
                {t("running_ocr", { count: files.length })}
              </p>
              <p className="text-xs text-slate-400">{t("may_take_moment")}</p>
            </div>
          )}

          {/* Error banner */}
          {!uploading && uploadErrors.length > 0 && !dismissedErrors && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  {t("files_not_processed", { count: uploadErrors.length })}
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
              <p>{t("bulk_no_expenses")}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!uploading && (
          <div className="px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-border flex items-center justify-between gap-4">
            <p className="text-xs text-muted">
              {t.rich("bulk_footer_note", { b: (chunks) => <span className="font-semibold">{chunks}</span> })}
            </p>
            <button
              onClick={handleClose}
              className="px-5 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              {t("done_reviewing")}
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
  const t = useTranslations("expenses");
  const receiptUrl = expense.receipts[0]
    ? `/api/expenses/${expense.id}/receipts/${expense.receipts[0].id}`
    : null;
  return (
    <div className="relative rounded-xl border border-border bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
      {saving && (
        <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 rounded-xl flex items-center justify-center z-10">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Receipt thumbnail */}
        {receiptUrl ? (
          <img
            src={receiptUrl}
            alt={t("table_receipt")}
            className="w-14 h-14 object-cover rounded-lg border border-border shrink-0 bg-white"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-lg border border-dashed border-input-border shrink-0 bg-input flex items-center justify-center text-slate-300 text-xs">
            {t("bulk_no_img")}
          </div>
        )}

        <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
          {/* Merchant */}
          <div className="col-span-2">
            <label className="text-xs text-muted font-medium">{t("bulk_merchant")}</label>
            <input
              type="text"
              defaultValue={expense.merchant ?? ""}
              onBlur={(e) => onPatch("merchant", e.target.value || null)}
              placeholder={t("bulk_merchant_placeholder")}
              className="w-full mt-0.5 px-2 py-1.5 text-base sm:text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs text-muted font-medium">{t("bulk_amount")}</label>
            <div className="flex gap-1 mt-0.5">
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                defaultValue={expense.amount_original}
                onBlur={(e) => onPatch("amount", parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 text-base sm:text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="text"
                defaultValue={expense.currency_original}
                onBlur={(e) => onPatch("currency", e.target.value.toUpperCase() || "EUR")}
                maxLength={3}
                className="w-16 px-2 py-1.5 text-base sm:text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary uppercase"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-muted font-medium">{t("bulk_date")}</label>
            <input
              type="date"
              defaultValue={expense.date}
              onBlur={(e) => onPatch("date", e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 text-base sm:text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Category */}
          <div className="col-span-2">
            <label className="text-xs text-muted font-medium">{t("bulk_category")}</label>
            <select
              defaultValue={expense.category_id ?? ""}
              onChange={(e) => onPatch("category_id", e.target.value ? parseInt(e.target.value) : null)}
              className="w-full mt-0.5 px-2 py-1.5 text-base sm:text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t("bulk_no_category")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="col-span-2">
            <label className="text-xs text-muted font-medium">{t("bulk_description")}</label>
            <input
              type="text"
              defaultValue={expense.description ?? ""}
              onBlur={(e) => onPatch("description", e.target.value || null)}
              placeholder={t("bulk_description_placeholder")}
              className="w-full mt-0.5 px-2 py-1.5 text-base sm:text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={onDelete}
          aria-label={t("bulk_delete") || "Delete draft"}
          title={t("bulk_delete")}
          className="shrink-0 min-w-11 min-h-11 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
