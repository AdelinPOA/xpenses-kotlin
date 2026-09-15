import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { MileageRates, FxProvidersConfig } from "@/lib/api";
import { settingsKeys } from "@/lib/queryKeys";
import type { MobileUiConfig } from "@/lib/types/admin";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const queryClient = new QueryClient();

  try {
    const [rates, allowanceData, fxProvidersData, mobileUiData] = await Promise.all([
      serverFetch<MileageRates>("/settings/mileage-rates").catch(() => null),
      serverFetch<{ daily_allowance_rate: number }>("/settings/daily-allowance-rate").catch(() => null),
      serverFetch<FxProvidersConfig>("/settings/fx-providers").catch(() => null),
      serverFetch<MobileUiConfig>("/settings/ui").catch(() => null),
    ]);
    if (rates) queryClient.setQueryData(settingsKeys.mileageRates(), rates);
    if (allowanceData) queryClient.setQueryData(settingsKeys.dailyAllowanceRate(), allowanceData);
    if (mobileUiData) queryClient.setQueryData(settingsKeys.mobileUi(), mobileUiData);
    if (fxProvidersData) queryClient.setQueryData(settingsKeys.fxProviders(), fxProvidersData);
  } catch (error) {
    console.error("Admin settings prefetch failed:", error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SettingsClient />
    </HydrationBoundary>
  );
}
