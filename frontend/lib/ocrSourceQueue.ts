"use client";

/**
 * Owner-scoped IndexedDB storage for OCR sources captured while offline.
 * Sources remain available until the receipt-capture flow acknowledges them.
 */
export type OcrSourceContext = "batch" | "form";
export type OcrSourceData = ArrayBuffer | Blob;

export interface PendingOcrSource {
  id: string;
  userId: number;
  name: string;
  type: string;
  data: OcrSourceData;
  context: OcrSourceContext;
  formSessionId?: string;
  remoteJobId?: number;
  statusUrl?: string;
  createdAt: number;
  updatedAt: number;
  leaseToken?: string;
  leaseUntil?: number;
}

export interface NewOcrSource {
  id: string;
  userId: number;
  name: string;
  type: string;
  data: ArrayBuffer;
  context?: OcrSourceContext;
  formSessionId?: string;
}

const DB_NAME = "xpenses-ocr-sources";
const DB_VERSION = 1;
const STORE = "pending_sources";
const LEASE_DURATION_MS = 30_000;
const MAX_QUEUE_SIZE = 20;
const MAX_QUEUE_BYTES = 100 * 1024 * 1024;
const LEASE_STORAGE_PREFIX = "xpenses-ocr-source-lease:";

function leaseStorageKey(sourceId: string): string {
  return `${LEASE_STORAGE_PREFIX}${sourceId}`;
}

/** The per-tab lease token survives reload without being shared with another tab. */
export function getStoredOcrSourceLease(sourceId: string): string | undefined {
  try {
    return sessionStorage.getItem(leaseStorageKey(sourceId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeOcrSourceLease(
  sourceId: string,
  leaseToken?: string,
): void {
  if (!leaseToken) return;
  try {
    sessionStorage.setItem(leaseStorageKey(sourceId), leaseToken);
  } catch {
    // Session storage is optional; the normal lease expiry remains the fallback.
  }
}

export function clearOcrSourceLease(sourceId: string): void {
  try {
    sessionStorage.removeItem(leaseStorageKey(sourceId));
  } catch {
    // Session storage is optional.
  }
}

function now(): number {
  return Date.now();
}

function createLeaseToken(): string {
  return crypto.randomUUID();
}

function isBlobData(data: OcrSourceData): data is Blob {
  return typeof Blob !== "undefined" && data instanceof Blob;
}

function sourceDataSize(data: OcrSourceData): number {
  return isBlobData(data) ? data.size : data.byteLength;
}

function normalizeSource(
  value: Partial<PendingOcrSource> &
    Pick<
      PendingOcrSource,
      "id" | "userId" | "name" | "type" | "data" | "createdAt"
    >,
): PendingOcrSource {
  return {
    ...value,
    context: value.context ?? "batch",
    formSessionId: value.formSessionId,
    remoteJobId: value.remoteJobId,
    statusUrl: value.statusUrl,
    updatedAt: value.updatedAt ?? value.createdAt,
    leaseToken: value.leaseToken,
    leaseUntil: value.leaseUntil,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  action: (
    store: IDBObjectStore,
    setResult: (value: T) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    void openDb()
      .then((db) => {
        let result!: T;
        let settled = false;
        const transaction = db.transaction(STORE, mode);
        const close = () => {
          try {
            db.close();
          } catch {
            // The database may already be closed by the browser.
          }
        };
        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          try {
            transaction.abort();
          } catch {
            // The transaction may already be aborting.
          }
          close();
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          close();
          resolve(result);
        };
        transaction.onerror = () =>
          fail(transaction.error ?? new Error("IndexedDB transaction failed"));
        transaction.onabort = () =>
          fail(transaction.error ?? new Error("IndexedDB transaction aborted"));

        try {
          action(
            transaction.objectStore(STORE),
            (value) => {
              result = value;
            },
            fail,
          );
        } catch (error) {
          fail(error);
        }
      })
      .catch(reject);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return runTransaction<T>(mode, (store, setResult, fail) => {
    const request = fn(store);
    request.onsuccess = () => setResult(request.result);
    request.onerror = () =>
      fail(request.error ?? new Error("IndexedDB request failed"));
  });
}

function isValidUserId(userId: number | undefined): userId is number {
  return typeof userId === "number" && Number.isInteger(userId) && userId > 0;
}

/** Persist one OCR source before attempting a network request. */
export async function enqueueOcrSource(
  source: NewOcrSource,
): Promise<PendingOcrSource> {
  if (!isValidUserId(source.userId)) {
    throw new Error(
      "An authenticated Technician is required to queue an OCR source",
    );
  }

  const timestamp = now();
  const item: PendingOcrSource = {
    ...source,
    context: source.context ?? "batch",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const items = (request.result as PendingOcrSource[]).map(normalizeSource);
      const current = items.find((existing) => existing.id === item.id);
      const bytes = items.reduce((total, existing) => {
        return total + sourceDataSize(existing.data);
      }, 0);
      const totalBytes =
        bytes -
        (current ? sourceDataSize(current.data) : 0) +
        sourceDataSize(item.data);

      if (!current && items.length >= MAX_QUEUE_SIZE) {
        fail(
          new Error(
            `Offline OCR storage is limited to ${MAX_QUEUE_SIZE} sources`,
          ),
        );
        return;
      }
      if (totalBytes > MAX_QUEUE_BYTES) {
        fail(new Error("Offline OCR storage limit reached"));
        return;
      }

      const put = store.put(item);
      put.onerror = () =>
        fail(put.error ?? new Error("Could not queue OCR source"));
    };
    request.onerror = () =>
      fail(request.error ?? new Error("Could not inspect OCR source queue"));
  });

  return item;
}

/** Return only sources owned by the authenticated Technician. */
export async function listOcrSources(
  userId: number | undefined,
  context: OcrSourceContext = "batch",
  formSessionId?: string,
): Promise<PendingOcrSource[]> {
  if (!isValidUserId(userId)) return [];
  if (context === "form" && !formSessionId) return [];
  const ownerId = userId;
  const items = await withStore<PendingOcrSource[]>("readonly", (store) =>
    store.getAll(),
  );
  return items
    .map(normalizeSource)
    .filter(
      (item) =>
        item.userId === ownerId &&
        item.context === context &&
        (context !== "form" || item.formSessionId === formSessionId),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Claim one source so two tabs cannot submit it simultaneously. */
export async function claimOcrSource(
  id: string,
  userId: number | undefined,
  at = now(),
  reclaimLeaseToken?: string,
): Promise<PendingOcrSource | null> {
  if (!isValidUserId(userId)) return null;
  return runTransaction<PendingOcrSource | null>(
    "readwrite",
    (store, setResult, fail) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const current = request.result
          ? normalizeSource(request.result as PendingOcrSource)
          : null;
        if (!current || current.userId !== userId) {
          setResult(null);
          return;
        }
        if (
          current.leaseUntil &&
          current.leaseUntil > at &&
          current.leaseToken !== reclaimLeaseToken
        ) {
          setResult(null);
          return;
        }

        const claimed: PendingOcrSource = {
          ...current,
          leaseToken: createLeaseToken(),
          leaseUntil: at + LEASE_DURATION_MS,
          updatedAt: at,
        };
        const put = store.put(claimed);
        put.onsuccess = () => setResult(claimed);
        put.onerror = () =>
          fail(put.error ?? new Error("Could not claim OCR source"));
      };
      request.onerror = () =>
        fail(request.error ?? new Error("Could not claim OCR source"));
    },
  );
}

/** Extend an active claim while OCR polling is still in progress. */
export async function renewOcrSource(
  source: PendingOcrSource,
  at = now(),
): Promise<PendingOcrSource | null> {
  if (!isValidUserId(source.userId) || !source.leaseToken) return null;

  return runTransaction<PendingOcrSource | null>(
    "readwrite",
    (store, setResult, fail) => {
      const request = store.get(source.id);
      request.onsuccess = () => {
        const current = request.result
          ? normalizeSource(request.result as PendingOcrSource)
          : null;
        if (
          !current ||
          current.userId !== source.userId ||
          current.leaseToken !== source.leaseToken ||
          (current.leaseUntil !== undefined && current.leaseUntil <= at)
        ) {
          setResult(null);
          return;
        }
        const renewed: PendingOcrSource = {
          ...current,
          leaseUntil: at + LEASE_DURATION_MS,
          updatedAt: at,
        };
        const put = store.put(renewed);
        put.onsuccess = () => setResult(renewed);
        put.onerror = () =>
          fail(put.error ?? new Error("Could not renew OCR source"));
      };
      request.onerror = () =>
        fail(request.error ?? new Error("Could not renew OCR source"));
    },
  );
}

/** Keep a long-running browser OCR worker fenced to its original tab. */
export function startOcrSourceLeaseHeartbeat(
  source: PendingOcrSource,
  onRenewed: (source: PendingOcrSource) => void,
  onLost: () => void,
): () => void {
  let current = source;
  let stopped = false;
  const timer = setInterval(() => {
    void renewOcrSource(current)
      .then((renewed) => {
        if (stopped) return;
        if (!renewed) {
          stopped = true;
          clearInterval(timer);
          onLost();
          return;
        }
        current = renewed;
        onRenewed(renewed);
      })
      .catch(() => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        onLost();
      });
  }, 10_000);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** Persist the remote OcrJob reference while the source lease is held. */
export async function setOcrSourceJob(
  source: PendingOcrSource,
  remoteJobId: number,
  statusUrl?: string,
  at = now(),
): Promise<PendingOcrSource | null> {
  if (
    !isValidUserId(source.userId) ||
    !source.leaseToken ||
    !Number.isInteger(remoteJobId) ||
    remoteJobId <= 0
  ) {
    return null;
  }

  return runTransaction<PendingOcrSource | null>(
    "readwrite",
    (store, setResult, fail) => {
      const request = store.get(source.id);
      request.onsuccess = () => {
        const current = request.result
          ? normalizeSource(request.result as PendingOcrSource)
          : null;
        if (
          !current ||
          current.userId !== source.userId ||
          current.leaseToken !== source.leaseToken
        ) {
          setResult(null);
          return;
        }
        const updated: PendingOcrSource = {
          ...current,
          remoteJobId,
          statusUrl,
          leaseUntil: at + LEASE_DURATION_MS,
          updatedAt: at,
        };
        const put = store.put(updated);
        put.onsuccess = () => setResult(updated);
        put.onerror = () =>
          fail(put.error ?? new Error("Could not persist OCR job"));
      };
      request.onerror = () =>
        fail(request.error ?? new Error("Could not persist OCR job"));
    },
  );
}

/** Release a claim after a transient network failure or page unmount. */
export async function releaseOcrSource(
  source: PendingOcrSource,
  at = now(),
): Promise<void> {
  if (!isValidUserId(source.userId) || !source.leaseToken) return;
  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.get(source.id);
    request.onsuccess = () => {
      const current = request.result
        ? normalizeSource(request.result as PendingOcrSource)
        : null;
      if (
        !current ||
        current.userId !== source.userId ||
        current.leaseToken !== source.leaseToken
      ) {
        return;
      }
      const put = store.put({
        ...current,
        leaseToken: undefined,
        leaseUntil: undefined,
        updatedAt: at,
      });
      put.onerror = () =>
        fail(put.error ?? new Error("Could not release OCR source"));
    };
    request.onerror = () =>
      fail(request.error ?? new Error("Could not release OCR source"));
  });
}

/** Remove a source after cancellation or successful promotion. */
export async function removeOcrSource(
  id: string,
  userId: number | undefined,
  expectedLeaseToken?: string,
): Promise<void> {
  if (!isValidUserId(userId)) return;
  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result
        ? normalizeSource(request.result as PendingOcrSource)
        : null;
      if (!current || current.userId !== userId) return;
      if (expectedLeaseToken && current.leaseToken !== expectedLeaseToken) {
        return;
      }
      if (
        !expectedLeaseToken &&
        current.leaseToken &&
        current.leaseUntil &&
        current.leaseUntil > now()
      ) {
        return;
      }
      const deletion = store.delete(id);
      deletion.onerror = () =>
        fail(deletion.error ?? new Error("Could not remove OCR source"));
    };
    request.onerror = () =>
      fail(request.error ?? new Error("Could not find OCR source"));
  });
}
