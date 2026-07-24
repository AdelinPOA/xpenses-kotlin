import api from "@/lib/api";
import type { BulkUploadResult } from "@/lib/types/expense";
import type { Expense } from "@/lib/types/expense";

export async function bulkUploadExpenses(files: File[]): Promise<BulkUploadResult> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<BulkUploadResult>("/expenses/bulk-upload", form);
  return data;
}

export async function duplicateExpense(expenseId: number): Promise<Expense> {
  const { data } = await api.post(`/expenses/${expenseId}/duplicate`);
  return data;
}
