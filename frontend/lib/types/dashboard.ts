import type { Expense } from "./expense";

export interface DashboardStats {
  expense_count_total: number;
  expense_count_month: number;
  total_last_report_eur: number;
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

export interface ManagerKpis {
  pending_reports_count: number;
  pending_reports_total_eur: number;
  pending_advances_count: number;
  pending_advances_total_eur: number;
  monthly_team_spend_eur: number;
  avg_turnaround_days: number;
}

export interface PendingReportSummary {
  id: number;
  title: string;
  user_id: number;
  user_name: string;
  date_submitted: string | null;
  date_from: string | null;
  date_to: string | null;
  total_amount_eur: number;
  expense_count: number;
  description: string | null;
  status: string;
}

export interface PendingAdvanceSummary {
  id: number;
  report_id: number;
  report_title: string;
  user_id: number;
  user_name: string;
  amount_eur: number;
  description: string | null;
  status: string;
  created_at: string | null;
}

export interface ActivityFeedItem {
  id: string;
  type: string;
  actor_name: string;
  target_title: string;
  user_name: string;
  amount_eur: number;
  timestamp: string;
}

export interface ManagerDashboardStats {
  kpis: ManagerKpis;
  pending_reports: PendingReportSummary[];
  pending_advances: PendingAdvanceSummary[];
  recent_activity: ActivityFeedItem[];
}
