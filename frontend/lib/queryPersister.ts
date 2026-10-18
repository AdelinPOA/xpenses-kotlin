"use client";

import { QueryClient, dehydrate, hydrate, DehydratedState } from "@tanstack/react-query";

const DB_NAME = "xpenses-cache";
const DB_VERSION = 1;
const STORE_NAME = "react_query";
const CACHE_RECORD_KEY = "persisted_state";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PERSIST_ROOT_KEYS = new Set(["categories", "expenses", "reports", "settings", "dashboard"]);

interface PersistedPayload {
  timestamp: number;
  state: DehydratedState;
  userId?: number;
}

export interface QueryPersistence {
  start: () => () => void;
  setOwner: (id: number | null) => Promise<void>;
  whenReady: () => Promise<void>;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readPersistedState(): Promise<PersistedPayload | null> {
  const db = await openCacheDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(CACHE_RECORD_KEY);
    let payload: PersistedPayload | undefined;
    request.onsuccess = () => {
      payload = request.result as PersistedPayload | undefined;
    };
    tx.oncomplete = () => {
      db.close();
      if (
        !payload ||
        !payload.state ||
        !Number.isFinite(payload.timestamp) ||
        Date.now() - payload.timestamp > MAX_AGE_MS
      ) {
        resolve(null);
        return;
      }
      resolve(payload);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      resolve(null);
    };
  });
}

function deletePersistedState(): Promise<void> {
  return openCacheDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(CACHE_RECORD_KEY);
        tx.oncomplete = tx.onerror = tx.onabort = () => {
          db.close();
          resolve();
        };
      }),
  ).catch(() => undefined);
}

function writePersistedState(payload: PersistedPayload): Promise<void> {
  return openCacheDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(payload, CACHE_RECORD_KEY);
        tx.oncomplete = tx.onerror = tx.onabort = () => {
          db.close();
          resolve();
        };
      }),
  ).catch(() => undefined);
}

/**
 * Owns the persisted cache lifecycle for one QueryClient. A stored cache is
 * restored only after an authenticated identity is known and the cache owner
 * exactly matches it. Unknown and legacy ownership are always rejected.
 */
export function createQueryPersistence(queryClient: QueryClient): QueryPersistence {
  let ownerId: number | null | undefined;
  let generation = 0;
  let active = false;
  let unsubscribe: (() => void) | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let restorePromise: Promise<void> = Promise.resolve();
  let restoreGeneration = -1;
  let storageQueue: Promise<void> = Promise.resolve();
  let ownershipBarrier: Promise<void> = Promise.resolve();
  let startup = deferred();

  const queueStorage = (operation: () => Promise<void>) => {
    storageQueue = storageQueue.then(operation, operation);
    return storageQueue;
  };

  const clearStored = () => queueStorage(deletePersistedState);

  const restore = (restoreForGeneration: number, identity: number) => {
    if (!active || restoreGeneration === restoreForGeneration) return restorePromise;
    restoreGeneration = restoreForGeneration;
    restorePromise = readPersistedState()
      .then((payload) => {
        if (!active || generation !== restoreForGeneration || ownerId !== identity) return;
        if (!payload || payload.userId !== identity) {
          if (payload) void clearStored();
          return;
        }
        hydrate(queryClient, payload.state);
      })
      .catch(() => undefined);
    return restorePromise;
  };

  const scheduleSave = () => {
    if (ownerId == null || !active) return;
    const saveForGeneration = generation;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void restorePromise.then(() => {
        if (!active || ownerId == null || generation !== saveForGeneration) return;
        try {
          const state = dehydrate(queryClient, {
            shouldDehydrateQuery: (query) =>
              query.state.status === "success" && PERSIST_ROOT_KEYS.has(String(query.queryKey[0])),
          });
          const payload: PersistedPayload = {
            timestamp: Date.now(),
            state,
            userId: ownerId,
          };
          void queueStorage(async () => {
            if (!active || ownerId !== payload.userId || generation !== saveForGeneration) return;
            await writePersistedState(payload);
          });
        } catch {
          // Storage persistence is best-effort; in-memory queries remain available.
        }
      });
    }, 1000);
  };

  return {
    start() {
      if (active) return () => {};
      active = true;
      unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (event?.type === "updated" && event.query.state.status === "success") scheduleSave();
      });
      if (ownerId != null) {
        const restoreForGeneration = generation;
        const identity = ownerId;
        void ownershipBarrier.then(() => {
          if (active && generation === restoreForGeneration && ownerId === identity) {
            void restore(restoreForGeneration, identity);
          }
        });
      }
      startup.resolve();

      return () => {
        active = false;
        generation++;
        restoreGeneration = -1;
        restorePromise = Promise.resolve();
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        unsubscribe?.();
        unsubscribe = null;
        startup = deferred();
      };
    },
    setOwner(id) {
      if (ownerId === id) return this.whenReady();
      const wasKnown = ownerId !== undefined;
      ownerId = id;
      generation++;
      restoreGeneration = -1;
      restorePromise = Promise.resolve();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;

      if (wasKnown) {
        // A switch or sign-out invalidates every pending restore and write.
        ownershipBarrier = clearStored();
        return ownershipBarrier;
      }
      if (active && id != null) return restore(generation, id);
      if (id == null) ownershipBarrier = clearStored();
      return this.whenReady();
    },
    whenReady() {
      const readyToRestore = active
        ? ownershipBarrier
        : startup.promise.then(() => ownershipBarrier);
      return readyToRestore.then(() => {
        if (!active) return this.whenReady();
        if (ownerId != null && restoreGeneration !== generation) {
          return restore(generation, ownerId);
        }
        return restorePromise;
      });
    },
  };
}
