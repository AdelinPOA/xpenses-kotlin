import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { dashboardKeys, settingsKeys } from "@/lib/queryKeys";
import { DashboardStats } from "@/lib/api";
import type { MobileUiConfig } from "@/lib/types/admin";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const queryClient = new QueryClient();

  try {
    const data = await serverFetch<DashboardStats>("/dashboard", { all: false });
    queryClient.setQueryData([...dashboardKeys.all, { all: false }], data);
    const mobileUiConfig = await serverFetch<MobileUiConfig>("/settings/ui");
    queryClient.setQueryData(settingsKeys.mobileUi(), mobileUiConfig);
  } catch (error) {
    console.error("Dashboard prefetch failed:", error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient />
    </HydrationBoundary>
  );
}
