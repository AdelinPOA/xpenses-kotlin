"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import api, { Expense } from "@/lib/api";
import { expenseKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import MobileExpenseFormSheet from "@/components/expenses/MobileExpenseFormSheet";

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: expense, isLoading } = useQuery<Expense>({
    queryKey: expenseKeys.detail(parseInt(id)),
    queryFn: () => api.get(`/expenses/${id}`).then((r) => r.data),
  });

  return (
    <AppShell>
      {isLoading ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm">Loading...</p>
      ) : expense ? (
        <MobileExpenseFormSheet expense={expense} />
      ) : (
        <p className="text-red-500 text-sm">Expense not found</p>
      )}
    </AppShell>
  );
}
