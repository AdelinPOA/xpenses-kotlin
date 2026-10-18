"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "./ToastProvider";
import { useTranslations } from "next-intl";

const TOAST_INTERVAL_MS = 15_000;

/**
 * Surfaces failed background fetches (that would otherwise degrade silently
 * into empty/stale screens) as a toast with a retry action. Rate-limited so
 * multi-query failures produce a single notification.
 */
export default function QueryErrorBridge() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations("common");

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    let lastToastAt = 0;

    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      const query = event.query;
      if (query.state.status !== "error" || query.getObserversCount() === 0) return;

      const errorAt = query.state.errorUpdatedAt;
      if (!errorAt || Date.now() - errorAt > 2_000) return;
      if (Date.now() - lastToastAt < TOAST_INTERVAL_MS) return;
      lastToastAt = Date.now();

      toast.error(t("load_failed"), {
        label: t("try_again"),
        onClick: () => {
          void queryClient.refetchQueries({ queryKey: query.queryKey });
        },
      });
    });

    return unsubscribe;
  }, [queryClient, toast, t]);

  return null;
}
