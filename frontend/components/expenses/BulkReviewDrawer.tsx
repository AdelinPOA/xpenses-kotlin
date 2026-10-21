"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import api, {
  type BulkUploadResult,
  type BulkUploadError,
  type Expense,
  type Category,
} from "@/lib/api";
import { expenseKeys, categoryKeys } from "@/lib/queryKeys";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

interface BulkReviewDrawerProps {
  files: File[];
  isOpen: boolean;
  onClose: () => void;
}
type Values = Record<
  "merchant" | "amount" | "currency" | "date" | "category_id" | "description",
  string
>;
type Field = keyof Values;
// Newer servers identify the already-created Expense on attachment failures.
// Legacy errors remain visible, but are never guessed/matched to an Expense by filename.
type UploadError = BulkUploadError & {
  expense_id?: number;
  file_index?: number;
};
interface RowState {
  expense: Expense;
  values: Values;
  saved: Values;
  saving: boolean;
  deleting: boolean;
  deleted: boolean;
  error: boolean;
  /** Fields whose last transport outcome has not been acknowledged. */
  uncertain: Field[];
  deleteError: boolean;
}
function valuesOf(expense: Expense): Values {
  return {
    merchant: expense.merchant ?? "",
    amount: String(expense.amount_original),
    currency: expense.currency_original,
    date: expense.date,
    category_id: expense.category_id == null ? "" : String(expense.category_id),
    description: expense.description ?? "",
  };
}
function dirty(row: RowState) {
  return (Object.keys(row.values) as Field[]).some(
    (field) => row.values[field] !== row.saved[field],
  );
}
function fieldsToSave(row: RowState): Field[] {
  return (Object.keys(row.values) as Field[]).filter(
    (field) =>
      row.values[field] !== row.saved[field] || row.uncertain.includes(field),
  );
}
function patchOf(values: Values, fields: Field[]) {
  const patch: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const value = values[field];
    if (field === "category_id" && !value) {
      // Nullable PATCH fields historically mean omit. Clearing is explicit.
      patch.clear_category = true;
    } else {
      patch[field] =
        field === "amount" || field === "category_id" ? Number(value) : value;
    }
  }
  return patch;
}
function acknowledged(field: Field, sent: string, received: string): boolean {
  // The server may normalize a decimal's representation (20.00 -> 20).
  return field === "amount"
    ? Number(sent) === Number(received)
    : sent === received;
}
function unfinished(row: RowState): boolean {
  return (
    dirty(row) ||
    row.error ||
    row.uncertain.length > 0 ||
    row.saving ||
    row.deleting
  );
}

export default function BulkReviewDrawer({
  files,
  isOpen,
  onClose,
}: BulkReviewDrawerProps) {
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<RowState[]>([]);
  const rowsRef = useRef<RowState[]>([]);
  const [uploadErrors, setUploadErrors] = useState<UploadError[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [uploadFinished, setUploadFinished] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [receiptRetrying, setReceiptRetrying] = useState<number | null>(null);
  const uploadedRef = useRef(false);
  const batchKey = useRef("");
  const requested = useRef(new Set<number>());
  const running = useRef(new Set<number>());
  const uploadingRef = useRef(false);
  const receiptRetryRef = useRef(false);
  useBodyScrollLock(isOpen);

  const updateRows = useCallback((update: (rows: RowState[]) => RowState[]) => {
    rowsRef.current = update(rowsRef.current);
    setRows(rowsRef.current);
  }, []);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
    enabled: isOpen,
    staleTime: 300_000,
    gcTime: 600_000,
  });

  useEffect(() => {
    if (!isOpen) {
      uploadedRef.current = false;
      return;
    }
    if (!files.length || uploadedRef.current) return;
    uploadedRef.current = true;
    batchKey.current = crypto.randomUUID();
    uploadingRef.current = true;
    setUploading(true);
    setUploadFailed(false);
    setUploadFinished(false);
    setUploadErrors([]);
    setCloseBlocked(false);
    updateRows(() => []);
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    // Never automatically retry an ambiguous batch. Known-ID recovery below only attaches a Receipt.
    api
      .post<BulkUploadResult>("/expenses/bulk-upload", form, {
        headers: { "Idempotency-Key": batchKey.current },
      })
      .then(({ data }) => {
        updateRows(() =>
          data.created.map((expense) => ({
            expense,
            values: valuesOf(expense),
            saved: valuesOf(expense),
            saving: false,
            deleting: false,
            deleted: false,
            error: false,
            uncertain: [],
            deleteError: false,
          })),
        );
        setUploadErrors(data.errors);
        queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      })
      .catch(() => setUploadFailed(true))
      .finally(() => {
        uploadingRef.current = false;
        setUploading(false);
        setUploadFinished(true);
      });
  }, [files, isOpen, queryClient, updateRows]);

  function editField(id: number, field: Field, value: string) {
    updateRows((previous) =>
      previous.map((row) =>
        row.expense.id === id
          ? { ...row, values: { ...row.values, [field]: value } }
          : row,
      ),
    );
  }

  async function saveRow(id: number) {
    requested.current.add(id);
    if (running.current.has(id)) return;
    running.current.add(id);
    try {
      while (requested.current.delete(id)) {
        const row = rowsRef.current.find((row) => row.expense.id === id);
        if (!row || row.deleted || row.deleting) break;
        const fields = fieldsToSave(row);
        if (!fields.length) {
          // A corrected local validation error has no uncertain remote write.
          updateRows((previous) =>
            previous.map((current) =>
              current.expense.id === id
                ? { ...current, error: false }
                : current,
            ),
          );
          break;
        }
        const values = { ...row.values };
        if (
          !values.amount.trim() ||
          !Number.isFinite(Number(values.amount)) ||
          Number(values.amount) < 0 ||
          !/^[A-Z]{3}$/.test(values.currency) ||
          !values.date
        ) {
          updateRows((previous) =>
            previous.map((row) =>
              row.expense.id === id ? { ...row, error: true } : row,
            ),
          );
          break;
        }
        updateRows((previous) =>
          previous.map((row) =>
            row.expense.id === id
              ? { ...row, saving: true, error: false }
              : row,
          ),
        );
        try {
          const { data } = await api.patch<Expense>(
            `/expenses/${id}`,
            patchOf(values, fields),
          );
          const saved = valuesOf(data);
          const rejected = fields.filter(
            (field) => !acknowledged(field, values[field], saved[field]),
          );
          // HTTP success is not field-level acknowledgement. Trust the returned
          // values while preserving any newer edits made during this request.
          updateRows((previous) =>
            previous.map((current) => {
              if (current.expense.id !== id) return current;
              const visible = { ...current.values };
              for (const field of fields) {
                if (
                  !rejected.includes(field) &&
                  visible[field] === values[field]
                )
                  visible[field] = saved[field];
              }
              return {
                ...current,
                expense: data,
                values: visible,
                saved,
                uncertain: [
                  ...new Set([
                    ...current.uncertain.filter(
                      (field) => !fields.includes(field),
                    ),
                    ...rejected,
                  ]),
                ],
                error: rejected.length > 0,
              };
            }),
          );
          queryClient.invalidateQueries({ queryKey: expenseKeys.all });
          if (rejected.length) {
            requested.current.delete(id);
            break;
          }
        } catch {
          requested.current.delete(id);
          updateRows((previous) =>
            previous.map((row) =>
              row.expense.id === id
                ? {
                    ...row,
                    error: true,
                    uncertain: [...new Set([...row.uncertain, ...fields])],
                  }
                : row,
            ),
          );
          break;
        }
      }
    } finally {
      running.current.delete(id);
      updateRows((previous) =>
        previous.map((row) =>
          row.expense.id === id ? { ...row, saving: false } : row,
        ),
      );
    }
  }

  async function deleteRow(id: number) {
    const current = rowsRef.current.find((row) => row.expense.id === id);
    if (!current || current.saving || current.deleting) return;
    updateRows((previous) =>
      previous.map((row) =>
        row.expense.id === id
          ? { ...row, deleting: true, deleteError: false }
          : row,
      ),
    );
    try {
      await api.delete(`/expenses/${id}`);
      updateRows((previous) =>
        previous.map((row) =>
          row.expense.id === id ? { ...row, deleted: true } : row,
        ),
      );
      setUploadErrors((previous) =>
        previous.filter((error) => error.expense_id !== id),
      );
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    } catch {
      updateRows((previous) =>
        previous.map((row) =>
          row.expense.id === id ? { ...row, deleteError: true } : row,
        ),
      );
    } finally {
      updateRows((previous) =>
        previous.map((row) =>
          row.expense.id === id ? { ...row, deleting: false } : row,
        ),
      );
    }
  }

  async function retryReceipt(error: UploadError) {
    if (
      receiptRetryRef.current ||
      error.expense_id == null ||
      error.file_index == null ||
      !files[error.file_index]
    )
      return;
    receiptRetryRef.current = true;
    setReceiptRetrying(error.expense_id);
    const form = new FormData();
    form.append("files", files[error.file_index]);
    try {
      await api.post(`/expenses/${error.expense_id}/receipts`, form, {
        headers: {
          "Idempotency-Key": `${batchKey.current}:receipt:${error.file_index}`,
        },
      });
      setUploadErrors((previous) => previous.filter((item) => item !== error));
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    } catch {
      // Keep the known Expense ID and source File for the next retry, including response loss.
    } finally {
      receiptRetryRef.current = false;
      setReceiptRetrying(null);
    }
  }

  const handleClose = useCallback(() => {
    if (
      uploadingRef.current ||
      receiptRetryRef.current ||
      rowsRef.current.some((row) => !row.deleted && unfinished(row))
    ) {
      setCloseBlocked(true);
      return;
    }
    if (
      uploadErrors.some((error) => error.expense_id != null) &&
      !window.confirm(t("bulk_close_missing_receipts"))
    )
      return;
    queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    onClose();
  }, [onClose, queryClient, t, uploadErrors]);

  useEffect(() => {
    if (!isOpen) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        uploadingRef.current ||
        receiptRetryRef.current ||
        uploadErrors.some((error) => error.expense_id != null) ||
        rowsRef.current.some((row) => !row.deleted && unfinished(row))
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("keydown", keydown);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [handleClose, isOpen, uploadErrors]);

  const visibleRows = rows.filter((row) => !row.deleted);
  const incomplete =
    uploadFailed ||
    uploadErrors.length > 0 ||
    visibleRows.some((row) => unfinished(row) || row.deleteError);
  if (!isOpen) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-review-title"
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-card shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] border-b border-border">
          <div>
            <h2 id="bulk-review-title" className="text-lg font-bold">
              {t("bulk_heading")}
            </h2>
            <p className="text-sm text-muted">
              {uploading
                ? t("processing_receipts", { count: files.length })
                : uploadFailed
                  ? t("bulk_upload_unconfirmed")
                  : t("bulk_created_autosave", { count: visibleRows.length })}
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label={tc("close")}
            className="min-w-11 min-h-11 rounded-lg flex items-center justify-center hover:bg-card-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {closeBlocked && (
            <p
              role="alert"
              className="text-sm text-amber-700 dark:text-amber-300"
            >
              {t("bulk_close_blocked")}
            </p>
          )}
          {uploading && (
            <div
              role="status"
              className="flex flex-col items-center py-16 gap-4"
            >
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p>{t("running_ocr", { count: files.length })}</p>
              <p className="text-sm text-muted">{t("may_take_moment")}</p>
            </div>
          )}
          {uploadFailed && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500 p-4 space-y-2"
            >
              <AlertCircle className="w-5 h-5" />
              <p>{t("bulk_upload_uncertain_help")}</p>
              <a href="/expenses" className="underline">
                {t("bulk_check_expenses")}
              </a>
            </div>
          )}
          {!uploading && uploadErrors.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500 p-3 text-sm space-y-2"
            >
              <p className="font-semibold">
                {t("files_not_processed", { count: uploadErrors.length })}
              </p>
              <ul className="space-y-3">
                {uploadErrors.map((error, index) => (
                  <li
                    key={`${error.filename}-${index}`}
                    className="break-words"
                  >
                    <span className="font-medium">{error.filename}</span>:{" "}
                    {error.reason}
                    {error.expense_id != null && (
                      <a
                        href={`/expenses/${error.expense_id}/edit`}
                        className="ml-2 underline"
                      >
                        #{error.expense_id}
                      </a>
                    )}
                    {error.expense_id != null &&
                      error.file_index != null &&
                      files[error.file_index] && (
                        <button
                          onClick={() => retryReceipt(error)}
                          disabled={receiptRetrying != null}
                          className="block min-h-11 underline font-semibold disabled:opacity-50"
                        >
                          {receiptRetrying === error.expense_id
                            ? t("bulk_saving")
                            : t("bulk_retry_receipt")}
                        </button>
                      )}
                  </li>
                ))}
              </ul>
              <p>{t("bulk_partial_help")}</p>
            </div>
          )}
          {visibleRows.map((row) => (
            <BulkExpenseRow
              key={row.expense.id}
              row={row}
              categories={categories.filter((category) => category.is_active)}
              onEdit={(field, value) => editField(row.expense.id, field, value)}
              onSave={() => saveRow(row.expense.id)}
              onDelete={() => deleteRow(row.expense.id)}
            />
          ))}
          {uploadFinished &&
            !uploadFailed &&
            !visibleRows.length &&
            !uploadErrors.length && (
              <div className="flex flex-col items-center py-16 gap-3 text-muted">
                <CheckCircle className="w-10 h-10" />
                <p>{t("bulk_no_expenses")}</p>
              </div>
            )}
        </div>
        {!uploading && (
          <div className="px-4 sm:px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-border flex items-center justify-between gap-4">
            <p className="text-xs text-muted">
              {incomplete ? t("bulk_unfinished_note") : t("bulk_autosave_note")}
            </p>
            <button
              onClick={handleClose}
              className="min-h-11 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg"
            >
              {incomplete ? tc("close") : t("done_reviewing")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

interface BulkExpenseRowProps {
  row: RowState;
  categories: Category[];
  onEdit: (field: Field, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}
function BulkExpenseRow({
  row,
  categories,
  onEdit,
  onSave,
  onDelete,
}: BulkExpenseRowProps) {
  const t = useTranslations("expenses");
  const { expense, values } = row;
  const receiptUrl = expense.receipts[0]
    ? `/api/expenses/${expense.id}/receipts/${expense.receipts[0].id}`
    : null;
  const inputClass =
    "w-full min-w-0 min-h-11 px-3 py-2 text-base rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
  const id = (field: Field) => `bulk-${expense.id}-${field}`;
  return (
    <div
      className="rounded-xl border border-border bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4 space-y-3"
      data-expense-id={expense.id}
    >
      <div className="flex items-center gap-3">
        {receiptUrl ? (
          <img
            src={receiptUrl}
            alt={t("table_receipt")}
            className="w-14 h-14 object-cover rounded-lg border border-border shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg border border-dashed border-input-border shrink-0 flex items-center justify-center text-muted text-xs">
            {t("bulk_no_img")}
          </div>
        )}
        <p className="flex-1 min-w-0 font-semibold break-words">
          {values.merchant || `#${expense.id}`}
        </p>
        <button
          onClick={onDelete}
          disabled={row.saving || row.deleting}
          aria-label={t("bulk_delete")}
          className="shrink-0 min-w-11 min-h-11 rounded-lg text-muted hover:text-red-500 disabled:opacity-50 flex items-center justify-center"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <p
        role="status"
        className={`text-sm flex items-center gap-2 ${unfinished(row) ? "text-amber-700 dark:text-amber-300" : "text-muted"}`}
      >
        {(row.saving || row.deleting) && (
          <Loader2 className="w-4 h-4 animate-spin" />
        )}
        {row.saving || row.deleting
          ? t("bulk_saving")
          : unfinished(row)
            ? t("bulk_not_saved")
            : t("bulk_saved")}
      </p>
      {(row.error || dirty(row) || row.uncertain.length > 0) && !row.saving && (
        <button
          onClick={onSave}
          className="min-h-11 underline text-sm font-semibold"
        >
          {t("bulk_retry_edits")}
        </button>
      )}
      {row.deleteError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {t("bulk_delete_failed")}{" "}
          <button onClick={onDelete} className="min-h-11 underline">
            {t("bulk_retry_delete")}
          </button>
        </p>
      )}
      <div className="space-y-3">
        <div>
          <label
            htmlFor={id("merchant")}
            className="text-xs text-muted font-medium"
          >
            {t("bulk_merchant")}
          </label>
          <input
            id={id("merchant")}
            value={values.merchant}
            onChange={(event) => onEdit("merchant", event.target.value)}
            onBlur={onSave}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-[minmax(96px,1fr)_minmax(80px,96px)] gap-2">
          <div>
            <label
              htmlFor={id("amount")}
              className="text-xs text-muted font-medium"
            >
              {t("bulk_amount")}
            </label>
            <input
              id={id("amount")}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={values.amount}
              onChange={(event) => onEdit("amount", event.target.value)}
              onBlur={onSave}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor={id("currency")}
              className="text-xs text-muted font-medium"
            >
              {t("bulk_currency")}
            </label>
            <input
              id={id("currency")}
              value={values.currency}
              onChange={(event) =>
                onEdit("currency", event.target.value.toUpperCase())
              }
              onBlur={onSave}
              maxLength={3}
              className={`${inputClass} uppercase`}
            />
          </div>
        </div>
        <div>
          <label
            htmlFor={id("date")}
            className="text-xs text-muted font-medium"
          >
            {t("bulk_date")}
          </label>
          <input
            id={id("date")}
            type="date"
            value={values.date}
            onChange={(event) => onEdit("date", event.target.value)}
            onBlur={onSave}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor={id("category_id")}
            className="text-xs text-muted font-medium"
          >
            {t("bulk_category")}
          </label>
          <select
            id={id("category_id")}
            value={values.category_id}
            onChange={(event) => onEdit("category_id", event.target.value)}
            onBlur={onSave}
            className={inputClass}
          >
            <option value="">{t("bulk_no_category")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={id("description")}
            className="text-xs text-muted font-medium"
          >
            {t("bulk_description")}
          </label>
          <input
            id={id("description")}
            value={values.description}
            onChange={(event) => onEdit("description", event.target.value)}
            onBlur={onSave}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}
