import { Expense } from "./expense";
import { Report } from "./report";

export interface SearchResult {
  reports: Report[];
  expenses: Expense[];
  report_count: number;
  expense_count: number;
}
