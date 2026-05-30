"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import api, { Expense } from "@/lib/api";
import { expenseKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import ExpenseForm from "@/components/expenses/ExpenseForm";

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: expense, isLoading } = useQuery<Expense>({
    queryKey: expenseKeys.detail(parseInt(id)),
    queryFn: () => api.get(`/expenses/${id}`).then((r) => r.data),
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit Expense</h1>
      </div>
      {isLoading ? (
        <p className="text-slate-400 text-sm">Loading...</p>
      ) : expense ? (
        <ExpenseForm expense={expense} />
      ) : (
        <p className="text-red-500 text-sm">Expense not found</p>
      )}
    </AppShell>
  );
}
