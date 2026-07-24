import type { Expense } from "./expense";

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

export interface EmailSimulationIn {
  from_address: string;
  body_text: string;
  parser?: "local" | "gemini" | null;
}
