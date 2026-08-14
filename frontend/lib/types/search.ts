import { Expense } from "./expense";
import { Report } from "./report";

export interface SearchResult {
  reports: Report[];
  expenses: Expense[];
  users?: Array<{ id: number; display_name?: string; username?: string; email?: string; role?: string }>;
  insurance?: Array<{ id: number; title?: string; filename?: string; uploaded_by?: string }>;
  advances?: Array<{ id: number; report_id?: number; report_title?: string; description?: string; amount_eur?: number; status?: string }>;
  report_count: number;
  expense_count: number;
  user_count?: number;
  insurance_count?: number;
  advance_count?: number;
}
