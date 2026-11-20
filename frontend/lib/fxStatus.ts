"use client";

import { useQuery } from "@tanstack/react-query";
import { getFxStatus, type FxHealthStatus } from "@/lib/api";
import { settingsKeys } from "@/lib/queryKeys";

export const FX_PROVIDER_SHORT_LABELS: Record<string, string> = {
  BNR: "BNR",
  ECB_FRANKFURTER: "ECB / Frankfurter",
  CURRENCY_API: "Currency API",
};

/** Return a compact human-readable label for a backend `FxRateSource` identifier. */
export function formatFxProviderShortName(provider: string | null | undefined): string {
  if (!provider) return "";
  return FX_PROVIDER_SHORT_LABELS[provider] ?? provider;
}

/** Poll global FX provider health & fallback state while an authenticated session is active. */
export function useFxStatus(enabled: boolean) {
  return useQuery<FxHealthStatus>({
    queryKey: settingsKeys.fxStatus(),
    queryFn: getFxStatus,
    enabled,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
}
