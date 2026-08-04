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

export interface OcrConfig {
  provider: string;
  ocr_enabled: boolean;
  gemini_api_key?: string | null;
}

export interface StorageConfig {
  provider_type: string;
  local?: { path?: string | null } | null;
  smb?: { host: string; share: string; username?: string; password?: string; domain?: string; folder?: string } | null;
  webdav?: { url: string; username?: string; password?: string; folder?: string } | null;
  sftp?: { host: string; port: number; username?: string; password?: string; folder?: string } | null;
  s3?: { endpoint_url?: string; access_key: string; secret_key: string; bucket_name: string; region_name?: string } | null;
}

export interface StorageMigrationStatus {
  status: "idle" | "running" | "completed" | "failed";
  total_files: number;
  migrated_files: number;
  failed_files: number;
  errors: string[];
}

export interface FxMargins {
  margins: Record<string, number>;
  defaultMargin: number;
  currencies: string[];
}

export interface OCRComparisonStats {
  total_scanned: number;
  gemini_amount_accuracy: number;
  gemini_date_accuracy: number;
  gemini_merchant_accuracy: number;
  gemini_category_accuracy: number;
}

export interface OCRComparisonRow {
  id: number;
  receipt_filename: string | null;
  created_at: string;
  gemini_amount: number | null;
  gemini_date: string | null;
  gemini_merchant: string | null;
  gemini_category_id: number | null;
  gemini_error: string | null;
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
