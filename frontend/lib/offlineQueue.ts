"use client";

/**
 * IndexedDB-backed staged recovery queue for new Expenses.
 *
 * The queue is deliberately owner-scoped. A record moves from creating an
 * Expense to attaching its Receipt batch; it is removed only after the batch
 * completes. Backend idempotency is not available yet, so recovery is
 * at-least-once when a response is lost.
 */

export interface PendingReceipt {
  name: string;
  type: string;
  /** Structured-cloneable — stored directly in IndexedDB. */
  blob: Blob;
}

export type PendingExpenseStage = "creation_pending" | "receipts_pending";
export type PendingExpenseErrorKind = "permanent" | "stale" | "auth" | "retryable";

export interface PendingExpense {
  id: string;
  /** Missing only on legacy records; those records are quarantined. */
  userId?: number;
  /** POST /expenses body. */
  payload: Record<string, unknown>;
  receipts: PendingReceipt[];
  /** The server Expense ID once creation has been acknowledged. */
  expenseId?: number;
  stage: PendingExpenseStage;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt: number;
  /** Set for permanent/stale failures; auth pauses use backoff instead. */
  error?: string;
  errorKind?: PendingExpenseErrorKind;
  /** Cross-tab claim token and expiry. */
  leaseToken?: string;
  leaseUntil?: number;
}

const DB_NAME = "xpenses-offline";
const DB_VERSION = 2;
const STORE = "pending_expenses";
const LEASE_DURATION_MS = 30_000;

/** Maximum number of staged Expenses retained in one browser profile. */
export const MAX_QUEUE_SIZE = 20;
/** Prevent a collection of large Receipt blobs exhausting browser storage. */
export const MAX_QUEUE_BYTES = 100 * 1024 * 1024;

export class OfflineQueueCapacityError extends Error {
  constructor(message = "Offline queue capacity reached") {
    super(message);
    this.name = "OfflineQueueCapacityError";
  }
}

export class OfflineQueueLeaseLostError extends Error {
  constructor() {
    super("Offline queue lease is no longer owned by this tab");
    this.name = "OfflineQueueLeaseLostError";
  }
}

function now(): number {
  return Date.now();
}

function createId(): string {
  return crypto.randomUUID();
}

function receiptBytes(receipts: PendingReceipt[]): number {
  return receipts.reduce((total, receipt) => total + receipt.blob.size, 0);
}

function normalizeItem(value: Partial<PendingExpense> & Pick<PendingExpense, "id" | "payload" | "receipts" | "createdAt">): PendingExpense {
  const createdAt = value.createdAt ?? now();
  const expenseId = value.expenseId;
  return {
    ...value,
    userId: value.userId,
    expenseId,
    stage: value.stage ?? (expenseId === undefined ? "creation_pending" : "receipts_pending"),
    createdAt,
    updatedAt: value.updatedAt ?? createdAt,
    attempts: value.attempts ?? 0,
    nextAttemptAt: value.nextAttemptAt ?? 0,
    error: value.error,
    errorKind: value.errorKind,
    leaseToken: value.leaseToken,
    leaseUntil: value.leaseUntil,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      const db = request.result;
      const transaction = request.transaction;
      const store = db.objectStoreNames.contains(STORE)
        ? transaction!.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: "id" });

      // Version 1 records were always creation-pending and had no server ID.
      if (request.transaction && oldVersion < 2) {
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          cursor.update(normalizeItem(cursor.value));
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Resolve only after the IndexedDB transaction commits, not merely the request. */
function runTransaction<T>(
  mode: IDBTransactionMode,
  action: (
    store: IDBObjectStore,
    setResult: (value: T) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let db: IDBDatabase;
    try {
      db = await openDb();
    } catch (error) {
      reject(error);
      return;
    }

    let result!: T;
    let settled = false;
    const transaction = db.transaction(STORE, mode);
    const close = () => {
      try { db.close(); } catch { /* already closed */ }
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      try { transaction.abort(); } catch { /* already aborted */ }
      close();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      close();
      resolve(result);
    };
    transaction.onerror = () => fail(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => fail(transaction.error ?? new Error("IndexedDB transaction aborted"));

    try {
      action(transaction.objectStore(STORE), (value) => { result = value; }, fail);
    } catch (error) {
      fail(error);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return runTransaction<T>(mode, (store, setResult, fail) => {
    const request = fn(store);
    request.onsuccess = () => setResult(request.result);
    request.onerror = () => fail(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function enqueueExpense(
  payload: Record<string, unknown>,
  receipts: PendingReceipt[],
  userId: number,
): Promise<PendingExpense> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("An authenticated Technician is required to queue an Expense");
  }

  const timestamp = now();
  const item: PendingExpense = {
    id: createId(),
    userId,
    payload,
    receipts,
    stage: "creation_pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    nextAttemptAt: 0,
  };

  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const items = (request.result as PendingExpense[]).map((value) => normalizeItem(value));
      const bytes = items.reduce((total, queued) => total + receiptBytes(queued.receipts), 0);
      const newBytes = receiptBytes(receipts);
      if (items.length >= MAX_QUEUE_SIZE) {
        fail(new OfflineQueueCapacityError(`Offline queue is limited to ${MAX_QUEUE_SIZE} Expenses`));
        return;
      }
      if (bytes + newBytes > MAX_QUEUE_BYTES) {
        fail(new OfflineQueueCapacityError("Offline Receipt storage limit reached"));
        return;
      }

      const put = store.put(item);
      put.onerror = () => fail(put.error ?? new Error("Could not queue Expense"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not inspect offline queue"));
  });

  return item;
}

export async function updateExpense(item: PendingExpense, expectedLeaseToken?: string): Promise<void> {
  const normalized = normalizeItem(item);
  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.get(normalized.id);
    request.onsuccess = () => {
      const current = request.result ? normalizeItem(request.result) : null;
      if (!current) {
        fail(new Error("Queued Expense no longer exists"));
        return;
      }
      if (expectedLeaseToken && current.leaseToken !== expectedLeaseToken) {
        fail(new OfflineQueueLeaseLostError());
        return;
      }

      const next = expectedLeaseToken && normalized.leaseToken === expectedLeaseToken
        ? { ...normalized, leaseToken: current.leaseToken, leaseUntil: current.leaseUntil }
        : normalized;
      const put = store.put(next);
      put.onerror = () => fail(put.error ?? new Error("Could not update queued Expense"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not update queued Expense"));
  });
}

export async function removePendingExpense(id: string, userId?: number, expectedLeaseToken?: string): Promise<void> {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return;
  const ownerId = userId;
  await runTransaction<void>("readwrite", (store, _setResult, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const item = request.result ? normalizeItem(request.result) : null;
      if (!item || item.userId !== ownerId) return;
      if (expectedLeaseToken && item.leaseToken !== expectedLeaseToken) return;
      if (!expectedLeaseToken && item.leaseToken && item.leaseUntil && item.leaseUntil > now()) return;
      const deletion = store.delete(id);
      deletion.onerror = () => fail(deletion.error ?? new Error("Could not discard queued Expense"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not find queued Expense"));
  });
}

export async function getPendingExpense(id: string, userId?: number): Promise<PendingExpense | null> {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return null;
  const item = await withStore<PendingExpense | undefined>("readonly", (store) => store.get(id));
  if (!item) return null;
  const normalized = normalizeItem(item);
  return normalized.userId === userId ? normalized : null;
}

export async function listPendingExpenses(userId?: number): Promise<PendingExpense[]> {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return [];
  const ownerId = userId;
  const items = await withStore<PendingExpense[]>("readonly", (store) => store.getAll());
  const normalized = items.map((item) => normalizeItem(item));
  return normalized
    .filter((item) => item.userId === ownerId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPendingExpenses(userId?: number): Promise<number> {
  const items = await listPendingExpenses(userId);
  return items.length;
}

/** Atomically claim an eligible item for one tab. */
export async function claimPendingExpense(
  id: string,
  userId: number,
  at = now(),
): Promise<PendingExpense | null> {
  return runTransaction<PendingExpense | null>("readwrite", (store, setResult, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result ? normalizeItem(request.result) : null;
      if (!current || current.userId !== userId || current.error || current.nextAttemptAt > at) {
        setResult(null);
        return;
      }
      if (current.leaseUntil && current.leaseUntil > at) {
        setResult(null);
        return;
      }

      const claimed: PendingExpense = {
        ...current,
        leaseToken: createId(),
        leaseUntil: at + LEASE_DURATION_MS,
        updatedAt: at,
      };
      const put = store.put(claimed);
      put.onsuccess = () => setResult(claimed);
      put.onerror = () => fail(put.error ?? new Error("Could not claim queued Expense"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not claim queued Expense"));
  });
}

export async function retryPendingExpense(id: string, userId: number): Promise<PendingExpense | null> {
  return runTransaction<PendingExpense | null>("readwrite", (store, setResult, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result ? normalizeItem(request.result) : null;
      if (!current || current.userId !== userId || (current.leaseUntil && current.leaseUntil > now())) {
        setResult(null);
        return;
      }
      const retried: PendingExpense = {
        ...current,
        error: undefined,
        errorKind: undefined,
        nextAttemptAt: 0,
        leaseToken: undefined,
        leaseUntil: undefined,
        updatedAt: now(),
      };
      const put = store.put(retried);
      put.onsuccess = () => setResult(retried);
      put.onerror = () => fail(put.error ?? new Error("Could not retry queued Expense"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not retry queued Expense"));
  });
}

export async function renewPendingExpense(item: PendingExpense, at = now()): Promise<PendingExpense | null> {
  if (!item.leaseToken || typeof item.userId !== "number") return null;
  const ownerId = item.userId;
  return runTransaction<PendingExpense | null>("readwrite", (store, setResult, fail) => {
    const request = store.get(item.id);
    request.onsuccess = () => {
      const current = request.result ? normalizeItem(request.result) : null;
      if (!current || current.userId !== ownerId || current.leaseToken !== item.leaseToken) {
        setResult(null);
        return;
      }
      const renewed = { ...current, leaseUntil: at + LEASE_DURATION_MS, updatedAt: at };
      const put = store.put(renewed);
      put.onsuccess = () => setResult(renewed);
      put.onerror = () => fail(put.error ?? new Error("Could not renew queued Expense lease"));
    };
    request.onerror = () => fail(request.error ?? new Error("Could not renew queued Expense lease"));
  });
}

export async function releasePendingExpense(item: PendingExpense): Promise<void> {
  if (!item.leaseToken) return;
  await updateExpense(
    { ...item, leaseToken: undefined, leaseUntil: undefined, updatedAt: now() },
    item.leaseToken,
  );
}

export function getLeaseDurationMs(): number {
  return LEASE_DURATION_MS;
}
