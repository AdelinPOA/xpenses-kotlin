"use client";

import { useQuery } from "@tanstack/react-query";
import { getFuelPriceStatus, type FuelPriceHealthStatus } from "@/lib/api";
import { settingsKeys } from "@/lib/queryKeys";

export const FUEL_SOURCE_SHORT_LABELS: Record<string, string> = {
  PRETCARBURANT_LIVE: "PretCarburant Live",
  PRETCARBURANT_DATA: "PretCarburant Arhivă",
  EU_WEEKLY_OIL_BULLETIN: "EU Oil Bulletin",
  MANUAL_SETTING: "Manual",
};

/** Return a compact human-readable label for a backend `FuelPriceSource` identifier. */
export function formatFuelSourceShortName(source: string | null | undefined): string {
  if (!source) return "";
  return FUEL_SOURCE_SHORT_LABELS[source] ?? source;
}

/** Poll global fuel price provider health & fallback state while an authenticated session is active. */
export function useFuelPriceStatus(enabled: boolean) {
  return useQuery<FuelPriceHealthStatus>({
    queryKey: settingsKeys.fuelStatus(),
    queryFn: getFuelPriceStatus,
    enabled,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
}
