import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { dashboardKeys } from "@/lib/queryKeys";
import { DashboardStats } from "@/lib/api";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const queryClient = new QueryClient();

  try {
    const data = await serverFetch<DashboardStats>("/dashboard", { all: false });
    queryClient.setQueryData([...dashboardKeys.all, { all: false }], data);
  } catch (error) {
    console.error("Dashboard prefetch failed:", error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient />
    </HydrationBoundary>
  );
}
