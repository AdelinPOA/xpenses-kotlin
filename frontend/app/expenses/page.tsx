import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { expenseKeys, categoryKeys } from "@/lib/queryKeys";
import { Expense, Category, PagedResponse } from "@/lib/api";
import ExpensesClient from "./ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const queryClient = new QueryClient();

  try {
    const [expensesPayload, categories] = await Promise.all([
      serverFetch<Expense[] | PagedResponse<Expense>>("/expenses", { page: 0, size: 20 }),
      serverFetch<Category[]>("/categories")
    ]);

    queryClient.setQueryData(expenseKeys.list({ page: 0, size: 20 }), expensesPayload);
    queryClient.setQueryData(categoryKeys.list(), categories);
  } catch (error) {
    console.error("Expenses prefetch failed:", error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ExpensesClient />
    </HydrationBoundary>
  );
}
