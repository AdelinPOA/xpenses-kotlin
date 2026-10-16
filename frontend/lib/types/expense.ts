export interface Category {
  id: number;
  name: string;
  limit_amount: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Receipt {
  id: number;
  expense_id: number;
  file_path: string;
  original_name: string | null;
  created_at: string;
}

export interface Expense {
  id: number;
  category_id: number | null;
  category_name: string | null;
  report_id: number | null;
  amount_original: number;
  currency_original: string;
  amount_eur: number;
  fx_rate: number;
  fx_rate_manual: boolean;
  tax_amount: number;
  tax_rate: number | null;
  tax_amount_eur: number;
  date: string;
  description: string | null;
  merchant: string | null;
  receipt_path: string | null;
  receipts: Receipt[];
  status: string;
  raw_ocr_text?: string | null;
  user_display_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BulkUploadError {
  filename: string;
  reason: string;
}

export interface BulkUploadResult {
  created: Expense[];
  errors: BulkUploadError[];
}

export interface OCRScanResult {
  amount: number | null;
  currency: string | null;
  tax_amount: number | null;
  tax_rate: number | null;
  date: string | null;
  merchant: string | null;
  category_id?: number | null;
  description?: string | null;
  raw_text: string;
  confidence: number;
  warnings: string[];
  comparison_id?: number | null;
  expense_id?: number | null;
  receipt_id?: number | null;
  error_code?: string | null;
  fallback?: string | null;
  fallback_reason?: string | null;
  provider_error?: string | null;
}

/** Photo-only OCR drafts need human review before submission. */
export function isExpenseNeedingReview(
  expense: Pick<
    Expense,
    "status" | "amount_original" | "currency_original" | "merchant"
  >,
): boolean {
  return (
    expense.status === "draft" &&
    (expense.amount_original <= 0 ||
      !expense.currency_original ||
      !expense.merchant?.trim())
  );
}
