"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { expenseKeys, dashboardKeys, reportKeys } from "@/lib/queryKeys";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/components/AuthProvider";
import {
  listPendingExpenses,
  removePendingExpense,
  updateExpense,
} from "@/lib/offlineQueue";

interface OfflineSyncContextValue {
  /** Items waiting in the IndexedDB queue (incl. ones needing attention). */
  pendingCount: number;
  /** Items the server rejected — shown as "needs attention". */
  failedCount: number;
  /** Re-read the queue from IndexedDB. */
  refreshCount: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue>({
  pendingCount: 0,
  failedCount: 0,
  refreshCount: async () => {},
});

export function useOfflineSync() {
  return useContext(OfflineSyncContext);
}

/**
 * App-level offline sync loop (Background Sync is unsupported on iOS).
 * Runs on `online`, tab focus and mount; each queued item is created as a
 * NEW expense, then its receipts are uploaded. Failed network attempts stay
 * queued; server-rejected payloads are marked for "needs attention".
 */
export default function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("offline");
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const items = await listPendingExpenses(user?.id);
      setPendingCount(items.length);
      setFailedCount(items.filter((i) => i.error).length);
    } catch {
      // IDB unavailable (private mode) — queue features degrade silently.
    }
  }, [user?.id]);

  const syncOnce = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine || !user?.id) return;
    syncingRef.current = true;
    let synced = 0;
    try {
      const items = await listPendingExpenses(user.id);
      const retryable = items.filter((i) => !i.error);
      let stoppedForNetwork = false;

      for (const item of retryable) {
        try {
          const { data: created } = await api.post("/expenses", item.payload);
          if (item.receipts.length > 0) {
            const fd = new FormData();
            for (const r of item.receipts) fd.append("files", r.blob, r.name);
            await api.post(`/expenses/${created.id}/receipts`, fd);
          }
          await removePendingExpense(item.id);
          synced++;
        } catch (e: any) {
          if (!e?.response) {
            // Network dropped mid-sync — leave everything queued for later.
            stoppedForNetwork = true;
            break;
          }
          // Server rejected the payload (e.g. delisted currency):
          // mark it so it stops blocking the queue and needs attention.
          const detail =
            e.response?.data?.detail ?? e.response?.data?.message ?? "Unknown error";
          await updateExpense({ ...item, error: String(detail) });
        }
      }

      if (stoppedForNetwork) {
        // 401 during sync redirects to /login via the api interceptor; the
        // queue survives in IDB and re-syncs after re-login.
        if (!navigator.onLine) toast.info(t("still_offline"));
      }
    } finally {
      syncingRef.current = false;
      if (synced > 0) {
        qc.invalidateQueries({ queryKey: expenseKeys.all });
        qc.invalidateQueries({ queryKey: dashboardKeys.all });
        qc.invalidateQueries({ queryKey: reportKeys.all });
        toast.success(t("synced_toast", { count: synced }));
      }
      await refreshCount();
    }
  }, [qc, toast, t, refreshCount]);

  useEffect(() => {
    void refreshCount();

    const onOnline = () => void syncOnce();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncOnce();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    // Initial attempt in case we came online while the tab was hidden.
    void syncOnce();

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshCount, syncOnce]);

  return (
    <OfflineSyncContext.Provider value={{ pendingCount, failedCount, refreshCount }}>
      {children}
      <ConnectionBanner />
    </OfflineSyncContext.Provider>
  );
}

function ConnectionBanner() {
  const t = useTranslations("offline");
  const { pendingCount, failedCount } = useOfflineSync();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online && pendingCount === 0) return null;

  const needsAttention = online && failedCount > 0;
  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-amber-950 text-xs font-semibold text-center py-1.5 px-4 shadow-sm"
    >
      {needsAttention
        ? t("banner_needs_attention", { count: failedCount })
        : online
          ? t("banner_sync_pending", { count: pendingCount })
          : pendingCount > 0
            ? t("banner_offline_with_queue")
            : t("banner_offline")}
    </div>
  );
}
