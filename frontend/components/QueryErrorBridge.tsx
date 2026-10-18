"use client";

import { useEffect, useRef } from "react";
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
  const { error } = useToast();
  const t = useTranslations("common");
  const lastToastAtRef = useRef(0);
  const seenErrorsRef = useRef(new Map<string, number>());

  useEffect(() => {
    const cache = queryClient.getQueryCache();

    const unsubscribe = cache.subscribe((event) => {
      if (event.type === "removed") {
        seenErrorsRef.current.delete(event.query.queryHash);
        return;
      }
      if (event.type !== "updated") return;
      if (event.action.type !== "error") return;
      const query = event.query;
      if (query.state.status !== "error" || query.getObserversCount() === 0) return;

      const errorAt = query.state.errorUpdatedAt;
      if (!errorAt || seenErrorsRef.current.get(query.queryHash) === errorAt) return;
      seenErrorsRef.current.set(query.queryHash, errorAt);

      const now = Date.now();
      if (now - lastToastAtRef.current < TOAST_INTERVAL_MS) return;
      lastToastAtRef.current = now;

      error(t("load_failed"), {
        label: t("try_again"),
        onClick: () => {
          void queryClient.refetchQueries({ queryKey: query.queryKey });
        },
      });
    });

    return unsubscribe;
  }, [queryClient, error, t]);

  return null;
}
