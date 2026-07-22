import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { expenseKeys, categoryKeys } from "@/lib/queryKeys";
import { Expense, Category, isPagedResponse, PagedResponse } from "@/lib/api";
import ExpensesClient from "./ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const queryClient = new QueryClient();

  try {
    const [expensesRaw, categories] = await Promise.all([
      serverFetch<Expense[] | PagedResponse<Expense>>("/expenses"),
      serverFetch<Category[]>("/categories")
    ]);
    
    const expenses = isPagedResponse(expensesRaw) ? expensesRaw.data : expensesRaw;

    queryClient.setQueryData(expenseKeys.list({ status: "", category_id: "" }), expenses);
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
