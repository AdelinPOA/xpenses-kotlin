import axios from "axios";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token);
    } else {
      prom.reject(error);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url === "/auth/refresh" || originalRequest.url === "/auth/login") {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post("/auth/refresh");
        processQueue(null, "refreshed");
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

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
  raw_ocr_text?: string | null;
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
  // Delegation email import fields
  kundenauftrag?: string | null;
  auftragsart?: string | null;
  positionstyp?: string | null;
  technplatz_raw?: string | null;
  technplatz_line?: boolean;
  kunde_code?: string | null;
  kunde_name?: string | null;
  adresse?: string | null;
  vorgang?: string | null;
  arbeitsplatz?: string | null;
  techniker?: string | null;
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
  auth_source: "local" | "ldap";
  signature_path: string | null;
  notifications_enabled?: boolean;
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
  category_id?: number | null;
  description?: string | null;
  raw_text: string;
  confidence: number;
  warnings: string[];
  comparison_id?: number | null;
}

export const CURRENCIES = [
  "EUR", "USD", "GBP", "RON", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK",
  "HUF", "BGN", "HRK", "TRY", "JPY", "CNY", "KRW", "AUD", "CAD", "NZD",
  "BRL", "MXN", "ARS", "CLP", "COP", "INR", "IDR", "MYR", "SGD", "THB",
  "PHP", "VND", "ZAR", "EGP", "NGN", "KES", "AED", "SAR", "QAR", "ILS",
  "RUB", "UAH", "GEL", "KZT", "TWD", "HKD", "ISK", "MAD", "TND",
] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface LdapConfig {
  enabled: boolean;
  host: string;
  port: number;
  use_tls: boolean;
  bind_dn: string;
  bind_password: string;
  base_dn: string;
  user_filter: string;
  attr_username: string;
  attr_email: string;
  attr_display_name: string;
  attr_role: string;
  role_map: Record<string, string>;
  default_role: string;
  bind_password_invalid?: boolean;
}

export interface LdapSyncResult {
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
  default_role_assigned: number;
}

export interface LdapTestResult {
  ok: boolean;
  preview: { username: string; email: string; display_name: string; mapped_role: string }[];
  error: string | null;
}

export interface SmtpConfig {
  emails_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass?: string;
  smtp_from: string;
  password_set: boolean;
}

export interface SmtpTestResult {
  success: boolean;
  message: string;
}

export interface ImapConfig {
  enabled: boolean;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_pass?: string;
  imap_folder: string;
  password_set: boolean;
  active_parser?: string;
}

export interface ImapTestResult {
  success: boolean;
  message: string;
}

export interface EmailSimulationIn {
  from_address: string;
  body_text: string;
}

export interface EmailSimulationParsed {
  title: string;
  date_from: string;
  date_to: string;
  description: string;
  kundenauftrag?: string;
  auftragsart?: string;
  positionstyp?: string;
  technplatz_raw?: string;
  technplatz_line?: boolean;
  kunde_code?: string;
  kunde_name?: string;
  adresse?: string;
  vorgang?: string;
  arbeitsplatz?: string;
  techniker?: string;
}

export interface EmailSimulationOut {
  success: boolean;
  error?: string | null;
  report_id?: number | null;
  parsed?: EmailSimulationParsed | null;
  local_parsed?: EmailSimulationParsed | null;
  gemini_parsed?: EmailSimulationParsed | null;
  gemini_error?: string | null;
  active_parser?: string | null;
  user_display_name?: string | null;
}

export async function simulateEmailIngestion(payload: EmailSimulationIn): Promise<EmailSimulationOut> {
  const { data } = await api.post<EmailSimulationOut>("/settings/imap/simulate", payload);
  return data;
}

export async function duplicateExpense(expenseId: number): Promise<Expense> {
  const { data } = await api.post(`/expenses/${expenseId}/duplicate`);
  return data;
}


export interface OcrConfig {
  provider: string;
  ocr_enabled: boolean;
  gemini_api_key?: string | null;
  mineru_url?: string | null;
}

export async function getOcrConfig(): Promise<OcrConfig> {
  const { data } = await api.get("/settings/ocr");
  return data;
}

export async function updateOcrConfig(config: Partial<OcrConfig>): Promise<OcrConfig> {
  const { data } = await api.patch("/settings/ocr", config);
  return data;
}

export async function testOcrConfig(payload: { gemini_api_key?: string | null }): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post("/settings/ocr/test", payload);
  return data;
}

export async function testMinerUConfig(): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post("/settings/ocr/test-mineru");
  return data;
}

export interface StorageConfig {
  provider_type: string;
  local?: {
    path?: string | null;
  } | null;
  smb?: {
    host: string;
    share: string;
    username?: string;
    password?: string;
    domain?: string;
    folder?: string;
  } | null;
  webdav?: {
    url: string;
    username?: string;
    password?: string;
    folder?: string;
  } | null;
  sftp?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    folder?: string;
  } | null;
  s3?: {
    endpoint_url?: string;
    access_key: string;
    secret_key: string;
    bucket_name: string;
    region_name?: string;
  } | null;
}

export interface StorageMigrationStatus {
  status: "idle" | "running" | "completed" | "failed";
  total_files: number;
  migrated_files: number;
  failed_files: number;
  errors: string[];
}

export async function getStorageConfig(): Promise<StorageConfig> {
  const { data } = await api.get("/settings/storage");
  return data;
}

export async function updateStorageConfig(config: StorageConfig, migrateExisting: boolean = false): Promise<StorageConfig> {
  const { data } = await api.patch(`/settings/storage?migrate_existing=${migrateExisting}`, config);
  return data;
}

export async function testStorageConfig(config: StorageConfig): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post("/settings/storage/test", config);
  return data;
}

export async function getStorageMigrationStatus(): Promise<StorageMigrationStatus> {
  const { data } = await api.get("/settings/storage/migration-status");
  return data;
}


export interface OCRComparisonStats {
  total_scanned: number;
  easyocr_amount_accuracy: number;
  easyocr_date_accuracy: number;
  easyocr_merchant_accuracy: number;
  easyocr_category_accuracy: number;
  gemini_amount_accuracy: number;
  gemini_date_accuracy: number;
  gemini_merchant_accuracy: number;
  gemini_category_accuracy: number;
  mineru_amount_accuracy: number;
  mineru_date_accuracy: number;
  mineru_merchant_accuracy: number;
  mineru_category_accuracy: number;
}

export interface OCRComparisonRow {
  id: number;
  receipt_filename: string | null;
  created_at: string;
  gemini_amount: number | null;
  gemini_date: string | null;
  gemini_merchant: string | null;
  gemini_category_id: number | null;
  easyocr_amount: number | null;
  easyocr_date: string | null;
  easyocr_merchant: string | null;
  easyocr_category_id: number | null;
  mineru_amount: number | null;
  mineru_date: string | null;
  mineru_merchant: string | null;
  mineru_category_id: number | null;
  provider: string;
  final_amount: number | null;
  final_date: string | null;
  final_merchant: string | null;
  final_category_id: number | null;
}

export interface OCRComparisonHistoryResponse {
  stats: OCRComparisonStats;
  history: OCRComparisonRow[];
}

export async function getOcrComparisons(): Promise<OCRComparisonHistoryResponse> {
  const { data } = await api.get("/ocr/comparison");
  return data;
}

export async function downloadBlob(
  url: string,
  params: Record<string, unknown>,
  filename: string
): Promise<void> {
  const response = await api.get(url, { params, responseType: "blob" });
  const objectUrl = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}



