import axios from "axios";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

export default api;

// ── Types ──────────────────────────────────────────────────────────────────

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
  tax_amount: number;
  tax_rate: number | null;
  tax_amount_eur: number;
  date: string;
  description: string | null;
  merchant: string | null;
  receipt_path: string | null;
  receipts: Receipt[];
  status: string;
  user_display_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdvancePayment {
  id: number;
  report_id: number;
  user_id: number;
  status: "paid" | "requested" | "rejected";
  amount_original: number;
  currency_original: string;
  amount_eur: number;
  fx_rate: number;
  date: string;
  description: string | null;
  requested_amount: number | null;
  requested_currency: string | null;
  paid_by: number | null;
  paid_by_name: string | null;
  paid_at: string | null;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendingAdvance extends AdvancePayment {
  user_display_name: string;
  report_title: string;
}

export interface MileageRecord {
  id: number;
  report_id: number;
  user_id: number;
  origin: string;
  destination: string;
  distance_km: number;
  rate_before_tax: number;
  rate_after_tax: number;
  amount_before_tax: number;
  amount_eur: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface MileageRates {
  mileage_rate_before_tax: number;
  mileage_rate_after_tax: number;
}

export interface Report {
  id: number;
  title: string;
  description: string | null;
  date_from: string | null;
  date_to: string | null;
  status: string;
  submitted_at: string | null;
  paid_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  rejected_reason: string | null;
  signer_id: number | null;
  signed_at: string | null;
  user_id: number | null;
  user_display_name?: string | null;
  total_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  expenses: Expense[];
  advances: AdvancePayment[];
  total_advances: number;
  mileage_records: MileageRecord[];
  total_mileage_eur: number;
  daily_allowance: number;
  total_reimbursable: number;
}

export interface DashboardStats {
  expense_count_total: number;
  expense_count_month: number;
  total_month_eur: number;
  draft_count: number;
  submitted_count: number;
  paid_count: number;
  pending_approval_count: number;
  pending_payment_count: number;
  spend_by_category: {
    category_id: number | null;
    category_name: string;
    total: number;
    count: number;
  }[];
  recent_expenses: Expense[];
}

export interface User {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: "technician" | "manager" | "chef_finance" | "mod";
  is_active: boolean;
  auth_source: string;
  signature_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface OCRScanResult {
  amount: number | null;
  currency: string | null;
  tax_amount: number | null;
  tax_rate: number | null;
  date: string | null;
  merchant: string | null;
  raw_text: string;
  confidence: number;
  warnings: string[];
}

export const CURRENCIES = [
  "EUR", "USD", "GBP", "RON", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK",
  "HUF", "BGN", "HRK", "TRY", "JPY", "CNY", "KRW", "AUD", "CAD", "NZD",
  "BRL", "MXN", "ARS", "CLP", "COP", "INR", "IDR", "MYR", "SGD", "THB",
  "PHP", "VND", "ZAR", "EGP", "NGN", "KES", "AED", "SAR", "QAR", "ILS",
  "RUB", "UAH", "GEL", "KZT", "TWD", "HKD", "ISK", "MAD", "TND",
] as const;
export type Currency = (typeof CURRENCIES)[number];
