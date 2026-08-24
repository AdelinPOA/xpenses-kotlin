"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import { useSearchParams } from "next/navigation";
import api, { Expense } from "@/lib/api";
import { expenseKeys } from "@/lib/queryKeys";
import dynamic from "next/dynamic";
import AppShell from "@/components/layout/AppShell";

const ExpenseForm = dynamic(() => import("@/components/expenses/ExpenseForm"), {
  loading: () => <div className="animate-pulse bg-card h-96 rounded-xl" />,
});

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const uploadFailed = searchParams.get("upload_failed") === "1";

  const { data: expense, isLoading } = useQuery<Expense>({
    queryKey: expenseKeys.detail(parseInt(id)),
    queryFn: () => api.get(`/expenses/${id}`).then((r) => r.data),
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Edit Expense</h1>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : expense ? (
        <ExpenseForm expense={expense} highlightReceipts={uploadFailed} />
      ) : (
        <p className="text-red-500 text-sm">Expense not found</p>
      )}
    </AppShell>
  );
}
