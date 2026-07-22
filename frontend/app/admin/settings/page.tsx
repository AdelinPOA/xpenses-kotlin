import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { MileageRates } from "@/lib/api";
import { settingsKeys } from "@/lib/queryKeys";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const queryClient = new QueryClient();

  try {
    const [rates, allowanceData] = await Promise.all([
      serverFetch<MileageRates>("/settings/mileage-rates"),
      serverFetch<{ daily_allowance_rate: number }>("/settings/daily-allowance-rate"),
    ]);
    queryClient.setQueryData(settingsKeys.mileageRates(), rates);
    queryClient.setQueryData(settingsKeys.dailyAllowanceRate(), allowanceData);
  } catch (error) {
    console.error("Admin settings prefetch failed:", error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SettingsClient />
    </HydrationBoundary>
  );
}
