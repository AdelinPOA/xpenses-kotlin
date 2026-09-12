"use client";

import { QueryClient, dehydrate, hydrate, DehydratedState } from "@tanstack/react-query";

const DB_NAME = "xpenses-cache";
const DB_VERSION = 1;
const STORE_NAME = "react_query";
const CACHE_RECORD_KEY = "persisted_state";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PersistedPayload {
  timestamp: number;
  state: DehydratedState;
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadPersistedState(): Promise<DehydratedState | null> {
  try {
    const db = await openCacheDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(CACHE_RECORD_KEY);
      request.onsuccess = () => {
        db.close();
        const payload = request.result as PersistedPayload | undefined;
        if (!payload || !payload.state || !payload.timestamp) {
          resolve(null);
          return;
        }
        if (Date.now() - payload.timestamp > MAX_AGE_MS) {
          resolve(null);
          return;
        }
        resolve(payload.state);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

async function writePersistedState(state: DehydratedState): Promise<void> {
  try {
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const payload: PersistedPayload = {
        timestamp: Date.now(),
        state,
      };
      const request = store.put(payload, CACHE_RECORD_KEY);
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    // Ignore private mode or storage quota errors
  }
}

export async function clearPersistedQueryCache(): Promise<void> {
  try {
    const db = await openCacheDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(CACHE_RECORD_KEY);
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore
  }
}

const PERSIST_ROOT_KEYS = new Set(["categories", "expenses", "reports", "settings", "dashboard"]);

export function initQueryPersistence(queryClient: QueryClient): () => void {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return () => {};
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const dehydrated = dehydrate(queryClient, {
          shouldDehydrateQuery: (query) => {
            if (query.state.status !== "success") return false;
            const rootKey = String(query.queryKey[0]);
            return PERSIST_ROOT_KEYS.has(rootKey);
          },
        });
        void writePersistedState(dehydrated);
      } catch {
        // Silently tolerate dehydration errors
      }
    }, 1000);
  };

  // Restore on mount
  void loadPersistedState().then((state) => {
    if (state) {
      hydrate(queryClient, state);
    }
  });

  // Subscribe to changes
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event?.type === "updated" && event.query.state.status === "success") {
      scheduleSave();
    }
  });

  return () => {
    if (saveTimer) clearTimeout(saveTimer);
    unsubscribe();
  };
}
