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
import { expenseKeys, dashboardKeys, reportKeys } from "@/lib/queryKeys";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/components/AuthProvider";
import {
  discardQueuedExpense,
  retryQueuedExpense,
  syncPendingExpenses,
} from "@/lib/expenseSaving";
import { listPendingExpenses, type PendingExpense } from "@/lib/offlineQueue";

interface OfflineSyncContextValue {
  /** Items waiting in the IndexedDB queue (including permanent failures). */
  pendingCount: number;
  /** Items requiring explicit attention. */
  failedCount: number;
  /** Owner-scoped queue records for the recovery surface. */
  items: PendingExpense[];
  /** Re-read the queue from IndexedDB. */
  refreshCount: () => Promise<void>;
  /** Clear a terminal error and immediately attempt the item. */
  retryItem: (id: string) => Promise<void>;
  /** Explicitly discard one owner-scoped queue record. */
  discardItem: (id: string) => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue>({
  pendingCount: 0,
  failedCount: 0,
  items: [],
  refreshCount: async () => {},
  retryItem: async () => {},
  discardItem: async () => {},
});

export function useOfflineSync() {
  return useContext(OfflineSyncContext);
}

/**
 * App-level staged recovery loop. Background Sync is unsupported on iOS, so
 * synchronization runs on online, tab focus, and mount. The saving module
 * owns the state machine; this module owns app invalidation and feedback.
 */
export default function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("offline");
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<PendingExpense[]>([]);
  const syncingRef = useRef(false);
  const syncAbortRef = useRef<AbortController | null>(null);
  const currentUserIdRef = useRef<number | null>(user?.id ?? null);
  currentUserIdRef.current = user?.id ?? null;

  const refreshCount = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      return;
    }
    try {
      setItems(await listPendingExpenses(user.id));
    } catch {
      // IDB unavailable (private mode) — queue features degrade silently.
      setItems([]);
    }
  }, [user?.id]);

  const syncOnce = useCallback(async () => {
    if (syncingRef.current || !user?.id) return;
    syncingRef.current = true;
    const syncUserId = user.id;
    const controller = new AbortController();
    syncAbortRef.current = controller;
    try {
      const result = await syncPendingExpenses(syncUserId, { signal: controller.signal });
      if (result.stoppedForNetwork && !navigator.onLine) {
        toast.info(t("still_offline"));
      }
      if (result.synced > 0) {
        qc.invalidateQueries({ queryKey: expenseKeys.all });
        qc.invalidateQueries({ queryKey: dashboardKeys.all });
        qc.invalidateQueries({ queryKey: reportKeys.all });
        toast.success(t("synced_toast", { count: result.synced }));
      }
    } finally {
      syncingRef.current = false;
      if (syncAbortRef.current === controller) syncAbortRef.current = null;
      if (currentUserIdRef.current === syncUserId && !controller.signal.aborted) {
        await refreshCount();
      }
    }
  }, [qc, refreshCount, t, toast, user?.id]);

  const retryItem = useCallback(async (id: string) => {
    if (!user?.id) return;
    await retryQueuedExpense(id, user.id);
    await syncOnce();
  }, [syncOnce, user?.id]);

  const discardItem = useCallback(async (id: string) => {
    if (!user?.id) return;
    await discardQueuedExpense(id, user.id);
    await refreshCount();
  }, [refreshCount, user?.id]);

  useEffect(() => {
    void refreshCount();

    const onOnline = () => void syncOnce();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncOnce();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    void syncOnce();

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      syncingRef.current = false;
      syncAbortRef.current?.abort();
    };
  }, [refreshCount, syncOnce]);

  useEffect(() => {
    if (!user?.id) return;
    const next = items
      .filter((item) => !item.error && item.nextAttemptAt > Date.now())
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)[0];
    if (!next) return;
    const delay = Math.max(100, next.nextAttemptAt - Date.now());
    const timer = setTimeout(() => void syncOnce(), delay);
    return () => clearTimeout(timer);
  }, [items, syncOnce, user?.id]);

  const failedCount = items.filter((item) => Boolean(item.error)).length;
  const pendingCount = items.length;

  return (
    <OfflineSyncContext.Provider value={{ pendingCount, failedCount, items, refreshCount, retryItem, discardItem }}>
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
